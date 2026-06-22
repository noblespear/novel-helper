//! Tauri 命令模块 - 暴露给前端的所有 IPC 入口

use crate::ai::{ChatMessage, ChatRequest, ProviderConfig, ProviderRegistry};
use crate::ai_state::{AISettings, AIState};
use crate::project::{Project, ProjectSummary};
use crate::storage::Storage;
use crate::AppConfig;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};
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

// =================== AI 命令 ===================

/// 获取 AI 设置
#[tauri::command]
pub fn get_ai_settings(ai_state: State<AIState>) -> AISettings {
    let s = ai_state.settings.lock().unwrap();
    AISettings {
        config: s.config.clone(),
        prompt_templates: s.prompt_templates.clone(),
    }
}

/// 更新 AI Provider 配置
#[tauri::command]
pub fn update_ai_config(
    ai_state: State<AIState>,
    new_config: ProviderConfig,
) -> Result<ProviderConfig, String> {
    ai_state.update_config(new_config.clone())?;
    Ok(new_config)
}

/// 列出可用模型(由当前 provider 返回)
#[tauri::command]
pub async fn list_ai_models(
    ai_state: State<'_, AIState>,
) -> Result<Vec<String>, String> {
    let config = ai_state.get_config();
    let registry = ProviderRegistry::new(config);
    registry.list_models().await
}

/// 验证 API key
#[tauri::command]
pub async fn validate_ai_key(
    ai_state: State<'_, AIState>,
) -> Result<bool, String> {
    let config = ai_state.get_config();
    let registry = ProviderRegistry::new(config);
    registry.validate().await
}

/// 流式 AI 聊天 - 通过 Tauri Channel 推送增量
#[tauri::command]
pub async fn ai_chat_stream(
    ai_state: State<'_, AIState>,
    on_chunk: tauri::ipc::Channel<crate::ai::ChatChunk>,
    messages: Vec<ChatMessage>,
    model: Option<String>,
) -> Result<(), String> {
    let config = ai_state.get_config();
    let registry = ProviderRegistry::new(config);

    let mut req = ChatRequest {
        messages,
        ..Default::default()
    };
    req.model = model.unwrap_or_else(|| ai_state.get_config().model);

    registry
        .chat_stream(
            req,
            Box::new(move |chunk| {
                eprintln!(
                    "[cmd] sending chunk: done={} content_len={}",
                    chunk.done,
                    chunk.content.len()
                );
                match on_chunk.send(chunk) {
                    Ok(_) => eprintln!("[cmd] chunk sent OK"),
                    Err(e) => eprintln!("[cmd] chunk send FAILED: {}", e),
                }
            }),
        )
        .await
}

/// 获取提示词模板
#[tauri::command]
pub fn get_prompt_templates(
    ai_state: State<'_, AIState>,
) -> Result<crate::ai_state::PromptTemplates, String> {
    Ok(ai_state.get_prompt_templates())
}

/// 更新提示词模板
#[tauri::command]
pub fn update_prompt_templates(
    ai_state: State<'_, AIState>,
    templates: crate::ai_state::PromptTemplates,
) -> Result<(), String> {
    ai_state.update_prompt_templates(templates)
}
