//! 内置 Tool 实现
//!
//! Stage 2 包含 5 个核心工具,后续 Stage 按需添加

use crate::agent::tool::{Tool, ToolContext, ToolResult};
use crate::kb::pipeline::{KbPaths, KbPipeline};
use crate::kb::KbMeta;
use serde_json::{json, Value};
use std::path::PathBuf;
use walkdir::WalkDir;

// ============== search_fts ==============
pub struct SearchFtsTool;

impl Tool for SearchFtsTool {
    fn name(&self) -> &'static str {
        "search_fts"
    }
    fn description(&self) -> &'static str {
        "在项目的知识库中用关键词搜索相关文本片段(FTS5 + jieba 中文分词)"
    }
    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索关键词(中文/英文)"},
                "limit": {"type": "integer", "description": "返回结果数,默认 5"}
            },
            "required": ["query"]
        })
    }
    fn execute(&self, args: Value, ctx: &ToolContext) -> Result<ToolResult, String> {
        let query = args["query"]
            .as_str()
            .ok_or("missing query")?
            .to_string();
        let limit = args["limit"].as_u64().unwrap_or(5) as usize;
        let project_dir = project_dir_from_ctx(ctx)?;
        let paths = KbPaths::for_project(&project_dir);
        let meta = crate::kb::pipeline::load_meta(&paths).unwrap_or_default();
        let kb = KbPipeline::open(paths, meta)?;
        let hits = kb.search_fts(&query, limit)?;
        let summary = if hits.is_empty() {
            format!("未找到与「{}」相关的片段", query)
        } else {
            format!("找到 {} 条相关片段", hits.len())
        };
        let data = json!({
            "query": query,
            "hits": hits,
        });
        Ok(ToolResult::ok(summary, data))
    }
}

// ============== read_chapter ==============
pub struct ReadChapterTool;

impl Tool for ReadChapterTool {
    fn name(&self) -> &'static str {
        "read_chapter"
    }
    fn description(&self) -> &'static str {
        "读取指定章节的完整内容"
    }
    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "chapter_id": {"type": "string", "description": "章节 ID"}
            },
            "required": ["chapter_id"]
        })
    }
    fn execute(&self, args: Value, ctx: &ToolContext) -> Result<ToolResult, String> {
        let chapter_id = args["chapter_id"]
            .as_str()
            .ok_or("missing chapter_id")?
            .to_string();
        let project_dir = project_dir_from_ctx(ctx)?;
        let chapter_dir = project_dir
            .join("chapters")
            .join(&chapter_id);
        let content_path = chapter_dir.join("content.md");
        if !content_path.exists() {
            return Ok(ToolResult::err(format!("章节不存在: {}", chapter_id)));
        }
        let content = std::fs::read_to_string(&content_path).map_err(|e| e.to_string())?;
        let summary = format!("已读取章节 {} ({} 字)", chapter_id, content.chars().count());
        Ok(ToolResult::ok(summary, json!({
            "chapter_id": chapter_id,
            "content": content,
        })))
    }
}

// ============== list_chapters ==============
pub struct ListChaptersTool;

impl Tool for ListChaptersTool {
    fn name(&self) -> &'static str {
        "list_chapters"
    }
    fn description(&self) -> &'static str {
        "列出项目的所有章节(标题 + 字数 + 状态)"
    }
    fn parameters_schema(&self) -> Value {
        json!({"type": "object", "properties": {}})
    }
    fn execute(&self, _args: Value, ctx: &ToolContext) -> Result<ToolResult, String> {
        let project_dir = project_dir_from_ctx(ctx)?;
        let chapters_dir = project_dir.join("chapters");
        if !chapters_dir.exists() {
            return Ok(ToolResult::ok("项目还没有章节", json!({"chapters": []})));
        }
        let mut chapters: Vec<Value> = Vec::new();
        for entry in WalkDir::new(&chapters_dir)
            .max_depth(2)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_name() == "meta.json" {
                let path = entry.path();
                if let Ok(s) = std::fs::read_to_string(path) {
                    if let Ok(v) = serde_json::from_str::<Value>(&s) {
                        chapters.push(v);
                    }
                }
            }
        }
        let count = chapters.len();
        let summary = format!("共 {} 个章节", count);
        Ok(ToolResult::ok(summary, json!({"chapters": chapters})))
    }
}

// ============== read_outline ==============
pub struct ReadOutlineTool;

impl Tool for ReadOutlineTool {
    fn name(&self) -> &'static str {
        "read_outline"
    }
    fn description(&self) -> &'static str {
        "读取项目的总大纲(根目录的 outline.md)"
    }
    fn parameters_schema(&self) -> Value {
        json!({"type": "object", "properties": {}})
    }
    fn execute(&self, _args: Value, ctx: &ToolContext) -> Result<ToolResult, String> {
        let project_dir = project_dir_from_ctx(ctx)?;
        let outline = project_dir.join("outline.md");
        if !outline.exists() {
            return Ok(ToolResult::ok("暂无大纲", json!({"outline": ""})));
        }
        let content = std::fs::read_to_string(&outline).map_err(|e| e.to_string())?;
        let summary = format!("已读取大纲 ({} 字)", content.chars().count());
        Ok(ToolResult::ok(summary, json!({"outline": content})))
    }
}

// ============== list_characters ==============
pub struct ListCharactersTool;

impl Tool for ListCharactersTool {
    fn name(&self) -> &'static str {
        "list_characters"
    }
    fn description(&self) -> &'static str {
        "列出项目的所有角色"
    }
    fn parameters_schema(&self) -> Value {
        json!({"type": "object", "properties": {}})
    }
    fn execute(&self, _args: Value, ctx: &ToolContext) -> Result<ToolResult, String> {
        let project_dir = project_dir_from_ctx(ctx)?;
        let chars_file = project_dir.join("characters.json");
        if !chars_file.exists() {
            return Ok(ToolResult::ok("暂无角色", json!({"characters": []})));
        }
        let s = std::fs::read_to_string(&chars_file).map_err(|e| e.to_string())?;
        let characters: Value = serde_json::from_str(&s).unwrap_or_else(|_| json!([]));
        let count = characters.as_array().map(|a| a.len()).unwrap_or(0);
        let summary = format!("共 {} 个角色", count);
        Ok(ToolResult::ok(summary, json!({"characters": characters})))
    }
}

// ============== helpers ==============
fn project_dir_from_ctx(ctx: &ToolContext) -> Result<PathBuf, String> {
    // 通过 project_id 反推 project_dir
    // 项目目录结构: <projects_dir>/projects/<id>/
    // 但 projects_dir 在 ToolContext 里没有,需要从 shared 取
    if let Some(v) = ctx.shared_get("projects_dir") {
        let projects_dir = v.as_str().ok_or("projects_dir not string")?;
        Ok(PathBuf::from(projects_dir)
            .join("projects")
            .join(&ctx.project_id))
    } else {
        Err("ToolContext 缺少 projects_dir".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn setup_project() -> (PathBuf, ToolContext) {
        let tmp = std::env::temp_dir().join(format!("agent_test_{}", uuid::Uuid::new_v4()));
        let projects_dir = tmp.clone();
        let project_id = "proj1";
        let project_dir = projects_dir.join("projects").join(project_id);
        fs::create_dir_all(&project_dir).unwrap();
        let mut ctx = ToolContext::new(project_id, "test");
        ctx.shared_set("projects_dir", json!(projects_dir.to_string_lossy()));
        (tmp, ctx)
    }

    #[test]
    fn read_chapter_works() {
        let (tmp, ctx) = setup_project();
        let chapter_id = "ch1";
        let chapter_dir = tmp
            .join("projects")
            .join("proj1")
            .join("chapters")
            .join(chapter_id);
        fs::create_dir_all(&chapter_dir).unwrap();
        fs::write(chapter_dir.join("content.md"), "林枫走进了青竹林。").unwrap();
        let tool = ReadChapterTool;
        let r = tool.execute(json!({"chapter_id": chapter_id}), &ctx).unwrap();
        assert!(r.ok);
        assert!(r.data["content"].as_str().unwrap().contains("林枫"));
    }

    #[test]
    fn read_chapter_missing() {
        let (_tmp, ctx) = setup_project();
        let tool = ReadChapterTool;
        let r = tool.execute(json!({"chapter_id": "nope"}), &ctx).unwrap();
        assert!(!r.ok);
    }

    #[test]
    fn list_chapters_empty() {
        let (_tmp, ctx) = setup_project();
        let tool = ListChaptersTool;
        let r = tool.execute(json!({}), &ctx).unwrap();
        assert!(r.ok);
        assert_eq!(r.data["chapters"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn read_outline_missing() {
        let (_tmp, ctx) = setup_project();
        let tool = ReadOutlineTool;
        let r = tool.execute(json!({}), &ctx).unwrap();
        assert!(r.ok);
    }

    #[test]
    fn list_characters_empty() {
        let (_tmp, ctx) = setup_project();
        let tool = ListCharactersTool;
        let r = tool.execute(json!({}), &ctx).unwrap();
        assert!(r.ok);
    }

    #[test]
    fn project_dir_from_ctx_works() {
        let (_tmp, ctx) = setup_project();
        let p = project_dir_from_ctx(&ctx).unwrap();
        assert!(p.ends_with("projects/proj1"));
    }

    #[test]
    fn project_dir_from_ctx_missing() {
        let ctx = ToolContext::new("p", "s");
        let r = project_dir_from_ctx(&ctx);
        assert!(r.is_err());
    }

    #[test]
    fn search_fts_runs() {
        let (_tmp, ctx) = setup_project();
        let tool = SearchFtsTool;
        let r = tool.execute(json!({"query": "林枫"}), &ctx).unwrap();
        // 没有 KB 索引,会返回空,不报错
        assert!(r.ok);
    }
}
