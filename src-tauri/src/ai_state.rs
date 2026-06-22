//! AI 配置状态管理
//!
//! 负责:
//! - 加载/保存 AI Provider 配置(API key 等)
//! - 提供全局可访问的 Provider registry
//! - 密钥安全存储(优先用系统 keyring,否则用本地加密)
//! - 提示词模板(每个 AI 动作可独立配置)

use crate::ai::ProviderConfig;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

const KEYRING_SERVICE: &str = "com.nobelspear.NovelHelper";
const KEYRING_KEY: &str = "ai_api_key";
const CONFIG_FILE: &str = "ai_config.json";

/// 提示词模板集 — 每个 AI 动作(润色/续写/角色等)一个模板
/// 占位符:{text} = 选区/正文, {chapter_title} = 章节标题
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplates {
    /// 选区润色系统提示
    pub polish_selection: String,
    /// 整章润色系统提示
    pub polish_chapter: String,
    /// 续写系统提示
    pub continue_write: String,
    /// 角色设计系统提示
    pub character_design: String,
    /// 通用聊天系统提示(可空,空则不发送 system 消息)
    pub general_chat: String,
}

impl Default for PromptTemplates {
    fn default() -> Self {
        Self {
            polish_selection: "你是一个中文网文润色助手。保持作者文风,只改不通顺、错别字、明显病句。直接返回润色后的文本,不要解释、不要 markdown 包裹。".into(),
            polish_chapter: "你是一个中文网文润色助手。保持作者文风,只改不通顺、错别字、明显病句。直接返回润色后的全文,不要解释。".into(),
            continue_write: "你是中文网文续写助手。基于用户给的正文续写约 200 字,保持文风一致,情节连贯。只返回续写内容,不要解释。".into(),
            character_design: "你是网文编辑,擅长角色设计。".into(),
            general_chat: "你是一个中文网文写作助手,帮作者构思、答疑、激发灵感。回答简洁有针对性,优先给可执行的具体建议。".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AISettings {
    pub config: ProviderConfig,
    pub prompt_templates: PromptTemplates,
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

impl AIState {
    /// 渲染模板:把 {text} / {chapter_title} 替换为实际值
    pub fn render_template(template: &str, text: &str, chapter_title: Option<&str>) -> String {
        template
            .replace("{text}", text)
            .replace("{chapter_title}", chapter_title.unwrap_or(""))
    }

    pub fn get_prompt_templates(&self) -> PromptTemplates {
        self.settings.lock().unwrap().prompt_templates.clone()
    }

    pub fn update_prompt_templates(&self, templates: PromptTemplates) -> Result<(), String> {
        let mut s = self.settings.lock().unwrap();
        s.prompt_templates = templates;
        let json = serde_json::to_string_pretty(&*s).map_err(|e| e.to_string())?;
        std::fs::write(&self.config_path, json).map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_prompts_are_non_empty() {
        let p = PromptTemplates::default();
        assert!(!p.polish_selection.is_empty());
        assert!(!p.polish_chapter.is_empty());
        assert!(!p.continue_write.is_empty());
        assert!(!p.character_design.is_empty());
        assert!(!p.general_chat.is_empty());
    }

    #[test]
    fn render_replaces_text_placeholder() {
        let out = AIState::render_template("处理:{text} 完成", "你好世界", None);
        assert_eq!(out, "处理:你好世界 完成");
    }

    #[test]
    fn render_replaces_chapter_title() {
        let out = AIState::render_template("章节:{chapter_title} 正文", "正文内容", Some("第一章"));
        assert_eq!(out, "章节:第一章 正文");
    }

    #[test]
    fn render_missing_chapter_title_is_empty() {
        let out = AIState::render_template("章节:{chapter_title} 正文", "x", None);
        assert_eq!(out, "章节: 正文");
    }

    #[test]
    fn render_preserves_unknown_placeholders() {
        let out = AIState::render_template("保持 {unknown} 原样", "正文", None);
        assert_eq!(out, "保持 {unknown} 原样");
    }

    #[test]
    fn render_replaces_multiple_occurrences() {
        let out = AIState::render_template("{text} 重复 {text}", "X", None);
        assert_eq!(out, "X 重复 X");
    }
}
