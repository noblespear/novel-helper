//! Tauri 命令模块 - 暴露给前端的所有 IPC 入口

use crate::ai::{ChatMessage, ChatRequest, ProviderConfig, ProviderRegistry};
use crate::ai_state::{AISettings, AIState};
use crate::agent::{
    Agent, ListChaptersTool, ListCharactersTool, ReadChapterTool, ReadOutlineTool, RecallSkill,
    SearchFtsTool, SkillContext,
};
use crate::kb::pipeline::{KbPaths, KbPipeline, SourceContent};
use crate::kb::{KbMeta, KbStatus, ModelStatus, RebuildResult, SearchHit, DEFAULT_MODEL_REPO};
use crate::project::{Project, ProjectSummary};
use crate::storage::Storage;
use crate::AppConfig;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
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

// ============================================================
// Stage 1: 知识库 commands
// ============================================================

fn project_dir_for(config: &AppConfig, project_id: &str) -> std::path::PathBuf {
    config.projects_dir.join("projects").join(project_id)
}

/// 获取 KB 状态
#[tauri::command]
pub fn get_kb_status(
    config: State<'_, AppConfig>,
    project_id: String,
) -> Result<KbStatus, String> {
    let paths = KbPaths::for_project(&project_dir_for(&config, &project_id));
    let meta = crate::kb::pipeline::load_meta(&paths).unwrap_or_default();

    let fts_count = if paths.fts_db.exists() {
        FtsIndex::open(&paths.fts_db)
            .ok()
            .and_then(|idx| idx.count().ok())
            .unwrap_or(0)
    } else {
        0
    };
    let vector_count = if paths.vector_dir.exists() {
        VectorIndex::open(&paths.vector_dir)
            .ok()
            .and_then(|idx| idx.count().ok())
            .unwrap_or(0)
    } else {
        0
    };
    let chunk_count = fts_count.max(vector_count);

    let model_status = if meta.model_local_path.as_os_str().is_empty()
        || !meta.model_local_path.exists()
    {
        let user_data = config
            .projects_dir
            .parent()
            .unwrap_or(&config.projects_dir);
        crate::kb::downloader::manual_path_info(user_data, &meta.embedding_model)
    } else {
        ModelStatus::Ready {
            path: meta.model_local_path.clone(),
            dim: meta.embedding_dim,
        }
    };

    Ok(KbStatus {
        exists: chunk_count > 0,
        last_rebuild_ts: meta.last_rebuild_ts,
        chunk_count,
        model_status,
        dirty: false, // TODO: track dirty flag per project
    })
}

/// 下载 embedding 模型
#[tauri::command]
pub async fn download_embedding_model(
    config: State<'_, AppConfig>,
) -> Result<String, String> {
    let user_data = config
        .projects_dir
        .parent()
        .unwrap_or(&config.projects_dir);
    match crate::kb::downloader::try_download(DEFAULT_MODEL_REPO, user_data).await {
        Ok(path) => Ok(path.to_string_lossy().to_string()),
        Err(status) => match status {
            ModelStatus::NotDownloaded { manual_path, .. } => Err(format!(
                "模型下载失败。请手动从 https://huggingface.co/BAAI/bge-small-zh-v1.5 下载以下文件到 {}:\n  - model.onnx\n  - tokenizer.json",
                manual_path.display()
            )),
            _ => Err(format!("下载失败: {:?}", status)),
        },
    }
}

/// 重建知识库(全量)
#[tauri::command]
pub async fn rebuild_kb(
    config: State<'_, AppConfig>,
    project_id: String,
) -> Result<RebuildResult, String> {
    let project_dir = project_dir_for(&config, &project_id);
    let paths = KbPaths::for_project(&project_dir);
    let mut meta = crate::kb::pipeline::load_meta(&paths).unwrap_or_default();

    // 确保模型就绪
    let user_data = config
        .projects_dir
        .parent()
        .unwrap_or(&config.projects_dir);
    if meta.model_local_path.as_os_str().is_empty() || !meta.model_local_path.exists() {
        // 尝试下载
        match crate::kb::downloader::try_download(&meta.embedding_model, user_data).await {
            Ok(p) => meta.model_local_path = p,
            Err(e) => {
                return Err(format!(
                    "模型未就绪: {:?}\n请先在 KB 面板手动下载,或运行 download_embedding_model",
                    e
                ));
            }
        }
    }

    // 收集项目所有内容
    let sources = collect_project_sources(&project_dir)?;

    // 打开 pipeline
    let mut kb = KbPipeline::open(paths.clone(), meta.clone())?;
    kb.try_load_embedder()?;

    // 重建
    let result = kb.rebuild(&sources)?;

    // 持久化更新后的 meta
    crate::kb::pipeline::save_meta(&paths, &kb.meta)?;

    Ok(result)
}

/// FTS5 关键词检索
#[tauri::command]
pub fn search_fts(
    config: State<'_, AppConfig>,
    project_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchHit>, String> {
    let paths = KbPaths::for_project(&project_dir_for(&config, &project_id));
    let meta = crate::kb::pipeline::load_meta(&paths).unwrap_or_default();
    let kb = KbPipeline::open(paths, meta)?;
    kb.search_fts(&query, limit.unwrap_or(20))
}

/// 语义检索
#[tauri::command]
pub fn search_semantic(
    config: State<'_, AppConfig>,
    project_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchHit>, String> {
    let paths = KbPaths::for_project(&project_dir_for(&config, &project_id));
    let meta = crate::kb::pipeline::load_meta(&paths).unwrap_or_default();
    let mut kb = KbPipeline::open(paths, meta)?;
    kb.try_load_embedder()?;
    kb.search_semantic(&query, limit.unwrap_or(20))
}

/// 混合检索
#[tauri::command]
pub fn search_hybrid(
    config: State<'_, AppConfig>,
    project_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchHit>, String> {
    let paths = KbPaths::for_project(&project_dir_for(&config, &project_id));
    let meta = crate::kb::pipeline::load_meta(&paths).unwrap_or_default();
    let mut kb = KbPipeline::open(paths, meta)?;
    let _ = kb.try_load_embedder(); // 不强制要求模型
    kb.search_hybrid(&query, limit.unwrap_or(20))
}

/// 收集项目所有内容作为 KB source
fn collect_project_sources(
    project_dir: &std::path::Path,
) -> Result<Vec<SourceContent>, String> {
    use std::fs;
    let mut sources = Vec::new();

    // 1) 大纲
    let outline = project_dir.join("outline.md");
    if outline.exists() {
        let text = fs::read_to_string(&outline).map_err(|e| e.to_string())?;
        if !text.trim().is_empty() {
            sources.push(SourceContent {
                source: "outline".to_string(),
                text,
            });
        }
    }

    // 2) 角色
    let chars_file = project_dir.join("characters.json");
    if chars_file.exists() {
        let text = fs::read_to_string(&chars_file).map_err(|e| e.to_string())?;
        if !text.trim().is_empty() {
            sources.push(SourceContent {
                source: "characters".to_string(),
                text,
            });
        }
    }

    // 3) 章节
    let chapters_dir = project_dir.join("chapters");
    if chapters_dir.exists() {
        for entry in walkdir::WalkDir::new(&chapters_dir)
            .max_depth(3)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_name() == "content.md" {
                let id = entry
                    .path()
                    .parent()
                    .and_then(|p| p.file_name())
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                let text = fs::read_to_string(entry.path()).unwrap_or_default();
                if !text.trim().is_empty() {
                    sources.push(SourceContent {
                        source: format!("chapter:{}", id),
                        text,
                    });
                }
            }
        }
    }

    Ok(sources)
}

// re-export for use in commands
use crate::kb::fts::FtsIndex;
use crate::kb::lancedb::VectorIndex;

// ============================================================
// Stage 2: Agent / Skill commands
// ============================================================

/// 列出所有可用的 skill
#[tauri::command]
pub fn list_skills() -> Vec<SkillMeta> {
    crate::agent::SkillRegistry::list_builtin()
        .into_iter()
        .map(|(k, v)| SkillMeta {
            name: k.to_string(),
            label: v.to_string(),
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMeta {
    pub name: String,
    pub label: String,
}

/// 运行一个 skill(流式输出)
#[tauri::command]
pub async fn run_skill(
    config: State<'_, AppConfig>,
    ai_state: State<'_, AIState>,
    project_id: String,
    skill_name: String,
    user_input: String,
    on_chunk: tauri::ipc::Channel<crate::ai::ChatChunk>,
) -> Result<crate::agent::SkillOutput, String> {
    // 构造 Agent: 加载 5 个核心 tools + 1 个 skill
    let provider_cfg = ai_state.get_config();
    let mut agent = Agent::new(provider_cfg);
    agent.tools.register(Arc::new(SearchFtsTool));
    agent.tools.register(Arc::new(ReadChapterTool));
    agent.tools.register(Arc::new(ReadOutlineTool));
    agent.tools.register(Arc::new(ListChaptersTool));
    agent.tools.register(Arc::new(ListCharactersTool));

    // 选 skill
    let skill: Arc<dyn crate::agent::Skill> = match skill_name.as_str() {
        "recall" => Arc::new(RecallSkill::new()),
        _ => return Err(format!("skill not found: {}", skill_name)),
    };
    agent.skills.register(skill.clone());

    // 把 projects_dir 注入 ctx(供 tool 解析 project_dir 用)
    let mut ctx = SkillContext {
        project_id: project_id.clone(),
        skill_name: skill_name.clone(),
        user_input,
        context: std::collections::HashMap::new(),
        on_chunk: None,
    };
    ctx.context.insert(
        "projects_dir".to_string(),
        serde_json::json!(config.projects_dir.to_string_lossy()),
    );

    agent.run(&skill_name, ctx, &on_chunk).await
}
