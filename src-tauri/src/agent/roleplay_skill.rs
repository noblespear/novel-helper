//! Roleplay Skill - 让 LLM 扮演指定角色
//!
//! 设计:RoleplaySkill 本身不带 system_prompt,在执行时根据 ctx.context["character_id"]
//! 动态加载角色并生成 system_prompt。这样:
//! - 一个 skill 实例可以服务所有角色
//! - 修改角色人设不需要重启 skill
//! - skill 本身只定义"怎么扮演"的协议(规则)

use super::super::character::{load_characters, render_character_system_prompt, Character};
use crate::agent::skill::{Skill, SkillContext};
use crate::agent::tools::SearchFtsTool;
use crate::agent::tool::Tool;
use serde_json::Value;
use std::path::PathBuf;

pub struct RoleplaySkill;

impl RoleplaySkill {
    pub fn new() -> Self {
        Self
    }
}

impl Default for RoleplaySkill {
    fn default() -> Self {
        Self::new()
    }
}

impl Skill for RoleplaySkill {
    fn name(&self) -> &'static str {
        "roleplay"
    }
    fn label(&self) -> &'static str {
        "🎭 角色扮演"
    }
    fn system_prompt(&self) -> &'static str {
        // 这个 prompt 实际会被 roleplay_skill 的 system_prompt_for() 覆盖
        // 这里只是占位,真正的 prompt 在执行时根据 character_id 动态生成
        "(由角色人设动态生成)"
    }
    fn tools(&self) -> Vec<&dyn Tool> {
        // 角色扮演时可以让 LLM 调 search_fts 来查相关章节
        vec![]
    }
    fn max_iterations(&self) -> usize {
        3
    }
    fn temperature(&self) -> f32 {
        0.9 // 角色扮演需要更高的创造性
    }
}

/// 给定 character_id 和 projects_dir,返回完整 system_prompt
pub fn build_roleplay_system_prompt(
    projects_dir: &str,
    project_id: &str,
    character_id: &str,
) -> Result<String, String> {
    let project_dir = PathBuf::from(projects_dir)
        .join("projects")
        .join(project_id);
    let characters = load_characters(&project_dir)?;
    let character: &Character = characters
        .iter()
        .find(|c| c.id == character_id)
        .ok_or_else(|| format!("character not found: {}", character_id))?;
    Ok(render_character_system_prompt(character))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::character::Character;
    use std::fs;

    fn setup_project() -> (PathBuf, String) {
        let tmp = std::env::temp_dir().join(format!("roleplay_{}", uuid::Uuid::new_v4()));
        let projects_dir = tmp.clone();
        let project_id = "p1";
        let project_dir = projects_dir.join("projects").join(project_id);
        fs::create_dir_all(&project_dir).unwrap();
        let mut c = Character::new(project_id, "林枫");
        c.personality = "沉默寡言".into();
        c.speaking_style = "短句".into();
        c.background = "出身寒门".into();
        c.knowledge = "知道内鬼".into();
        let chars = vec![c];
        crate::character::save_characters(&project_dir, &chars).unwrap();
        (tmp, project_id.to_string())
    }

    #[test]
    fn roleplay_skill_metadata() {
        let s = RoleplaySkill::new();
        assert_eq!(s.name(), "roleplay");
        assert!(s.temperature() > 0.8);
    }

    #[test]
    fn build_prompt_for_real_character() {
        let (tmp, pid) = setup_project();
        let chars = crate::character::load_characters(&tmp.join("projects").join(&pid)).unwrap();
        let c = &chars[0];
        let p = build_roleplay_system_prompt(
            tmp.to_str().unwrap(),
            &pid,
            &c.id,
        )
        .unwrap();
        assert!(p.contains("林枫"));
        assert!(p.contains("沉默寡言"));
        assert!(p.contains("知道内鬼"));
        assert!(p.contains("对话规则"));
    }

    #[test]
    fn build_prompt_for_missing_character() {
        let (tmp, pid) = setup_project();
        let r = build_roleplay_system_prompt(
            tmp.to_str().unwrap(),
            &pid,
            "nonexistent_id",
        );
        assert!(r.is_err());
    }

    #[test]
    fn build_prompt_no_characters_file() {
        let tmp = std::env::temp_dir().join(format!("roleplay_no_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(tmp.join("projects").join("p1")).unwrap();
        let r = build_roleplay_system_prompt(
            tmp.to_str().unwrap(),
            "p1",
            "any",
        );
        // 找不到角色应该报错
        assert!(r.is_err());
    }
}
