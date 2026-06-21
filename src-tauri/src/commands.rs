//! Tauri 命令模块 - 暴露给前端的所有 IPC 入口

use crate::project::{Project, ProjectSummary};
use crate::storage::Storage;
use crate::AppConfig;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Chapter {
    pub id: String,
    pub volume_id: String,
    pub title: String,
    pub order: u32,
    pub word_count: u32,
    pub status: String,
    pub content: String,
    pub outline: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub synopsis: String,
    pub target_words: u32,
    pub daily_goal: u32,
}

/// 创建新作品
#[tauri::command]
pub fn create_project(
    storage: State<Storage>,
    config: State<AppConfig>,
    req: CreateProjectRequest,
) -> Result<Project, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let project = Project {
        id: id.clone(),
        name: req.name,
        synopsis: req.synopsis,
        target_words: req.target_words,
        daily_goal: req.daily_goal,
        created_at: now.clone(),
        updated_at: now,
        cover: None,
    };
    storage
        .create_project(&config.projects_dir, &project)
        .map_err(|e| e.to_string())?;
    Ok(project)
}

/// 列出所有作品
#[tauri::command]
pub fn list_projects(
    storage: State<Storage>,
    config: State<AppConfig>,
) -> Result<Vec<ProjectSummary>, String> {
    storage
        .list_projects(&config.projects_dir)
        .map_err(|e| e.to_string())
}

/// 打开作品(读取完整结构)
#[tauri::command]
pub fn open_project(
    storage: State<Storage>,
    config: State<AppConfig>,
    project_id: String,
) -> Result<Project, String> {
    storage
        .open_project(&config.projects_dir, &project_id)
        .map_err(|e| e.to_string())
}

/// 删除作品
#[tauri::command]
pub fn delete_project(
    storage: State<Storage>,
    config: State<AppConfig>,
    project_id: String,
) -> Result<(), String> {
    storage
        .delete_project(&config.projects_dir, &project_id)
        .map_err(|e| e.to_string())
}

/// 创建章节
#[tauri::command]
pub fn create_chapter(
    storage: State<Storage>,
    config: State<AppConfig>,
    project_id: String,
    volume_id: String,
    title: String,
) -> Result<Chapter, String> {
    let chapter = storage
        .create_chapter(&config.projects_dir, &project_id, &volume_id, &title)
        .map_err(|e| e.to_string())?;
    Ok(chapter)
}

/// 列出章节
#[tauri::command]
pub fn list_chapters(
    storage: State<Storage>,
    config: State<AppConfig>,
    project_id: String,
) -> Result<Vec<Chapter>, String> {
    storage
        .list_chapters(&config.projects_dir, &project_id)
        .map_err(|e| e.to_string())
}

/// 加载章节内容
#[tauri::command]
pub fn load_chapter(
    storage: State<Storage>,
    config: State<AppConfig>,
    project_id: String,
    chapter_id: String,
) -> Result<Chapter, String> {
    storage
        .load_chapter(&config.projects_dir, &project_id, &chapter_id)
        .map_err(|e| e.to_string())
}

/// 保存章节内容
#[tauri::command]
pub fn save_chapter(
    storage: State<Storage>,
    config: State<AppConfig>,
    project_id: String,
    chapter_id: String,
    content: String,
    outline: String,
) -> Result<(), String> {
    storage
        .save_chapter(&config.projects_dir, &project_id, &chapter_id, &content, &outline)
        .map_err(|e| e.to_string())
}

/// 删除章节
#[tauri::command]
pub fn delete_chapter(
    storage: State<Storage>,
    config: State<AppConfig>,
    project_id: String,
    chapter_id: String,
) -> Result<(), String> {
    storage
        .delete_chapter(&config.projects_dir, &project_id, &chapter_id)
        .map_err(|e| e.to_string())
}
