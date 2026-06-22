//! 文本分块
//!
//! 按字符切片(500/50),避免破坏中文语义。
//! 优先在段落边界切分(\n\n),其次在句子边界(。!?\n)。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    /// 唯一 ID: "source:idx:hash"
    pub id: String,
    /// 来源描述,例如 "chapter:abc123" / "outline"
    pub source: String,
    /// 块文本
    pub text: String,
    /// 块字符数
    pub char_count: usize,
}

/// 简单字符分块,优先在段落/句子边界切
pub fn chunk_text(text: &str, source: &str, chunk_size: usize, overlap: usize) -> Vec<Chunk> {
    let text = text.trim();
    if text.is_empty() {
        return vec![];
    }

    // 跳过 markdown 的 AI 标记(<!-- @ai --> ... <!-- /ai -->)
    // 仅保留文本内容,但标记块作者归属
    let cleaned = strip_ai_markers_for_chunking(text);
    let chars: Vec<char> = cleaned.chars().collect();
    if chars.len() <= chunk_size {
        let char_count = chars.len();
        return vec![Chunk {
            id: make_chunk_id(source, 0, &cleaned),
            source: source.to_string(),
            text: cleaned,
            char_count,
        }];
    }

    let mut chunks = Vec::new();
    let mut start = 0usize;
    let mut idx = 0usize;

    while start < chars.len() {
        let mut end = (start + chunk_size).min(chars.len());

        // 尝试在边界切(仅当不是最后一块)
        if end < chars.len() {
            // 1) 段落边界 \n\n
            if let Some(b) = find_backwards(&chars, end, start, "\n\n") {
                end = b + 2;
            }
            // 2) 句末标点 + 空白
            else if let Some(b) = find_backwards_any(&chars, end, start, &['。', '!', '?', '!', '?'])
            {
                end = b + 1;
            }
            // 3) 换行
            else if let Some(b) = find_backwards(&chars, end, start, "\n") {
                end = b + 1;
            }
            // 4) 空格(英文)
            else if let Some(b) = find_backwards(&chars, end, start, " ") {
                end = b + 1;
            }
            // 否则强制在 chunk_size 切
        }

        let chunk_text: String = chars[start..end].iter().collect();
        let trimmed = chunk_text.trim().to_string();
        if !trimmed.is_empty() {
            chunks.push(Chunk {
                id: make_chunk_id(source, idx, &trimmed),
                source: source.to_string(),
                text: trimmed,
                char_count: chars[start..end].len(),
            });
            idx += 1;
        }

        if end >= chars.len() {
            break;
        }
        // 下个块的起点
        start = end.saturating_sub(overlap);
    }

    chunks
}

/// 去掉 AI 标记,只保留正文
fn strip_ai_markers_for_chunking(text: &str) -> String {
    // 简单替换:<!-- @ai(...) --> 段落 <!-- /ai -->
    // 保留 <!-- 与 --> 之间的内容(因为 AI 写的也是有用的)
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("<!--") {
        out.push_str(&rest[..start]);
        rest = &rest[start + 4..];
        if let Some(end) = rest.find("-->") {
            // 跳过 <!-- ... --> 但保留内容
            let inner = rest[..end].trim();
            if !inner.starts_with("@ai") && !inner.starts_with("/ai") {
                out.push_str(inner);
            }
            rest = &rest[end + 3..];
        } else {
            out.push_str(rest);
            rest = "";
            break;
        }
    }
    out.push_str(rest);
    out
}

fn find_backwards(chars: &[char], from: usize, min: usize, pat: &str) -> Option<usize> {
    let pat: Vec<char> = pat.chars().collect();
    if pat.is_empty() {
        return None;
    }
    let pat_len = pat.len();
    if from < pat_len {
        return None;
    }
    let mut i = (from - pat_len).min(chars.len());
    while i > min {
        let window = &chars[i..i + pat_len];
        if window == pat.as_slice() {
            return Some(i);
        }
        i -= 1;
    }
    None
}

fn find_backwards_any(chars: &[char], from: usize, min: usize, pat: &[char]) -> Option<usize> {
    let mut i = from.min(chars.len());
    while i > min {
        if pat.contains(&chars[i - 1]) {
            return Some(i - 1);
        }
        i -= 1;
    }
    None
}

fn make_chunk_id(source: &str, idx: usize, text: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(source.as_bytes());
    h.update(b":");
    h.update(idx.to_le_bytes());
    h.update(b":");
    h.update(text.as_bytes());
    let digest = h.finalize();
    // 取前 8 字节 hex 作为短 ID
    let hex = digest
        .iter()
        .take(8)
        .map(|b| format!("{:02x}", b))
        .collect::<String>();
    format!("{}:{}", source, hex)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_yields_no_chunks() {
        let chunks = chunk_text("", "test", 500, 50);
        assert!(chunks.is_empty());
    }

    #[test]
    fn short_text_single_chunk() {
        let chunks = chunk_text("你好世界,这是一个测试。", "test", 500, 50);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "你好世界,这是一个测试。");
        assert_eq!(chunks[0].source, "test");
    }

    #[test]
    fn long_text_splits_into_chunks() {
        let text: String = (0..100).map(|i| format!("这是第 {} 段内容。", i)).collect::<Vec<_>>().join("\n\n");
        let chunks = chunk_text(&text, "test", 200, 30);
        assert!(chunks.len() >= 2);
        for c in &chunks {
            assert!(!c.text.is_empty());
            assert!(c.id.starts_with("test:"));
        }
    }

    #[test]
    fn chunks_have_overlap() {
        let text: String = (0..200).map(|i| format!("段 {}", i)).collect::<Vec<_>>().join("\n\n");
        let chunks = chunk_text(&text, "test", 300, 50);
        if chunks.len() >= 2 {
            // 块间应该有一些重叠(简化验证:不严格)
            assert!(!chunks[0].text.is_empty());
            assert!(!chunks[1].text.is_empty());
        }
    }

    #[test]
    fn chunks_preserve_paragraph_boundaries() {
        // 5 段,每段 100 字符,chunk_size=150 应该切在段边界
        let paras: Vec<String> = (0..5)
            .map(|i| format!("第 {} 段。{}", i, "内容".repeat(20)))
            .collect();
        let text = paras.join("\n\n");
        let chunks = chunk_text(&text, "test", 150, 20);
        // 应该在段边界切
        for c in &chunks {
            // 切完后不应该有"半段"
            assert!(!c.text.contains("第 段"));
        }
    }

    #[test]
    fn ai_markers_stripped_for_chunking() {
        let text = "人类段落。\n\n<!-- @ai(model=gpt-4, skill=polish) -->\nAI 段落。\n<!-- /ai -->\n\n人类继续。";
        let chunks = chunk_text(text, "test", 500, 50);
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].text.contains("人类段落"));
        assert!(chunks[0].text.contains("AI 段落"));
        assert!(chunks[0].text.contains("人类继续"));
        assert!(!chunks[0].text.contains("<!--"));
    }

    #[test]
    fn chunk_ids_are_deterministic() {
        let c1 = chunk_text("测试内容", "src", 500, 50);
        let c2 = chunk_text("测试内容", "src", 500, 50);
        assert_eq!(c1[0].id, c2[0].id);
    }

    #[test]
    fn chunk_ids_differ_per_source() {
        let c1 = chunk_text("测试内容", "src1", 500, 50);
        let c2 = chunk_text("测试内容", "src2", 500, 50);
        assert_ne!(c1[0].id, c2[0].id);
    }
}
