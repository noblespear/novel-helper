//! 内置 Skill 实现
//!
//! Stage 2: 仅 recall(用 search_fts tool)
//! 后续 Stage 添加 polish / continue / rewrite / roleplay 等

use crate::agent::skill::{Skill, SkillContext};
use crate::agent::tools::{ListChaptersTool, ReadOutlineTool, SearchFtsTool};

/// recall: 知识库召回
/// 用 search_fts / list_chapters / read_outline 找信息
pub struct RecallSkill;

impl RecallSkill {
    pub fn new() -> Self {
        Self
    }
}

impl Default for RecallSkill {
    fn default() -> Self {
        Self::new()
    }
}

impl Skill for RecallSkill {
    fn name(&self) -> &'static str {
        "recall"
    }
    fn label(&self) -> &'static str {
        "📚 知识召回"
    }
    fn system_prompt(&self) -> &'static str {
        "你是网文作者的 AI 助理,负责在知识库中查找信息。\n\
         你有这些工具:\n\
         - search_fts: 关键词全文检索(适合找人名/地名/事件)\n\
         - list_chapters: 列出所有章节\n\
         - read_outline: 读取总大纲\n\
         - read_chapter: 读取某个章节完整内容\n\
         \n\
         规则:\n\
         1. 收到用户问题后,先想需要查什么\n\
         2. 需要调用工具时,用 ```json\\n{\"tool\": \"...\", \"args\": {...}}\\n``` 格式\n\
         3. 工具结果会追加在消息中,你可以继续调其他工具\n\
         4. 信息足够了,直接用中文回答用户,引用具体来源(章节名/大纲)\n\
         5. 不要瞎编,找不到就明说"
    }
    fn tools(&self) -> Vec<&dyn crate::agent::tool::Tool> {
        // 这里不能直接用 Self::tool 那种 owned 形式,需要 Box<dyn Tool>
        // 但 Skill trait 返回 Vec<&dyn Tool>,所以 Skill 自己持有工具引用
        // 简化:tools 留空,executor 用全局 ToolRegistry
        vec![]
    }
    fn max_iterations(&self) -> usize {
        5
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recall_skill_metadata() {
        let s = RecallSkill::new();
        assert_eq!(s.name(), "recall");
        assert_eq!(s.label(), "📚 知识召回");
    }

    #[test]
    fn recall_skill_max_iterations() {
        let s = RecallSkill::new();
        assert_eq!(s.max_iterations(), 5);
    }
}
