//! Agent 框架 - Tool + Skill + Agent
//!
//! ## 设计
//! - **Tool**: 原子能力(读文件、查 KB)。纯函数式,接收 JSON args,返回 JSON result。
//! - **Skill**: 一组相关的工具 + 系统提示 + 输入模板,代表一个 AI 能力(润色、续写、roleplay 等)。
//! - **Agent**: 接收 user input → 选 skill → 调 LLM → LLM 调用 tool → 循环,直到 LLM 决定结束。
//!
//! ## 协议
//! - LLM 用 OpenAI function calling 协议返回 tool_calls
//! - tool 收到 args(JSON),返回 result(JSON)给 LLM
//! - LLM 看到 tool result 后继续生成,直到不再调用 tool

pub mod skill;
pub mod tool;
pub mod executor;
pub mod registry;
pub mod tools;
pub mod skills;
pub mod roleplay_skill;

pub use skill::{Skill, SkillContext, SkillOutput, SkillChunk, BuiltinSkills, ToolCallRecord};
pub use tool::{Tool, ToolContext, ToolResult, tool_to_openai_format};
pub use executor::Agent;
pub use registry::{SkillRegistry, ToolRegistry};
pub use tools::{
    SearchFtsTool, ReadChapterTool, ListChaptersTool, ReadOutlineTool, ListCharactersTool,
};
pub use skills::RecallSkill;
pub use roleplay_skill::{RoleplaySkill, build_roleplay_system_prompt};
