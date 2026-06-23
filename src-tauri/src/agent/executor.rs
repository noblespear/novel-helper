//! Agent Executor: LLM tool-calling 循环

use super::registry::{SkillRegistry, ToolRegistry};
use super::skill::{Skill, SkillChunk, SkillContext, SkillOutput, ToolCallRecord};
use super::tool::{Tool, ToolContext, ToolResult};
use crate::ai::{ChatChunk, ChatMessage, ChatRequest, ProviderConfig, ProviderRegistry};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::ipc::Channel;

/// LLM 工具调用请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRequest {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

/// LLM 响应解析后的形态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmResponse {
    pub content: String,
    pub tool_calls: Vec<ToolCallRequest>,
    pub done: bool,
}

pub struct Agent {
    pub tools: ToolRegistry,
    pub skills: SkillRegistry,
    pub config: ProviderConfig,
}

impl Agent {
    pub fn new(config: ProviderConfig) -> Self {
        Self {
            tools: ToolRegistry::new(),
            skills: SkillRegistry::new(),
            config,
        }
    }

    /// 注册工具
    pub fn with_tool(mut self, tool: Arc<dyn Tool>) -> Self {
        self.tools.register(tool);
        self
    }

    /// 注册 skill
    pub fn with_skill(mut self, skill: Arc<dyn Skill>) -> Self {
        self.skills.register(skill);
        self
    }

    /// 运行 skill,流式输出到 channel
    pub async fn run(
        &self,
        skill_name: &str,
        ctx: SkillContext,
        channel: &Channel<ChatChunk>,
    ) -> Result<SkillOutput, String> {
        let skill = self.skills.get(skill_name).ok_or_else(|| {
            format!("skill not found: {}", skill_name)
        })?;

        // 1) 构造初始消息
        let mut messages: Vec<ChatMessage> = vec![ChatMessage::system(skill.system_prompt())];
        let user_msg = skill.render_user_message(&ctx);
        messages.push(ChatMessage::user(user_msg));

        // 2) LLM + tool 循环
        let registry = ProviderRegistry::new(self.config.clone());
        let mut tool_call_records: Vec<ToolCallRecord> = Vec::new();
        let total_tokens: u32 = 0;
        let max_iter = skill.max_iterations();

        for _ in 0..max_iter {
            // 调用 LLM(streaming)
            let req = ChatRequest {
                messages: messages.clone(),
                model: self.config.model.clone(),
                max_tokens: 2000,
                temperature: skill.temperature(),
                stream: true,
            };

            // 累积 + 转发给 channel
            let accumulated = Arc::new(Mutex::new(String::new()));
            let acc_clone = accumulated.clone();
            let channel_clone = channel.clone();

            self.call_llm_blocking(&registry, req, move |chunk| {
                if !chunk.content.is_empty() {
                    acc_clone.lock().unwrap().push_str(&chunk.content);
                    let _ = channel_clone.send(ChatChunk {
                        content: chunk.content.clone(),
                        done: false,
                        usage: None,
                    });
                }
            })
            .await?;

            // 协议:LLM 在 content 里写 ```json {tool, args}``` 块表示要调工具
            let final_text = accumulated.lock().unwrap().clone();
            let tool_calls = self.extract_tool_calls(&final_text);

            if tool_calls.is_empty() {
                // LLM 没要求调工具,任务完成
                let _ = channel.send(ChatChunk {
                    content: String::new(),
                    done: true,
                    usage: None,
                });
                return Ok(SkillOutput {
                    content: final_text,
                    tool_calls: tool_call_records,
                    tokens: total_tokens,
                });
            }

            // 3) 执行每个 tool_call
            let tool_ctx = ToolContext::new(&ctx.project_id, skill_name);
            let mut tool_results: Vec<(String, String, Value)> = Vec::new();

            for tc in &tool_calls {
                let tool = self.tools.get(&tc.name).ok_or_else(|| {
                    format!("tool not found: {}", tc.name)
                })?;

                let _ = channel.send(ChatChunk {
                    content: format!("\n[工具: {}]\n", tc.name),
                    done: false,
                    usage: None,
                });

                let result = match tool.execute(tc.arguments.clone(), &tool_ctx) {
                    Ok(r) => r,
                    Err(e) => ToolResult::err(e),
                };

                tool_call_records.push(ToolCallRecord {
                    tool: tc.name.clone(),
                    args: tc.arguments.clone(),
                    result_summary: result.summary.clone(),
                    ok: result.ok,
                });

                let _ = channel.send(ChatChunk {
                    content: format!("{}\n", result.summary),
                    done: false,
                    usage: None,
                });

                tool_results.push((
                    tc.id.clone(),
                    tc.name.clone(),
                    json!({
                        "ok": result.ok,
                        "summary": result.summary,
                        "data": result.data,
                    }),
                ));
            }

            // 4) 把 tool_call + result 追加到 messages,让 LLM 继续
            messages.push(ChatMessage::assistant(format!(
                "[调用工具:{}]",
                tool_calls
                    .iter()
                    .map(|t| format!("{}={}", t.name, t.arguments))
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
            for (id, name, data) in &tool_results {
                messages.push(ChatMessage::user(format!(
                    "[工具 {} 结果]: {}",
                    name, data
                )));
                let _ = id;
            }
        }

        // 超过最大轮次
        let _ = channel.send(ChatChunk {
            content: "\n[已达最大轮次,终止]".to_string(),
            done: true,
            usage: None,
        });
        Ok(SkillOutput {
            content: String::new(),
            tool_calls: tool_call_records,
            tokens: total_tokens,
        })
    }

    /// 阻塞式调用 LLM
    async fn call_llm_blocking(
        &self,
        registry: &ProviderRegistry,
        req: ChatRequest,
        on_chunk: impl Fn(ChatChunk) + Send + Sync + 'static,
    ) -> Result<LlmResponse, String> {
        // 用 Arc<Mutex<String>> 累积,因为 Box<dyn Fn> 是 Fn(只读)
        let acc = Arc::new(Mutex::new(String::new()));
        let acc_clone = acc.clone();

        registry
            .chat_stream(
                req,
                Box::new(move |chunk| {
                    if !chunk.content.is_empty() {
                        acc_clone.lock().unwrap().push_str(&chunk.content);
                    }
                    on_chunk(chunk);
                }),
            )
            .await?;

        let final_text = acc.lock().unwrap().clone();
        Ok(LlmResponse {
            content: final_text,
            tool_calls: vec![],
            done: true,
        })
    }

    /// 从 LLM 输出中提取 tool_calls
    /// 协议: ```json
    /// {"tool": "search_fts", "args": {"query": "..."}}
    /// ```
    fn extract_tool_calls(&self, text: &str) -> Vec<ToolCallRequest> {
        let mut calls = Vec::new();
        // 找 ```json ... ``` 块
        let mut rest = text;
        let mut idx = 0;
        while let Some(start) = rest.find("```json") {
            let after = &rest[start + 7..];
            if let Some(end) = after.find("```") {
                let json_str = after[..end].trim();
                if let Ok(v) = serde_json::from_str::<Value>(json_str) {
                    let name = v.get("tool").and_then(|x| x.as_str());
                    let args = v.get("args").cloned().unwrap_or_else(|| json!({}));
                    if let Some(name) = name {
                        calls.push(ToolCallRequest {
                            id: format!("call_{}", idx),
                            name: name.to_string(),
                            arguments: args,
                        });
                        idx += 1;
                    }
                }
                rest = &after[end + 3..];
            } else {
                break;
            }
        }
        calls
    }
}

use std::sync::Arc;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::ProviderConfig;
    use crate::ai::ChatChunk;

    fn mock_config() -> ProviderConfig {
        ProviderConfig {
            provider_type: "mock".into(),
            api_key: "".into(),
            base_url: "".into(),
            model: "mock-fast".into(),
        }
    }

    #[test]
    fn extract_tool_calls_from_json_blocks() {
        let agent = Agent::new(mock_config());
        let text = r#"
        让我搜一下:
        ```json
        {"tool": "search_fts", "args": {"query": "林枫"}}
        ```
        "#;
        let calls = agent.extract_tool_calls(text);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "search_fts");
        assert_eq!(calls[0].arguments["query"], "林枫");
    }

    #[test]
    fn extract_no_tool_calls() {
        let agent = Agent::new(mock_config());
        let calls = agent.extract_tool_calls("just plain text");
        assert!(calls.is_empty());
    }

    #[test]
    fn extract_multiple_tool_calls() {
        let agent = Agent::new(mock_config());
        let text = r#"
        ```json
        {"tool": "a", "args": {}}
        ```
        some text
        ```json
        {"tool": "b", "args": {"x": 1}}
        ```
        "#;
        let calls = agent.extract_tool_calls(text);
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].name, "a");
        assert_eq!(calls[1].name, "b");
    }

    #[test]
    fn extract_invalid_json_ignored() {
        let agent = Agent::new(mock_config());
        let text = r#"
        ```json
        not valid json
        ```
        "#;
        let calls = agent.extract_tool_calls(text);
        assert!(calls.is_empty());
    }

    #[test]
    fn agent_new_default() {
        let agent = Agent::new(mock_config());
        assert_eq!(agent.tools.names().len(), 0);
        assert_eq!(agent.skills.all().len(), 0);
    }

    #[test]
    fn agent_with_tool_and_skill() {
        use super::super::tool::Tool;
        use super::super::tool::ToolContext;
        use super::super::tool::ToolResult;
        use serde_json::json;

        struct T;
        impl Tool for T {
            fn name(&self) -> &'static str { "t" }
            fn description(&self) -> &'static str { "d" }
            fn parameters_schema(&self) -> Value { json!({}) }
            fn execute(&self, _a: Value, _c: &ToolContext) -> Result<ToolResult, String> {
                Ok(ToolResult::ok("ok", json!({})))
            }
        }
        struct S;
        impl Skill for S {
            fn name(&self) -> &'static str { "s" }
            fn label(&self) -> &'static str { "S" }
            fn system_prompt(&self) -> &'static str { "p" }
        }
        let agent = Agent::new(mock_config())
            .with_tool(Arc::new(T))
            .with_skill(Arc::new(S));
        assert_eq!(agent.tools.names(), vec!["t"]);
        assert_eq!(agent.skills.all().len(), 1);
    }
}
