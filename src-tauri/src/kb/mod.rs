//! 知识库模块
//!
//! 每本小说一个独立的知识库,包含:
//! - FTS5 全文索引(SQLite 内置,中文 jieba 分词)
//! - LanceDB 向量索引(BGE-small-zh 本地 embedding)
//!
//! 使用模式:章节/大纲/设定 → 分块 → 同时入 FTS5 和 LanceDB

pub mod chunker;
pub mod downloader;
pub mod embedder;
pub mod fts;
pub mod lancedb;
pub mod pipeline;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const DEFAULT_MODEL_REPO: &str = "BAAI/bge-small-zh-v1.5";
pub const DEFAULT_MODEL_DIM: usize = 512;
pub const DEFAULT_CHUNK_SIZE: usize = 500;
pub const DEFAULT_CHUNK_OVERLAP: usize = 50;

/// KB 元信息,持久化到 <project>/kb/meta.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KbMeta {
    pub embedding_model: String,
    pub embedding_dim: usize,
    pub chunk_size: usize,
    pub chunk_overlap: usize,
    pub last_rebuild_ts: i64,
    /// 模型本地路径
    pub model_local_path: PathBuf,
    /// 是否是首次自动下载
    pub auto_download: bool,
}

impl Default for KbMeta {
    fn default() -> Self {
        Self {
            embedding_model: DEFAULT_MODEL_REPO.to_string(),
            embedding_dim: DEFAULT_MODEL_DIM,
            chunk_size: DEFAULT_CHUNK_SIZE,
            chunk_overlap: DEFAULT_CHUNK_OVERLAP,
            last_rebuild_ts: 0,
            model_local_path: PathBuf::new(),
            auto_download: true,
        }
    }
}

/// KB 状态(给前端展示)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KbStatus {
    pub exists: bool,
    pub last_rebuild_ts: i64,
    pub chunk_count: usize,
    pub model_status: ModelStatus,
    pub dirty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ModelStatus {
    /// 模型未下载
    NotDownloaded {
        /// 用户应自行下载到的目录
        manual_path: PathBuf,
        /// HuggingFace 仓库地址
        hf_url: String,
        /// 需要的文件列表
        files: Vec<String>,
    },
    /// 正在下载
    Downloading { progress: f32 },
    /// 已就绪
    Ready { path: PathBuf, dim: usize },
    /// 加载失败
    Error { message: String },
}

/// 单条检索命中
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub chunk_id: String,
    pub source: String,         // "chapter:xxx" / "outline" / "character:yyy"
    pub text: String,
    pub score: f32,
    pub metadata: serde_json::Value,
}

/// 重建结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebuildResult {
    pub chunks_total: usize,
    pub duration_ms: u64,
    pub last_rebuild_ts: i64,
}
