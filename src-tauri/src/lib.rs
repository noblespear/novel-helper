use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

mod commands;
mod project;
mod storage;

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
            // 初始化存储
            let storage = Storage::new(app.handle().clone())?;
            app.manage(storage);
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
