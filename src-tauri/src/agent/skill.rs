//! Skill: 一组 Tool + 系统提示 + 输入模板

use super::tool::{Tool, ToolContext};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// Skill 输出(给 LLM 看的最终回复)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillOutput {
    pub content: String,
    /// 工具调用记录(给前端展示)
    pub tool_calls: Vec<ToolCallRecord>,
    /// 用量
    pub tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRecord {
    pub tool: String,
    pub args: Value,
    pub result_summary: String,
    pub ok: bool,
}

/// Skill 输入(用户给 Agent 的)
/// 注意:on_chunk 故意不参与 Serialize/Deserialize,因为它是非 Send 的闭包
pub struct SkillContext {
    pub project_id: String,
    pub skill_name: String,
    pub user_input: String,
    /// 上下文数据(章节内容、当前选区等)
    pub context: HashMap<String, Value>,
    /// 流式回调(给前端)。SkillContext 是非序列化,只在 Rust 进程内传递
    pub on_chunk: Option<Box<dyn Fn(SkillChunk) + Send + Sync>>,
}

impl std::fmt::Debug for SkillContext {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SkillContext")
            .field("project_id", &self.project_id)
            .field("skill_name", &self.skill_name)
            .field("user_input", &self.user_input)
            .field("context", &self.context)
            .field("on_chunk", &"<callback>")
            .finish()
    }
}

impl Clone for SkillContext {
    fn clone(&self) -> Self {
        Self {
            project_id: self.project_id.clone(),
            skill_name: self.skill_name.clone(),
            user_input: self.user_input.clone(),
            context: self.context.clone(),
            on_chunk: None, // callback 不可 Clone
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillChunk {
    pub content: String,
    pub done: bool,
    pub error: Option<String>,
    pub tool_call: Option<ToolCallRecord>,
}

/// Skill trait
pub trait Skill: Send + Sync {
    /// Skill 名(英文,小写,下划线)
    fn name(&self) -> &'static str;
    /// 中文标签(UI 显示)
    fn label(&self) -> &'static str;
    /// 人类描述(给 LLM 看)
    fn system_prompt(&self) -> &'static str;
    /// 这个 Skill 能用哪些工具(默认是全部)
    fn tools(&self) -> Vec<&dyn Tool> {
        vec![]
    }
    /// 渲染用户消息(用 {user_input} 和 {context} 替换)
    fn render_user_message(&self, ctx: &SkillContext) -> String {
        let mut s = ctx.user_input.clone();
        for (k, v) in &ctx.context {
            let placeholder = format!("{{{}}}", k);
            if let Some(str_val) = v.as_str() {
                s = s.replace(&placeholder, str_val);
            } else {
                s = s.replace(&placeholder, &v.to_string());
            }
        }
        s
    }
    /// 最大循环轮次(防止 agent 死循环)
    fn max_iterations(&self) -> usize {
        5
    }
    /// 温度
    fn temperature(&self) -> f32 {
        0.7
    }
}

/// Built-in skill metadata (for UI listing)
pub struct BuiltinSkills;

impl BuiltinSkills {
    pub fn all() -> Vec<(&'static str, &'static str)> {
        vec![
            ("recall", "📚 知识召回"),
            ("polish_selection", "✨ 选区润色"),
            ("continue_write", "➡️ 续写"),
            ("rewrite", "🔄 重写"),
            ("character_design", "🎭 角色设计"),
            ("summarize", "📝 摘要"),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    struct TestSkill;
    impl Skill for TestSkill {
        fn name(&self) -> &'static str { "test" }
        fn label(&self) -> &'static str { "测试" }
        fn system_prompt(&self) -> &'static str { "你是一个测试助手" }
    }

    #[test]
    fn skill_metadata() {
        let s = TestSkill;
        assert_eq!(s.name(), "test");
        assert_eq!(s.label(), "测试");
    }

    #[test]
    fn skill_render_user_message_simple() {
        let s = TestSkill;
        let mut ctx_map = HashMap::new();
        ctx_map.insert("text".to_string(), json!("hello"));
        let ctx = SkillContext {
            project_id: "p".into(),
            skill_name: "test".into(),
            user_input: "请处理这段:{text}".into(),
            context: ctx_map,
            on_chunk: None,
        };
        let rendered = s.render_user_message(&ctx);
        assert_eq!(rendered, "请处理这段:hello");
    }

    #[test]
    fn skill_render_replaces_multiple_placeholders() {
        let s = TestSkill;
        let mut ctx_map = HashMap::new();
        ctx_map.insert("title".to_string(), json!("第一章"));
        ctx_map.insert("author".to_string(), json!("林枫"));
        let ctx = SkillContext {
            project_id: "p".into(),
            skill_name: "test".into(),
            user_input: "{title} by {author}".into(),
            context: ctx_map,
            on_chunk: None,
        };
        assert_eq!(s.render_user_message(&ctx), "第一章 by 林枫");
    }

    #[test]
    fn skill_max_iterations_default() {
        let s = TestSkill;
        assert_eq!(s.max_iterations(), 5);
    }

    #[test]
    fn skill_temperature_default() {
        let s = TestSkill;
        assert!((s.temperature() - 0.7).abs() < 0.01);
    }

    #[test]
    fn builtin_skills_listed() {
        let all = BuiltinSkills::all();
        assert!(all.len() >= 6);
        assert!(all.iter().any(|(k, _)| *k == "recall"));
    }
}
