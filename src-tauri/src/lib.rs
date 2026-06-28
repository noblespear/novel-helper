use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

mod ai;
mod agent;
mod ai_region;
mod character;
mod commands;
mod kb;
mod lore;
mod outline;
mod project;
mod storage;
mod ai_state;

use ai::ProviderConfig;
use storage::Storage;

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub projects_dir: PathBuf,
    pub theme: String,
    pub font: String,
    pub daily_goal: u32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            projects_dir: directories::ProjectDirs::from("com", "nobelspear", "NovelHelper")
                .map(|p| p.data_dir().to_path_buf())
                .unwrap_or_else(|| PathBuf::from(".")),
            theme: "dark".to_string(),
            font: "writing".to_string(),
            daily_goal: 5000,
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // 初始化配置
            let config = AppConfig::default();
            app.manage(config.clone());
            // 初始化存储
            let storage = Storage::new(app.handle().clone())?;
            app.manage(storage);

            // 初始化 AI 状态
            let config_dir = config.projects_dir.parent()
                .unwrap_or(&config.projects_dir)
                .to_path_buf();
            std::fs::create_dir_all(&config_dir).ok();
            let ai_state = crate::ai_state::AIState::new(&config_dir);
            app.manage(ai_state);

            // 首次启动 seed 一个示例项目(便于演示与开发)
            let projects_dir = config.projects_dir.clone();
            let projects_path = projects_dir.join("projects");
            let need_seed = !projects_path.exists()
                || std::fs::read_dir(&projects_path)
                    .map(|mut d| d.next().is_none())
                    .unwrap_or(true);
            if need_seed {
                use crate::project::Project;
                use chrono::Utc;
                use uuid::Uuid;
                std::fs::create_dir_all(&projects_path).ok();
                let id = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();
                let project = Project {
                    id: id.clone(),
                    name: "诡秘之主".to_string(),
                    synopsis: "蒸汽与机械的年代,隐藏在世界阴影中的神秘复苏。".to_string(),
                    target_words: 1_500_000,
                    daily_goal: 5000,
                    created_at: now.clone(),
                    updated_at: now,
                    cover: None,
                };
                let storage: tauri::State<Storage> = app.state();
                let _ = storage.create_project(&projects_dir, &project);
                for (i, title) in [
                    "序章 绝望的流民",
                    "第一章 初入黑荆棘安保",
                    "第二章 罗塞尔日记",
                ]
                .iter()
                .enumerate()
                {
                    let content = match i {
                        0 => "一阵痛彻心扉的剧痛将克莱恩从黑暗中拉回现实。\n\n他猛地睁开眼,发现自己正躺在阴冷潮湿的地面上,周围弥漫着腐烂与铁锈混合的气味。\n\n——这是哪里?\n\n他挣扎着坐起身,记忆如同被打碎的镜子,只有零星的碎片在脑海中闪烁。",
                        1 => "队长,那个人醒了。\n\n克莱恩循声望去,看见一个身穿黑色制服的年轻男人正站在铁栅栏外,用审视的目光打量着他。\n\n你叫什么名字?男人问。\n\n克莱恩张了张嘴,却发现自己竟然想不起自己的真名。",
                        _ => "这是第137期罗塞尔日记的片段。\n\n\"……我开始怀疑我们是否真的在追寻真相,还是只是另一种形式的自我欺骗……\"\n\n克莱恩合上日记本,陷入沉思。",
                    };
                    if let Ok(chapter) =
                        storage.create_chapter(&projects_dir, &id, "default", title)
                    {
                        let chapter_dir = projects_dir
                            .join("projects")
                            .join(&id)
                            .join("chapters")
                            .join(&chapter.id);
                        let _ = std::fs::write(chapter_dir.join("content.md"), content);
                        // 重新统计字数并写回 meta
                        let meta_path = chapter_dir.join("meta.json");
                        if let Ok(s) = std::fs::read_to_string(&meta_path) {
                            if let Ok(mut c) = serde_json::from_str::<crate::commands::Chapter>(&s) {
                                c.content = content.to_string();
                                c.word_count = crate::storage::Storage::count_words_pub(content);
                                let _ = std::fs::write(&meta_path, serde_json::to_string_pretty(&c).unwrap_or_default());
                            }
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::list_projects,
            commands::open_project,
            commands::delete_project,
            commands::save_chapter,
            commands::load_chapter,
            commands::list_chapters,
            commands::create_chapter,
            commands::delete_chapter,
            commands::get_ai_settings,
            commands::update_ai_config,
            commands::list_ai_models,
            commands::validate_ai_key,
            commands::ai_chat_stream,
            commands::get_prompt_templates,
            commands::update_prompt_templates,
            commands::get_kb_status,
            commands::download_embedding_model,
            commands::rebuild_kb,
            commands::search_fts,
            commands::search_semantic,
            commands::search_hybrid,
            commands::list_skills,
            commands::run_skill,
            commands::list_characters,
            commands::upsert_character,
            commands::delete_character,
            commands::run_roleplay,
            commands::load_outline,
            commands::load_outline_flat,
            commands::add_outline_node,
            commands::update_outline_node,
            commands::delete_outline_node,
            commands::reorder_outline_nodes,
            commands::load_lore,
            commands::add_lore_entry,
            commands::update_lore_entry,
            commands::delete_lore_entry,
            commands::search_lore,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
