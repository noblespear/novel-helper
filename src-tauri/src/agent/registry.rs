//! 注册表:管理所有可用的 Tool 和 Skill

use super::skill::{BuiltinSkills, Skill};
use super::tool::{tool_to_openai_format, Tool};
use std::collections::HashMap;
use std::sync::Arc;

pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn Tool>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    pub fn register(&mut self, tool: Arc<dyn Tool>) {
        self.tools.insert(tool.name().to_string(), tool);
    }

    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.get(name).cloned()
    }

    pub fn names(&self) -> Vec<String> {
        let mut names: Vec<String> = self.tools.keys().cloned().collect();
        names.sort();
        names
    }

    /// 转换为 OpenAI function calling 格式
    pub fn to_openai_tools(&self) -> Vec<serde_json::Value> {
        self.tools
            .values()
            .map(|t| tool_to_openai_format(t.as_ref()))
            .collect()
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

pub struct SkillRegistry {
    skills: HashMap<String, Arc<dyn Skill>>,
}

impl SkillRegistry {
    pub fn new() -> Self {
        Self {
            skills: HashMap::new(),
        }
    }

    pub fn register(&mut self, skill: Arc<dyn Skill>) {
        self.skills.insert(skill.name().to_string(), skill);
    }

    pub fn get(&self, name: &str) -> Option<Arc<dyn Skill>> {
        self.skills.get(name).cloned()
    }

    pub fn all(&self) -> Vec<Arc<dyn Skill>> {
        self.skills.values().cloned().collect()
    }

    /// 列出所有 skill 名字(从 BuiltinSkills 拿元数据)
    pub fn list_builtin() -> Vec<(&'static str, &'static str)> {
        BuiltinSkills::all()
    }
}

impl Default for SkillRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::tool::{ToolContext, ToolResult};
    use serde_json::{json, Value};

    struct EchoTool;
    impl Tool for EchoTool {
        fn name(&self) -> &'static str { "echo" }
        fn description(&self) -> &'static str { "原样返回" }
        fn parameters_schema(&self) -> Value {
            json!({"type": "object", "properties": {"msg": {"type": "string"}}, "required": ["msg"]})
        }
        fn execute(&self, args: Value, _ctx: &ToolContext) -> Result<ToolResult, String> {
            Ok(ToolResult::ok("done", json!({"echoed": args})))
        }
    }

    struct UpperTool;
    impl Tool for UpperTool {
        fn name(&self) -> &'static str { "upper" }
        fn description(&self) -> &'static str { "大写" }
        fn parameters_schema(&self) -> Value { json!({"type": "object"}) }
        fn execute(&self, _args: Value, _ctx: &ToolContext) -> Result<ToolResult, String> {
            Ok(ToolResult::ok("done", json!({"upper": "ABC"})))
        }
    }

    struct TestSkill;
    impl Skill for TestSkill {
        fn name(&self) -> &'static str { "test" }
        fn label(&self) -> &'static str { "测试" }
        fn system_prompt(&self) -> &'static str { "test" }
    }

    #[test]
    fn tool_registry_register_and_get() {
        let mut reg = ToolRegistry::new();
        reg.register(Arc::new(EchoTool));
        let t = reg.get("echo").unwrap();
        assert_eq!(t.name(), "echo");
    }

    #[test]
    fn tool_registry_get_missing() {
        let reg = ToolRegistry::new();
        assert!(reg.get("nope").is_none());
    }

    #[test]
    fn tool_registry_names_sorted() {
        let mut reg = ToolRegistry::new();
        reg.register(Arc::new(UpperTool));
        reg.register(Arc::new(EchoTool));
        let names = reg.names();
        assert_eq!(names, vec!["echo", "upper"]);
    }

    #[test]
    fn tool_registry_to_openai() {
        let mut reg = ToolRegistry::new();
        reg.register(Arc::new(EchoTool));
        let tools = reg.to_openai_tools();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["function"]["name"], "echo");
    }

    #[test]
    fn skill_registry_register_and_get() {
        let mut reg = SkillRegistry::new();
        reg.register(Arc::new(TestSkill));
        let s = reg.get("test").unwrap();
        assert_eq!(s.name(), "test");
    }

    #[test]
    fn skill_registry_all_returns_all() {
        let mut reg = SkillRegistry::new();
        reg.register(Arc::new(TestSkill));
        let all = reg.all();
        assert_eq!(all.len(), 1);
    }

    #[test]
    fn skill_registry_list_builtin() {
        let list = SkillRegistry::list_builtin();
        assert!(list.iter().any(|(k, _)| *k == "recall"));
    }
}
