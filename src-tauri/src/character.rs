//! 角色(Character) - 小说中的人物
//!
//! 角色是 Agent 的核心单元:每个角色有自己的人设(性格/说话风格/背景/关系/知道的事),
//! 当用户与角色"对话"时,系统用角色人设构造 system_prompt,让 LLM 扮演该角色。
//!
//! ## 数据布局
//! <project>/characters.json  - 角色列表(JSON 数组)
//!
//! ## 关系
//! - Skill 系统中专门有 RoleplaySkill,负责把角色人设渲染为 system_prompt
//! - Agent 框架调用 skill 时,roleplay skill 读取 character_id → 加载角色 → 渲染

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Relationship {
    /// 目标角色名(在同一个 project 内)
    pub target: String,
    /// 关系类型(师徒/仇人/恋人/朋友/...)
    #[serde(rename = "type")]
    pub type_: String,
    /// 关系描述
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub project_id: String,
    pub name: String,
    /// 头像(emoji 或本地图片路径)
    #[serde(default)]
    pub avatar: Option<String>,
    /// 性格描述
    #[serde(default)]
    pub personality: String,
    /// 说话风格
    #[serde(default)]
    pub speaking_style: String,
    /// 背景故事
    #[serde(default)]
    pub background: String,
    /// 与其他角色的关系
    #[serde(default)]
    pub relationships: Vec<Relationship>,
    /// 该角色知道什么(可以为空)
    #[serde(default)]
    pub knowledge: String,
    /// 该角色可以使用的 skills(空 = 全部)
    #[serde(default)]
    pub enabled_skills: Vec<String>,
    /// 创建时间
    #[serde(default)]
    pub created_at: i64,
    /// 更新时间
    #[serde(default)]
    pub updated_at: i64,
}

impl Character {
    pub fn new(project_id: &str, name: &str) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id: format!("char_{}", uuid::Uuid::new_v4()),
            project_id: project_id.to_string(),
            name: name.to_string(),
            avatar: None,
            personality: String::new(),
            speaking_style: String::new(),
            background: String::new(),
            relationships: Vec::new(),
            knowledge: String::new(),
            enabled_skills: Vec::new(),
            created_at: now,
            updated_at: now,
        }
    }
}

/// 加载项目的所有角色
pub fn load_characters(project_dir: &Path) -> Result<Vec<Character>, String> {
    let path = project_dir.join("characters.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let s = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if s.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

/// 保存所有角色
pub fn save_characters(project_dir: &Path, characters: &[Character]) -> Result<(), String> {
    if let Some(parent) = project_dir.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(project_dir).map_err(|e| e.to_string())?;
    let path = project_dir.join("characters.json");
    let json = serde_json::to_string_pretty(characters).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// 根据 id 找角色
pub fn find_character<'a>(
    characters: &'a [Character],
    id: &str,
) -> Option<&'a Character> {
    characters.iter().find(|c| c.id == id)
}

/// 角色 system_prompt 渲染:把角色人设变成 LLM 用的 system message
pub fn render_character_system_prompt(character: &Character) -> String {
    let mut s = String::new();
    s.push_str("你正在扮演小说中的一个角色。请严格保持角色身份,不要跳出角色,不要承认自己是 AI。\n\n");

    s.push_str("【基本信息】\n");
    s.push_str(&format!("姓名:{}\n", character.name));
    if let Some(av) = &character.avatar {
        s.push_str(&format!("头像:{}\n", av));
    }
    if !character.personality.is_empty() {
        s.push_str(&format!("性格:{}\n", character.personality));
    }
    if !character.speaking_style.is_empty() {
        s.push_str(&format!("说话风格:{}\n", character.speaking_style));
    }
    if !character.background.is_empty() {
        s.push_str(&format!("背景:{}\n", character.background));
    }
    s.push('\n');

    if !character.relationships.is_empty() {
        s.push_str("【人物关系】\n");
        for r in &character.relationships {
            s.push_str(&format!(
                "- 与「{}」:{} ({})\n",
                r.target, r.description, r.type_
            ));
        }
        s.push('\n');
    }

    if !character.knowledge.is_empty() {
        s.push_str("【该角色知道的事】\n");
        s.push_str(&character.knowledge);
        s.push_str("\n\n");
    }

    s.push_str("【对话规则】\n");
    s.push_str("1. 严格保持角色的语气、词汇、习惯\n");
    s.push_str("2. 引用过去经历时,用你(角色)自己的记忆\n");
    s.push_str("3. 对话简短自然,符合角色性格\n");
    s.push_str("4. 不要承认自己是 AI 或语言模型\n");
    s.push_str("5. 如果不确定,保持沉默或承认不知道\n");

    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_character() -> Character {
        let mut c = Character::new("proj1", "林枫");
        c.avatar = Some("🌲".into());
        c.personality = "沉默寡言,内心细腻".into();
        c.speaking_style = "短句,常用反问".into();
        c.background = "出身寒门,幼年家破人亡".into();
        c.relationships = vec![Relationship {
            target: "苏婉".into(),
            type_: "恋人".into(),
            description: "青梅竹马,十年未见面".into(),
        }];
        c.knowledge = "知道门派内鬼的存在".into();
        c
    }

    #[test]
    fn new_character_has_defaults() {
        let c = Character::new("p1", "名字");
        assert_eq!(c.name, "名字");
        assert_eq!(c.project_id, "p1");
        assert!(c.id.starts_with("char_"));
        assert!(c.personality.is_empty());
        assert!(c.relationships.is_empty());
        assert!(c.created_at > 0);
    }

    #[test]
    fn sample_character_serializes() {
        let c = sample_character();
        let json = serde_json::to_string(&c).unwrap();
        assert!(json.contains("林枫"));
        assert!(json.contains("苏婉"));
        // type 重命名验证
        assert!(json.contains("\"type\":\"恋人\""));
    }

    #[test]
    fn sample_character_deserializes() {
        let c = sample_character();
        let json = serde_json::to_string(&c).unwrap();
        let back: Character = serde_json::from_str(&json).unwrap();
        assert_eq!(back.name, c.name);
        assert_eq!(back.relationships.len(), 1);
        assert_eq!(back.relationships[0].target, "苏婉");
    }

    #[test]
    fn character_with_missing_optional_fields() {
        let json = r#"{"id":"c1","project_id":"p1","name":"X"}"#;
        let c: Character = serde_json::from_str(json).unwrap();
        assert_eq!(c.name, "X");
        assert!(c.personality.is_empty());
        assert!(c.avatar.is_none());
    }

    #[test]
    fn save_and_load_roundtrip() {
        let tmp = std::env::temp_dir().join(format!("char_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();
        let chars = vec![sample_character(), Character::new("p1", "苏婉")];
        save_characters(&tmp, &chars).unwrap();
        let loaded = load_characters(&tmp).unwrap();
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].name, "林枫");
    }

    #[test]
    fn load_empty_returns_empty_vec() {
        let tmp = std::env::temp_dir().join(format!("char_test_empty_{}", uuid::Uuid::new_v4()));
        let loaded = load_characters(&tmp).unwrap();
        assert!(loaded.is_empty());
    }

    #[test]
    fn find_character_by_id() {
        let chars = vec![sample_character(), Character::new("p1", "其他")];
        let target = find_character(&chars, &chars[0].id).unwrap();
        assert_eq!(target.name, "林枫");
        assert!(find_character(&chars, "nope").is_none());
    }

    #[test]
    fn render_system_prompt_includes_all_fields() {
        let c = sample_character();
        let p = render_character_system_prompt(&c);
        assert!(p.contains("林枫"));
        assert!(p.contains("🌲"));
        assert!(p.contains("沉默寡言"));
        assert!(p.contains("短句"));
        assert!(p.contains("寒门"));
        assert!(p.contains("苏婉"));
        assert!(p.contains("门派内鬼"));
        assert!(p.contains("不要承认自己是 AI"));
    }

    #[test]
    fn render_handles_minimal_character() {
        let c = Character::new("p", "无名");
        let p = render_character_system_prompt(&c);
        assert!(p.contains("无名"));
        // 没有性格/风格/关系/知识时,不应该 panic
        assert!(p.contains("【对话规则】"));
    }
}
