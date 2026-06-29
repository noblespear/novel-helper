// 划线操作 hook:把 润色/续写/重写/复制 转换成实际的 AI 调用或剪贴板

import { useCallback } from "react";
import { useAppStore } from "../stores/app";
import { api } from "../lib/api";
import { getEditorApi } from "../lib/editorBridge";
import { wrapAiContent } from "../lib/aiRegion";
import type { ChatMessage, PromptTemplates, Character, LoreEntry } from "../types";
import type { SelectionAction } from "../components/SelectionToolbar";

const DEFAULT_PROMPTS: PromptTemplates = {
  polish_selection:
    "你是一个中文网文润色助手。保持作者文风,只改不通顺、错别字、明显病句。直接返回润色后的文本,不要解释、不要 markdown 包裹。",
  polish_chapter:
    "你是一个中文网文润色助手。保持作者文风,只改不通顺、错别字、明显病句。直接返回润色后的全文,不要解释。",
  continue_write:
    "你是中文网文续写助手。基于上下文信息续写约 200-300 字,保持文风一致,情节连贯。只返回续写内容,不要解释。",
  character_design: "你是网文编辑,擅长角色设计。",
  general_chat:
    "你是一个中文网文写作助手,帮作者构思、答疑、激发灵感。回答简洁有针对性,优先给可执行的具体建议。",
  rewrite:
    "你是中文网文改写助手。保持原意,把用户给的文本换一种更生动的表达方式重写,保留关键情节,只调整文笔、句式、视角细节。直接返回改写后的文本,不要解释。",
};

function renderTemplate(tpl: string, text: string, chapterTitle: string): string {
  return tpl.replace(/\{text\}/g, text).replace(/\{chapter_title\}/g, chapterTitle);
}

/**
 * 构建续写上下文：包含最近章节摘要、角色信息、设定信息
 */
async function buildContinueContext(
  projectId: string,
  currentChapterId: string,
  chapters: Array<{ id: string; title: string; outline: string; word_count: number }>,
  recentCount: number = 3
): Promise<string> {
  const contextParts: string[] = [];

  // 1. 获取最近几章的摘要（滑动窗口）
  const currentIdx = chapters.findIndex((c) => c.id === currentChapterId);
  if (currentIdx >= 0) {
    const recentChapters = chapters.slice(Math.max(0, currentIdx - recentCount), currentIdx);
    if (recentChapters.length > 0) {
      const summaries = recentChapters
        .filter((c) => c.outline || c.word_count > 0)
        .map((c) => `【${c.title}】${c.outline || "(无大纲)"}`)
        .join("\n");
      if (summaries) {
        contextParts.push(`## 前文概要\n${summaries}`);
      }
    }
  }

  // 2. 获取角色信息
  try {
    const characters = await api.listCharacters(projectId);
    if (characters.length > 0) {
      const charInfo = characters
        .slice(0, 10) // 限制数量避免 token 超限
        .map((c: Character) => {
          const parts = [`姓名：${c.name}`];
          if (c.personality) parts.push(`性格：${c.personality}`);
          if (c.speaking_style) parts.push(`说话风格：${c.speaking_style}`);
          return parts.join("，");
        })
        .join("\n");
      contextParts.push(`## 角色信息\n${charInfo}`);
    }
  } catch {
    // 忽略角色加载失败
  }

  // 3. 获取设定信息（只取前5条重要的）
  try {
    const lore = await api.loadLore(projectId);
    if (lore.length > 0) {
      const loreInfo = lore
        .slice(0, 5)
        .map((l: LoreEntry) => `【${l.name}】${l.description || l.details.slice(0, 100)}`)
        .join("\n");
      contextParts.push(`## 世界观设定\n${loreInfo}`);
    }
  } catch {
    // 忽略设定加载失败
  }

  return contextParts.join("\n\n");
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
  const { aiConfig, currentProjectId, currentChapterId, chapters } = useAppStore();

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

      // 构建系统提示
      let systemPrompt = renderTemplate(
        pickPrompt(templates, promptKey),
        text,
        chapterTitle
      );

      // 续写时注入上下文
      if (action === "continue" && currentProjectId && currentChapterId) {
        try {
          const context = await buildContinueContext(
            currentProjectId,
            currentChapterId,
            chapters
          );
          if (context) {
            systemPrompt = `${systemPrompt}\n\n## 上下文信息\n${context}`;
          }
        } catch (e) {
          console.error("Failed to build context:", e);
        }
      }

      // 流式拉取 AI 响应
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ];

      console.log("[AI] Starting request, model:", aiConfig?.model);

      let acc = "";
      let lastChunkTime = Date.now();
      let timedOut = false;
      const TIMEOUT_MS = 30000; // 30秒无数据视为超时

      // 超时检测定时器
      const timeoutCheck = setInterval(() => {
        if (Date.now() - lastChunkTime > TIMEOUT_MS) {
          timedOut = true;
          clearInterval(timeoutCheck);
          console.error("[AI] Timeout: no data for 30s");
        }
      }, 1000);

      const editorApi = getEditorApi();
      try {
        await api.aiChatStream(messages, (chunk) => {
          lastChunkTime = Date.now();
          if (chunk.done) {
            clearInterval(timeoutCheck);
            console.log("[AI] Stream done, total length:", acc.length);
            return;
          }
          acc += chunk.content;
        });
        clearInterval(timeoutCheck);
      } catch (e) {
        clearInterval(timeoutCheck);
        console.error("[AI] Action failed:", e);
        return { content: `[错误] ${e}`, apply: () => {} };
      }

      if (timedOut) {
        return { content: "[错误] AI 响应超时，请检查网络和 API 设置", apply: () => {} };
      }

      if (!acc) {
        return { content: "[错误] AI 返回了空内容", apply: () => {} };
      }

      console.log("[AI] Completed, response length:", acc.length);

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
    [aiConfig, currentProjectId, currentChapterId, chapters]
  );

  return { handleAction };
}
