//! 项目数据模型

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub synopsis: String,
    pub target_words: u32,
    pub daily_goal: u32,
    pub created_at: String,
    pub updated_at: String,
    pub cover: Option<String>,
}

/// 项目摘要(用于列表展示,不包含完整结构)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub synopsis: String,
    pub word_count: u32,
    pub target_words: u32,
    pub status: String, // "draft" | "ongoing" | "finished"
    pub created_at: String,
    pub updated_at: String,
    pub last_chapter_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Volume {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub order: u32,
    pub summary: String,
}
