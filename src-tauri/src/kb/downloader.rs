//! Embedding 模型下载
//!
//! 从 HuggingFace 下载 BGE-small-zh-v1.5 所需文件:
//! - model.onnx (主模型,~100MB)
//! - tokenizer.json (分词器配置)
//!
//! 下载到 <user_data>/models/<model_name>/
//! 失败时返回 ModelStatus::NotDownloaded,告知用户手动下载的路径

use crate::kb::ModelStatus;
use futures::StreamExt;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

const HF_BASE: &str = "https://huggingface.co";

/// 模型文件清单(BGE-small-zh-v1.5)
pub fn required_files() -> Vec<(&'static str, &'static str)> {
    vec![
        ("model.onnx", "onnx/model.onnx"),
        ("tokenizer.json", "tokenizer.json"),
    ]
}

pub fn model_dir(user_data_dir: &Path, model_repo: &str) -> PathBuf {
    let safe_name = model_repo.replace('/', "_");
    user_data_dir.join("models").join(safe_name)
}

pub fn hf_url(model_repo: &str, file_path: &str) -> String {
    format!("{}/{}/resolve/main/{}", HF_BASE, model_repo, file_path)
}

/// 同步下载单个文件(带进度回调,简单版)
async fn download_file(
    url: &str,
    dest: &Path,
    on_progress: impl Fn(u64, u64),
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {}", e))?;
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("client: {}", e))?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("GET {}: {}", url, e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}: {}", resp.status(), url));
    }
    let total = resp.content_length().unwrap_or(0);
    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| format!("create: {}", e))?;
    let mut downloaded: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("chunk: {}", e))?;
        tokio::io::AsyncWriteExt::write_all(&mut file, &bytes)
            .await
            .map_err(|e| format!("write: {}", e))?;
        downloaded += bytes.len() as u64;
        on_progress(downloaded, total);
    }
    Ok(())
}

/// 尝试下载,失败返回详细 manual 路径信息
pub async fn try_download(
    model_repo: &str,
    user_data_dir: &Path,
) -> Result<PathBuf, ModelStatus> {
    let dir = model_dir(user_data_dir, model_repo);
    if dir.join("model.onnx").exists() && dir.join("tokenizer.json").exists() {
        return Ok(dir);
    }

    let files = required_files();
    let total = files.len();
    for (i, (dest_name, src_path)) in files.iter().enumerate() {
        let dest = dir.join(dest_name);
        let url = hf_url(model_repo, src_path);
        eprintln!("[kb] downloading {}/{}: {}", i + 1, total, url);
        if let Err(_e) = download_file(&url, &dest, |cur, total| {
            if total > 0 {
                let pct = (cur as f64 / total as f64) * 100.0;
                eprintln!("[kb]   {}: {:.1}%", dest_name, pct);
            }
        })
        .await
        {
            // 失败:清理,返回 manual 指引
            let _ = std::fs::remove_dir_all(&dir);
            return Err(manual_path_info(
                &dir.parent().unwrap_or(&dir),
                model_repo,
            ));
        }
    }
    Ok(dir)
}

/// 校验已下载模型(简单:检查文件存在)
pub fn verify_model(dir: &Path) -> bool {
    dir.join("model.onnx").exists() && dir.join("tokenizer.json").exists()
}

/// 算 sha256(暂未使用,留给未来校验)
#[allow(dead_code)]
pub fn file_sha256(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    h.update(&bytes);
    Ok(format!("{:x}", h.finalize()))
}

/// 构造 manual 指引(下载失败时返回)
pub fn manual_path_info(user_data_dir: &Path, model_repo: &str) -> ModelStatus {
    let dir = model_dir(user_data_dir, model_repo);
    let files: Vec<String> = required_files().into_iter().map(|(d, _)| d.to_string()).collect();
    ModelStatus::NotDownloaded {
        manual_path: dir,
        hf_url: format!("{}/{}", HF_BASE, model_repo),
        files,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn required_files_listed() {
        let f = required_files();
        assert!(f.iter().any(|(d, _)| *d == "model.onnx"));
        assert!(f.iter().any(|(d, _)| *d == "tokenizer.json"));
    }

    #[test]
    fn model_dir_sanitized() {
        let p = model_dir(Path::new("/tmp"), "BAAI/bge-small-zh-v1.5");
        assert!(p.to_string_lossy().contains("BAAI_bge-small-zh-v1.5"));
        assert!(!p.to_string_lossy().contains("BAAI/"));
    }

    #[test]
    fn hf_url_constructed() {
        let u = hf_url("BAAI/bge-small-zh-v1.5", "model.onnx");
        assert!(u.contains("huggingface.co"));
        assert!(u.contains("BAAI/bge-small-zh-v1.5"));
        assert!(u.contains("model.onnx"));
    }

    #[test]
    fn manual_path_info_returns_expected_fields() {
        let status = manual_path_info(Path::new("/tmp/test"), "BAAI/bge-small-zh-v1.5");
        match status {
            ModelStatus::NotDownloaded {
                manual_path,
                hf_url,
                files,
            } => {
                assert!(manual_path.to_string_lossy().contains("BAAI_bge-small-zh-v1.5"));
                assert!(hf_url.contains("BAAI/bge-small-zh-v1.5"));
                assert!(files.contains(&"model.onnx".to_string()));
            }
            _ => panic!("expected NotDownloaded"),
        }
    }
}
