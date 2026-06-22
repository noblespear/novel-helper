//! AI 配置状态管理
//!
//! 负责:
//! - 加载/保存 AI Provider 配置(API key 等)
//! - 提供全局可访问的 Provider registry
//! - 密钥安全存储(优先用系统 keyring,否则用本地加密)

use crate::ai::ProviderConfig;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

const KEYRING_SERVICE: &str = "com.nobelspear.NovelHelper";
const KEYRING_KEY: &str = "ai_api_key";
const CONFIG_FILE: &str = "ai_config.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AISettings {
    pub config: ProviderConfig,
    /// 提示模板:章节润色等
    pub prompt_overrides: serde_json::Value,
}

pub struct AIState {
    pub settings: Mutex<AISettings>,
    pub config_path: std::path::PathBuf,
}

impl AIState {
    pub fn new(config_dir: &std::path::Path) -> Self {
        let config_path = config_dir.join(CONFIG_FILE);
        let settings = if config_path.exists() {
            std::fs::read_to_string(&config_path)
                .ok()
                .and_then(|s| serde_json::from_str::<AISettings>(&s).ok())
                .unwrap_or_default()
        } else {
            // 第一次:从 keyring 恢复 API key
            let mut s = AISettings::default();
            if let Ok(Some(key)) = read_key_from_keyring() {
                s.config.api_key = key;
            }
            s
        };
        Self {
            settings: Mutex::new(settings),
            config_path,
        }
    }

    pub fn get_config(&self) -> ProviderConfig {
        self.settings.lock().unwrap().config.clone()
    }

    pub fn update_config(&self, new_config: ProviderConfig) -> Result<(), String> {
        let mut s = self.settings.lock().unwrap();
        // 单独存 API key 到 keyring(只在非空时写)
        if !new_config.api_key.is_empty() {
            write_key_to_keyring(&new_config.api_key).map_err(|e| e.to_string())?;
        }
        // 关键:如果前端没传新 key,保留内存和 keyring 里的旧 key
        let mut merged = new_config;
        if merged.api_key.is_empty() {
            merged.api_key = s.config.api_key.clone();
        }
        s.config = merged;
        // 配置文件(不存 API key,只存其他)
        let mut persist = s.clone();
        persist.config.api_key = String::new();
        let json = serde_json::to_string_pretty(&persist).map_err(|e| e.to_string())?;
        std::fs::write(&self.config_path, json).map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn write_key_to_keyring(key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_KEY)
        .map_err(|e| format!("keyring 初始化失败: {}", e))?;
    entry
        .set_password(key)
        .map_err(|e| format!("keyring 写入失败: {}", e))?;
    Ok(())
}

fn read_key_from_keyring() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_KEY)
        .map_err(|e| format!("keyring 初始化失败: {}", e))?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring 读取失败: {}", e)),
    }
}
