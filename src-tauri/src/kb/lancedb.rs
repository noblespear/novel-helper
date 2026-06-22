//! 向量索引占位
//!
//! Stage 1: 仅占位接口,实际不存储向量。
//! Stage 2: 替换为 sqlite-vss / hnswlib-rs / 等等。
//!
//! 设计理由: lance + lancedb 0.13 在当前 Rust 编译器上触发递归深度限制
//! (lance 内部依赖 datafusion,类型嵌套太深)。Stage 1 先把 FTS5 跑通。

use crate::kb::SearchHit;

pub struct VectorIndex;

impl VectorIndex {
    pub fn open(_path: &std::path::Path) -> Result<Self, String> {
        Ok(Self)
    }

    pub fn clear(&self) -> Result<(), String> {
        Ok(())
    }

    pub fn insert(&self, _chunks_with_vecs: &[(crate::kb::chunker::Chunk, Vec<f32>)]) -> Result<(), String> {
        Ok(())
    }

    pub fn count(&self) -> Result<usize, String> {
        Ok(0)
    }

    pub fn search(&self, _query_vec: &[f32], _limit: usize) -> Result<Vec<SearchHit>, String> {
        Ok(vec![])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_works() {
        let _ = VectorIndex::open(std::path::Path::new(".")).unwrap();
    }

    #[test]
    fn count_starts_at_zero() {
        let idx = VectorIndex::open(std::path::Path::new(".")).unwrap();
        assert_eq!(idx.count().unwrap(), 0);
    }

    #[test]
    fn search_returns_empty() {
        let idx = VectorIndex::open(std::path::Path::new(".")).unwrap();
        let hits = idx.search(&[0.0; 512], 5).unwrap();
        assert!(hits.is_empty());
    }
}
