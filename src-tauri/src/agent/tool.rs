//! Tool: 原子能力

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolContext {
    /// 当前小说项目 id
    pub project_id: String,
    /// 当前章节 id(可选)
    pub chapter_id: Option<String>,
    /// 触发本次调用的 skill 名
    pub skill_name: String,
    /// 共享数据(供多个 tool 协作)
    pub shared: HashMap<String, Value>,
}

impl ToolContext {
    pub fn new(project_id: &str, skill_name: &str) -> Self {
        Self {
            project_id: project_id.to_string(),
            chapter_id: None,
            skill_name: skill_name.to_string(),
            shared: HashMap::new(),
        }
    }

    pub fn with_chapter(mut self, chapter_id: &str) -> Self {
        self.chapter_id = Some(chapter_id.to_string());
        self
    }

    pub fn shared_get(&self, key: &str) -> Option<&Value> {
        self.shared.get(key)
    }

    pub fn shared_set(&mut self, key: &str, value: Value) {
        self.shared.insert(key.to_string(), value);
    }
}

/// 工具返回值
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    /// 是否成功
    pub ok: bool,
    /// 人类可读摘要(给 LLM 看的)
    pub summary: String,
    /// 结构化数据(给前端用的,可选)
    pub data: Value,
}

impl ToolResult {
    pub fn ok(summary: impl Into<String>, data: Value) -> Self {
        Self {
            ok: true,
            summary: summary.into(),
            data,
        }
    }

    pub fn err(summary: impl Into<String>) -> Self {
        Self {
            ok: false,
            summary: summary.into(),
            data: Value::Null,
        }
    }
}

/// Tool trait
pub trait Tool: Send + Sync {
    /// 工具名(英文,小写,下划线分隔)
    fn name(&self) -> &'static str;
    /// 人类可读描述(给 LLM 看的)
    fn description(&self) -> &'static str;
    /// JSON Schema 描述参数
    fn parameters_schema(&self) -> Value;
    /// 执行
    fn execute(&self, args: Value, ctx: &ToolContext) -> Result<ToolResult, String>;
}

/// 把 Tool 暴露给 OpenAI function calling 协议的格式
pub fn tool_to_openai_format(t: &dyn Tool) -> Value {
    serde_json::json!({
        "type": "function",
        "function": {
            "name": t.name(),
            "description": t.description(),
            "parameters": t.parameters_schema(),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    struct HelloTool;
    impl Tool for HelloTool {
        fn name(&self) -> &'static str { "hello" }
        fn description(&self) -> &'static str { "打招呼" }
        fn parameters_schema(&self) -> Value {
            json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "姓名" }
                },
                "required": ["name"]
            })
        }
        fn execute(&self, args: Value, _ctx: &ToolContext) -> Result<ToolResult, String> {
            let name = args["name"].as_str().ok_or("missing name")?;
            Ok(ToolResult::ok(format!("你好,{}!", name), json!({"greeted": name})))
        }
    }

    #[test]
    fn tool_execute_basic() {
        let t = HelloTool;
        let ctx = ToolContext::new("proj1", "test");
        let r = t.execute(json!({"name": "世界"}), &ctx).unwrap();
        assert!(r.ok);
        assert!(r.summary.contains("世界"));
        assert_eq!(r.data["greeted"], "世界");
    }

    #[test]
    fn tool_execute_missing_arg() {
        let t = HelloTool;
        let ctx = ToolContext::new("proj1", "test");
        let r = t.execute(json!({}), &ctx);
        assert!(r.is_err());
    }

    #[test]
    fn tool_context_with_chapter() {
        let ctx = ToolContext::new("p", "s").with_chapter("c1");
        assert_eq!(ctx.chapter_id.as_deref(), Some("c1"));
    }

    #[test]
    fn tool_context_shared() {
        let mut ctx = ToolContext::new("p", "s");
        ctx.shared_set("k", json!(42));
        assert_eq!(ctx.shared_get("k").unwrap().as_i64(), Some(42));
    }

    #[test]
    fn tool_to_openai_format() {
        let t = HelloTool;
        let f = super::tool_to_openai_format(&t);
        assert_eq!(f["type"], "function");
        assert_eq!(f["function"]["name"], "hello");
        assert!(f["function"]["parameters"]["properties"]["name"].is_object());
    }

    #[test]
    fn tool_result_ok() {
        let r = ToolResult::ok("done", json!({}));
        assert!(r.ok);
        assert_eq!(r.summary, "done");
    }

    #[test]
    fn tool_result_err() {
        let r = ToolResult::err("bad");
        assert!(!r.ok);
        assert_eq!(r.summary, "bad");
    }
}
