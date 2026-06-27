// 划线操作 hook:把 润色/续写/重写/复制 转换成实际的 AI 调用或剪贴板

import { useCallback } from "react";
import { useAppStore } from "../stores/app";
import { api } from "../lib/api";
import { getEditorApi } from "../lib/editorBridge";
import { wrapAiContent } from "../lib/aiRegion";
import type { ChatMessage, PromptTemplates } from "../types";
import type { SelectionAction } from "../components/SelectionToolbar";

const DEFAULT_PROMPTS: PromptTemplates = {
  polish_selection:
    "你是一个中文网文润色助手。保持作者文风,只改不通顺、错别字、明显病句。直接返回润色后的文本,不要解释、不要 markdown 包裹。",
  polish_chapter:
    "你是一个中文网文润色助手。保持作者文风,只改不通顺、错别字、明显病句。直接返回润色后的全文,不要解释。",
  continue_write:
    "你是中文网文续写助手。基于用户给的正文续写约 200 字,保持文风一致,情节连贯。只返回续写内容,不要解释。",
  character_design: "你是网文编辑,擅长角色设计。",
  general_chat:
    "你是一个中文网文写作助手,帮作者构思、答疑、激发灵感。回答简洁有针对性,优先给可执行的具体建议。",
  rewrite:
    "你是中文网文改写助手。保持原意,把用户给的文本换一种更生动的表达方式重写,保留关键情节,只调整文笔、句式、视角细节。直接返回改写后的文本,不要解释。",
};

function renderTemplate(tpl: string, text: string, chapterTitle: string): string {
  return tpl.replace(/\{text\}/g, text).replace(/\{chapter_title\}/g, chapterTitle);
}

function pickPrompt(
  templates: PromptTemplates | null | undefined,
  key: keyof PromptTemplates
): string {
  const t = templates?.[key]?.trim();
  return t && t.length > 0 ? t : DEFAULT_PROMPTS[key];
}

export interface SelectionActionResult {
  /// 落到编辑器:replace 把 AI 输出(带 HTML 注释)插入到原选区,insert 续写在选区后
  apply: (mode: "replace" | "insert") => void;
  /// AI 输出文本(纯,不含注释)
  content: string;
  /// AI 区域 id(可选)
  regionId?: string;
}

export function useSelectionAction() {
  const { aiConfig, currentChapterId, chapters } = useAppStore();

  const handleAction = useCallback(
    async (action: SelectionAction, text: string): Promise<SelectionActionResult | null> => {
      if (action === "copy") {
        await navigator.clipboard.writeText(text);
        return { content: text, apply: () => {} };
      }

      // 读 prompt 模板(从后端拉取失败时用默认)
      let templates: PromptTemplates | null = null;
      try {
        templates = await api.getPromptTemplates();
      } catch {
        templates = null;
      }

      const chapter = chapters.find((c) => c.id === currentChapterId);
      const chapterTitle = chapter?.title ?? "";

      let promptKey: keyof PromptTemplates;
      let userMsg = text;
      let applyMode: "replace" | "insert" = "replace";

      if (action === "polish") {
        promptKey = "polish_selection";
      } else if (action === "continue") {
        promptKey = "continue_write";
        applyMode = "insert";
      } else if (action === "rewrite") {
        promptKey = "rewrite";
      } else {
        return null;
      }

      const systemPrompt = renderTemplate(
        pickPrompt(templates, promptKey),
        text,
        chapterTitle
      );

      // 流式拉取 AI 响应
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ];

      let acc = "";
      const editorApi = getEditorApi();
      try {
        await api.aiChatStream(messages, (chunk) => {
          if (chunk.done) return;
          acc += chunk.content;
        });
      } catch (e) {
        console.error("AI action failed:", e);
        return { content: `[错误] ${e}`, apply: () => {} };
      }

      // 包装为 AI 区域(带 HTML 注释,CodeMirror decoration 解析)
      const { wrapped, id } = wrapAiContent(
        acc,
        text,
        applyMode === "insert" ? "insert" : "replace"
      );

      return {
        content: acc,
        regionId: id,
        apply: (mode) => {
          if (!editorApi) return;
          if (mode === "replace") {
            // 替换原选区为带注释的 AI 输出
            editorApi.replaceSelection(wrapped);
          } else {
            // 续写:在当前光标处插入带注释的 AI 输出
            editorApi.insertAtCursor(wrapped);
          }
        },
      };
    },
    [aiConfig, currentChapterId, chapters]
  );

  return { handleAction };
}
