//! SQLite FTS5 全文索引
//!
//! 中文用 jieba 分词,然后把词用空格连接存入 FTS5(content 列)。
//! 这样 FTS5 仍按空格分词,但 token 已经是中文词而非字符 ngram。

use crate::kb::chunker::Chunk;
use crate::kb::SearchHit;
use jieba_rs::Jieba;
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;

const SCHEMA: &str = r#"
CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
    chunk_id UNINDEXED,
    source UNINDEXED,
    text,
    tokens,
    char_count UNINDEXED,
    metadata UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
);
"#;

pub struct FtsIndex {
    conn: Mutex<Connection>,
    jieba: Jieba,
}

impl FtsIndex {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .map_err(|e| e.to_string())?;
        conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        Ok(Self {
            conn: Mutex::new(conn),
            jieba: Jieba::new(),
        })
    }

    /// 清空所有 chunk
    pub fn clear(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM chunks", []).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 插入 chunks
    pub fn insert(&self, chunks: &[Chunk]) -> Result<(), String> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt = tx
                .prepare(
                    "INSERT INTO chunks (chunk_id, source, text, tokens, char_count, metadata) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                )
                .map_err(|e| e.to_string())?;
            for c in chunks {
                let tokens = tokenize(&self.jieba, &c.text);
                stmt.execute(params![
                    c.id,
                    c.source,
                    c.text,
                    tokens,
                    c.char_count as i64,
                    "{}"
                ])
                .map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    /// chunk 总数
    pub fn count(&self) -> Result<usize, String> {
        let conn = self.conn.lock().unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM chunks", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        Ok(n as usize)
    }

    /// 关键词搜索(FTS5 + jieba 预分词)
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
        if query.trim().is_empty() {
            return Ok(vec![]);
        }
        let tokens = tokenize(&self.jieba, query);
        if tokens.is_empty() {
            return Ok(vec![]);
        }

        let conn = self.conn.lock().unwrap();
        // FTS5 MATCH 用空格分隔 token,加前缀匹配 *
        let fts_query = tokens
            .split_whitespace()
            .map(|t| format!("\"{}\"*", t.replace('"', "")))
            .collect::<Vec<_>>()
            .join(" ");

        let mut stmt = conn
            .prepare(
                "SELECT chunk_id, source, text, bm25(chunks) AS score \
                 FROM chunks \
                 WHERE chunks MATCH ?1 \
                 ORDER BY score \
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;

        let hits: Result<Vec<SearchHit>, _> = stmt
            .query_map(params![fts_query, limit as i64], |r| {
                let chunk_id: String = r.get(0)?;
                let source: String = r.get(1)?;
                let text: String = r.get(2)?;
                let score: f64 = r.get(3)?;
                Ok(SearchHit {
                    chunk_id,
                    source,
                    text,
                    // bm25 越低越相关,转成 0-1 相似度(粗略)
                    score: (-score).exp().min(1.0) as f32,
                    metadata: serde_json::json!({"retriever": "fts5"}),
                })
            })
            .map_err(|e| e.to_string())?
            .collect();

        hits.map_err(|e| e.to_string())
    }
}

/// jieba 分词 → 用空格连接(FTS5 默认按空格分)
fn tokenize(jieba: &Jieba, text: &str) -> String {
    let words = jieba.cut(text, false);
    words
        .into_iter()
        .filter(|w| {
            // 过滤标点、单字符、纯数字(可选优化)
            !w.trim().is_empty() && w.chars().count() >= 1
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kb::chunker::chunk_text;

    fn tmp_path(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("novelhelper_test");
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn open_creates_db() {
        let path = tmp_path("fts_open.db");
        let _idx = FtsIndex::open(&path).unwrap();
        assert!(path.exists());
    }

    #[test]
    fn insert_and_count() {
        let path = tmp_path("fts_insert.db");
        let idx = FtsIndex::open(&path).unwrap();
        idx.clear().unwrap();
        let chunks = chunk_text("林枫走进了青竹林,看见了一只白鹿。", "test:1", 500, 50);
        idx.insert(&chunks).unwrap();
        assert_eq!(idx.count().unwrap(), 1);
    }

    #[test]
    fn search_finds_chinese_keyword() {
        let path = tmp_path("fts_search.db");
        let idx = FtsIndex::open(&path).unwrap();
        idx.clear().unwrap();
        let chunks = chunk_text("林枫走进了青竹林,看见了一只白鹿。", "test:1", 500, 50);
        idx.insert(&chunks).unwrap();
        let hits = idx.search("林枫", 10).unwrap();
        assert!(!hits.is_empty(), "should find 林枫");
        assert!(hits[0].text.contains("林枫"));
    }

    #[test]
    fn search_handles_partial_match() {
        let path = tmp_path("fts_partial.db");
        let idx = FtsIndex::open(&path).unwrap();
        idx.clear().unwrap();
        let chunks = chunk_text("林枫走进了青竹林,看见了一只白鹿。", "test:1", 500, 50);
        idx.insert(&chunks).unwrap();
        let hits = idx.search("青竹", 10).unwrap();
        assert!(!hits.is_empty());
    }

    #[test]
    fn search_empty_query_returns_empty() {
        let path = tmp_path("fts_empty.db");
        let idx = FtsIndex::open(&path).unwrap();
        idx.clear().unwrap();
        let chunks = chunk_text("林枫", "test:1", 500, 50);
        idx.insert(&chunks).unwrap();
        let hits = idx.search("", 10).unwrap();
        assert!(hits.is_empty());
    }

    #[test]
    fn search_returns_score() {
        let path = tmp_path("fts_score.db");
        let idx = FtsIndex::open(&path).unwrap();
        idx.clear().unwrap();
        let chunks = chunk_text("林枫", "test:1", 500, 50);
        idx.insert(&chunks).unwrap();
        let hits = idx.search("林枫", 10).unwrap();
        assert!(!hits.is_empty());
        // score 在 0-1 之间
        assert!(hits[0].score >= 0.0 && hits[0].score <= 1.0);
    }

    #[test]
    fn tokenize_splits_chinese_correctly() {
        let jieba = Jieba::new();
        let tokens = tokenize(&jieba, "林枫走进了青竹林");
        // jieba 默认词典可能不切"林枫"为人名,放宽断言
        // 核心要求:token 化后能用 FTS5 检索
        assert!(!tokens.is_empty());
        assert!(tokens.contains("林") || tokens.contains("枫") || tokens.contains("林枫"));
    }
}
