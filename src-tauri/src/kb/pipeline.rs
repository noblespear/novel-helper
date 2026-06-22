//! 知识库 pipeline:把项目内容写入 FTS5 + LanceDB

use crate::kb::chunker::{chunk_text, Chunk};
use crate::kb::embedder::Embedder;
use crate::kb::fts::FtsIndex;
use crate::kb::lancedb::VectorIndex;
use crate::kb::{KbMeta, RebuildResult, SearchHit, DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// 项目的 KB 路径
#[derive(Debug, Clone)]
pub struct KbPaths {
    pub project_dir: PathBuf,
    pub kb_dir: PathBuf,
    pub fts_db: PathBuf,
    pub vector_dir: PathBuf,
    pub meta_file: PathBuf,
}

impl KbPaths {
    pub fn for_project(project_dir: &Path) -> Self {
        let kb_dir = project_dir.join("kb");
        Self {
            project_dir: project_dir.to_path_buf(),
            fts_db: kb_dir.join("chunks.sqlite"),
            vector_dir: kb_dir.join("vectors.lance"),
            meta_file: kb_dir.join("meta.json"),
            kb_dir,
        }
    }
}

pub struct KbPipeline {
    pub paths: KbPaths,
    pub fts: FtsIndex,
    pub vector: VectorIndex,
    pub meta: KbMeta,
    /// 懒加载的 embedder(None 表示还没初始化)
    pub embedder: Option<Arc<Embedder>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceContent {
    /// 来源 id(同 chunker source),如 "chapter:abc123"
    pub source: String,
    pub text: String,
}

impl KbPipeline {
    pub fn open(paths: KbPaths, meta: KbMeta) -> Result<Self, String> {
        std::fs::create_dir_all(&paths.kb_dir).map_err(|e| e.to_string())?;
        let fts = FtsIndex::open(&paths.fts_db)?;
        let vector = VectorIndex::open(&paths.vector_dir)?;
        Ok(Self {
            paths,
            fts,
            vector,
            meta,
            embedder: None,
        })
    }

    pub fn try_load_embedder(&mut self) -> Result<(), String> {
        if self.embedder.is_some() {
            return Ok(());
        }
        if !self.meta.model_local_path.as_os_str().is_empty()
            && self.meta.model_local_path.exists()
        {
            let e = Embedder::load(&self.meta.model_local_path)?;
            self.embedder = Some(Arc::new(e));
            Ok(())
        } else {
            Err("模型未下载".to_string())
        }
    }

    /// 全量重建:清空 + 重新插入
    pub fn rebuild(&mut self, sources: &[SourceContent]) -> Result<RebuildResult, String> {
        let start = std::time::Instant::now();

        // 1) 切块
        let mut all_chunks: Vec<Chunk> = Vec::new();
        for src in sources {
            let chunks = chunk_text(
                &src.text,
                &src.source,
                self.meta.chunk_size.max(100),
                self.meta.chunk_overlap.min(self.meta.chunk_size / 2),
            );
            all_chunks.extend(chunks);
        }

        // 2) FTS5:不需要 embedding,直接插入
        self.fts.clear()?;
        self.fts.insert(&all_chunks)?;

        // 3) LanceDB:需要 embedding
        if let Some(emb) = &self.embedder {
            self.vector.clear()?;
            let mut with_vecs: Vec<(Chunk, Vec<f32>)> = Vec::with_capacity(all_chunks.len());
            for c in &all_chunks {
                let v = emb.embed(&c.text)?;
                with_vecs.push((c.clone(), v));
            }
            self.vector.insert(&with_vecs)?;
        }
        // 如果没 embedder,只建 FTS5 索引

        // 4) 更新 meta
        self.meta.last_rebuild_ts = chrono::Utc::now().timestamp();
        save_meta(&self.paths, &self.meta)?;

        Ok(RebuildResult {
            chunks_total: all_chunks.len(),
            duration_ms: start.elapsed().as_millis() as u64,
            last_rebuild_ts: self.meta.last_rebuild_ts,
        })
    }

    /// 关键词检索
    pub fn search_fts(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
        self.fts.search(query, limit)
    }

    /// 语义检索
    pub fn search_semantic(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
        let emb = self
            .embedder
            .as_ref()
            .ok_or("模型未加载,无法语义检索")?;
        let vec = emb.embed(query)?;
        self.vector.search(&vec, limit)
    }

    /// 混合检索(简单实现:同时跑 fts 和 semantic,按 score 合并去重)
    pub fn search_hybrid(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
        let fts_hits = self.fts.search(query, limit).unwrap_or_default();
        let sem_hits = if self.embedder.is_some() {
            self.search_semantic(query, limit).unwrap_or_default()
        } else {
            vec![]
        };

        // 合并:同 chunk_id 累加,不同都保留
        let mut combined: std::collections::HashMap<String, SearchHit> =
            std::collections::HashMap::new();
        for h in fts_hits {
            combined
                .entry(h.chunk_id.clone())
                .and_modify(|e| e.score = (e.score + h.score).min(1.0))
                .or_insert(h);
        }
        for h in sem_hits {
            combined
                .entry(h.chunk_id.clone())
                .and_modify(|e| e.score = (e.score + h.score).min(1.0))
                .or_insert(h);
        }
        let mut all: Vec<SearchHit> = combined.into_values().collect();
        all.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        all.truncate(limit);
        Ok(all)
    }
}

pub fn save_meta(paths: &KbPaths, meta: &KbMeta) -> Result<(), String> {
    if let Some(parent) = paths.meta_file.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    std::fs::write(&paths.meta_file, json).map_err(|e| e.to_string())
}

pub fn load_meta(paths: &KbPaths) -> Result<KbMeta, String> {
    if !paths.meta_file.exists() {
        let mut m = KbMeta::default();
        m.model_local_path = crate::kb::downloader::model_dir(
            &paths.kb_dir.parent().unwrap_or(&paths.kb_dir),
            &m.embedding_model,
        );
        return Ok(m);
    }
    let s = std::fs::read_to_string(&paths.meta_file).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp_project() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("novelhelper_kb_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn paths_for_project() {
        let p = KbPaths::for_project(&PathBuf::from("/tmp/proj"));
        assert!(p.kb_dir.to_string_lossy().contains("kb"));
        assert!(p.fts_db.to_string_lossy().ends_with("chunks.sqlite"));
        assert!(p.vector_dir.to_string_lossy().ends_with("vectors.lance"));
    }

    #[test]
    fn open_creates_indexes() {
        let p = tmp_project();
        let paths = KbPaths::for_project(&p);
        let meta = KbMeta::default();
        let _kb = KbPipeline::open(paths, meta).unwrap();
    }

    #[test]
    fn rebuild_fts_only_when_no_embedder() {
        let p = tmp_project();
        let paths = KbPaths::for_project(&p);
        let meta = KbMeta::default();
        let mut kb = KbPipeline::open(paths, meta).unwrap();
        let sources = vec![SourceContent {
            source: "chapter:c1".into(),
            text: "林枫走进了青竹林。\n\n苏婉在采药。".into(),
        }];
        let r = kb.rebuild(&sources).unwrap();
        assert!(r.chunks_total >= 1);
        let hits = kb.search_fts("林枫", 5).unwrap();
        assert!(!hits.is_empty());
    }

    #[test]
    fn hybrid_merges_results() {
        let p = tmp_project();
        let paths = KbPaths::for_project(&p);
        let meta = KbMeta::default();
        let mut kb = KbPipeline::open(paths, meta).unwrap();
        let sources = vec![
            SourceContent {
                source: "chapter:c1".into(),
                text: "林枫走进了青竹林。".into(),
            },
            SourceContent {
                source: "chapter:c2".into(),
                text: "苏婉在山中采药。".into(),
            },
        ];
        kb.rebuild(&sources).unwrap();
        let hits = kb.search_hybrid("林枫", 5).unwrap();
        assert!(!hits.is_empty());
        // FTS 命中的 c1 应该在前面
        assert_eq!(hits[0].source, "chapter:c1");
    }

    #[test]
    fn save_and_load_meta() {
        let p = tmp_project();
        let paths = KbPaths::for_project(&p);
        let mut meta = KbMeta::default();
        meta.last_rebuild_ts = 12345;
        save_meta(&paths, &meta).unwrap();
        let loaded = load_meta(&paths).unwrap();
        assert_eq!(loaded.last_rebuild_ts, 12345);
    }
}
