//! Embedding 抽象层
//!
//! Stage 1: 仅占位(返回空向量)。FTS5 已能处理 80% 的检索需求。
//! Stage 2: 接入 ort + tokenizers 跑 BGE-small-zh 本地推理。
//!
//! 接口已稳定,后续只需替换内部实现。

pub struct Embedder {
    dim: usize,
}

impl Embedder {
    /// 加载(Stage 1: 仅记录维度,不做实际加载)
    pub fn load(_model_dir: &std::path::Path) -> Result<Self, String> {
        Ok(Self { dim: 512 })
    }

    pub fn dim(&self) -> usize {
        self.dim
    }

    /// Stage 1 stub:返回零向量(语义检索将不可用,FTS5 仍可用)
    pub fn embed(&self, _text: &str) -> Result<Vec<f32>, String> {
        Ok(vec![0.0; self.dim])
    }

    pub fn embed_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>, String> {
        Ok(texts.iter().map(|_| vec![0.0; self.dim]).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_returns_512_dim() {
        let e = Embedder::load(std::path::Path::new(".")).unwrap();
        assert_eq!(e.dim(), 512);
    }

    #[test]
    fn embed_returns_512_dim() {
        let e = Embedder::load(std::path::Path::new(".")).unwrap();
        let v = e.embed("test").unwrap();
        assert_eq!(v.len(), 512);
    }
}
