// AI 助手右栏 - 简洁的聊天界面

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/app";
import { api } from "../lib/api";
import { getEditorApi } from "../lib/editorBridge";
import { DiffView } from "./DiffView";
import type { ChatMessage, PromptTemplates } from "../types";

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
};

function renderTemplate(tpl: string, text: string, chapterTitle: string): string {
  return tpl.replace(/\{text\}/g, text).replace(/\{chapter_title\}/g, chapterTitle);
}

function pickPrompt(templates: PromptTemplates | null, key: keyof PromptTemplates): string {
  const t = templates?.[key]?.trim();
  return t && t.length > 0 ? t : DEFAULT_PROMPTS[key];
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  streaming?: boolean;
  timestamp: number;
  // 润色/续写专用: 与该回复关联的原始文本
  polishOriginal?: string;
  polishKind?: "polish-selection" | "polish-chapter" | "continue" | "general";
}

export function AIChatPanel() {
  const { currentChapterId, chapters, aiConfig, setRightPanel } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState(0);
  const [selection, setSelection] = useState("");
  const [templates, setTemplates] = useState<PromptTemplates | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 加载提示词模板
  useEffect(() => {
    api
      .getPromptTemplates()
      .then((t) => setTemplates(t))
      .catch(() => setTemplates(null));
  }, []);

  // 定时轮询编辑器选区(只在 chat 面板挂载期间)
  useEffect(() => {
    const id = setInterval(() => {
      const sel = getEditorApi()?.getSelection() ?? "";
      setSelection(sel);
    }, 400);
    return () => clearInterval(id);
  }, []);

  // 自动滚到底
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (
    text?: string,
    systemPrompt?: string,
    polishKind?: Message["polishKind"],
    polishOriginal?: string
  ) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: Date.now(),
    };

    // 构造消息列表
    const historyMsgs: ChatMessage[] = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // 默认 system 提示(空字符串不发送 system 消息)
    let effectiveSystem = systemPrompt ?? "";
    if (!effectiveSystem) {
      const tpl = pickPrompt(templates, "general_chat");
      effectiveSystem = tpl;
    }

    const systemMsg: ChatMessage | null = effectiveSystem
      ? { role: "system", content: effectiveSystem }
      : null;

    const allMsgs: ChatMessage[] = [
      ...(systemMsg ? [systemMsg] : []),
      ...historyMsgs,
      { role: "user", content },
    ];

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);

    // 占位 assistant 消息
    const assistantId = `msg-${Date.now()}-ai`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        timestamp: Date.now(),
        polishKind,
        polishOriginal,
      },
    ]);

    try {
      await api.aiChatStream(
        allMsgs,
        (chunk) => {
          if (chunk.done) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + chunk.content, streaming: false }
                  : m
              )
            );
            if (chunk.usage) {
              setTokens((t) => t + chunk.usage!.total_tokens);
            }
            setBusy(false);
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + chunk.content }
                  : m
              )
            );
          }
        }
      );
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `[错误] ${e}`, streaming: false }
            : m
        )
      );
      setBusy(false);
    }
  };

  const insertChapterContext = () => {
    const chapter = chapters.find((c) => c.id === currentChapterId);
    if (!chapter) return;
    const preview = chapter.content.slice(0, 500);
    setInput(
      (prev) =>
        prev +
        (prev ? "\n\n" : "") +
        `[当前章节: ${chapter.title}]\n${preview}...`
    );
  };

  const quickPrompts = [
    {
      label: "🎯 润色选区",
      requiresSelection: true,
      action: () => {
        const editorSel = getEditorApi()?.getSelection() ?? "";
        if (!editorSel.trim()) {
          alert("请先在编辑器中选中要润色的文本");
          return;
        }
        const chapter = chapters.find((c) => c.id === currentChapterId);
        const sys = renderTemplate(
          pickPrompt(templates, "polish_selection"),
          editorSel,
          chapter?.title ?? ""
        );
        send(editorSel, sys, "polish-selection", editorSel);
      },
    },
    {
      label: "📝 润色本章",
      requiresChapter: true,
      action: () => {
        const chapter = chapters.find((c) => c.id === currentChapterId);
        if (!chapter) return;
        const sys = renderTemplate(
          pickPrompt(templates, "polish_chapter"),
          chapter.content,
          chapter.title
        );
        send(chapter.content, sys, "polish-chapter", chapter.content);
      },
    },
    {
      label: "➡️ 续写 200 字",
      requiresChapter: true,
      action: () => {
        const chapter = chapters.find((c) => c.id === currentChapterId);
        if (!chapter) return;
        const context = chapter.content.slice(-500);
        const sys = renderTemplate(
          pickPrompt(templates, "continue_write"),
          context,
          chapter.title
        );
        send(context, sys, "continue", context);
      },
    },
    {
      label: "🎭 角色建议",
      action: () => {
        const sys = pickPrompt(templates, "character_design");
        send(
          "基于常见网文模式,给我 3 个有张力的主角人设方向,每个 50 字以内",
          sys,
          "general"
        );
      },
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-3 py-2 border-b text-xs flex items-center justify-between"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span className="text-muted">会话</span>
        <span className="text-muted">
          {aiConfig?.provider_type || "未配置"} · {aiConfig?.model || "—"} · {tokens} tok
        </span>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-xs text-muted text-center py-8">
            <p>开始与 AI 助手对话</p>
            <p className="mt-2">或使用下方快捷指令</p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`text-sm ${m.role === "user" ? "text-right" : ""}`}
          >
            <div
              className="inline-block max-w-[90%] px-3 py-2 rounded-lg text-left whitespace-pre-wrap"
              style={{
                background:
                  m.role === "user"
                    ? "var(--color-accent-soft-bg, rgba(229, 165, 92, 0.12))"
                    : "var(--color-elevated)",
                color: m.role === "user" ? "var(--color-accent)" : "var(--color-text)",
                border:
                  m.role === "assistant"
                    ? "1px solid var(--color-border)"
                    : "none",
              }}
            >
              {m.role === "assistant" &&
              m.polishKind &&
              m.polishKind !== "general" &&
              m.polishOriginal &&
              !m.streaming &&
              m.content ? (
                <DiffView
                  title={
                    m.polishKind === "polish-selection"
                      ? "选区润色建议"
                      : m.polishKind === "polish-chapter"
                      ? "本章润色建议"
                      : "续写建议"
                  }
                  original={m.polishOriginal}
                  revised={m.content}
                  onAccept={() => {
                    const api = getEditorApi();
                    if (!api) return;
                    if (m.polishKind === "polish-selection") {
                      api.replaceSelection(m.content);
                    } else if (m.polishKind === "polish-chapter") {
                      // 危险操作:先确认
                      if (confirm("确认用 AI 建议替换整章内容?\n建议先复制到备份再确认。")) {
                        api.setFullText(m.content);
                      }
                    } else if (m.polishKind === "continue") {
                      api.insertAtCursor(m.content);
                    }
                  }}
                  onReject={() => {
                    // 标记为已拒绝:把消息内容替换为简短说明
                    setMessages((prev) =>
                      prev.map((x) =>
                        x.id === m.id ? { ...x, content: `(${x.polishKind} 已拒绝)`, polishKind: "general" } : x
                      )
                    );
                  }}
                />
              ) : (
                <>
                  {m.content ||
                    (m.streaming
                      ? "思考中..."
                      : <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>(空响应 — 检查 AI 设置 / 网络 / API Key)</span>)}
                  {m.streaming && m.content && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 6,
                        height: 12,
                        background: "var(--color-accent)",
                        marginLeft: 4,
                        animation: "blink 1s infinite",
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div
        className="px-3 py-2 border-t flex gap-1.5 overflow-x-auto"
        style={{ borderColor: "var(--color-border)" }}
      >
        {quickPrompts.map((p) => {
          const isSelection = "requiresSelection" in p && p.requiresSelection;
          const isChapter = "requiresChapter" in p && p.requiresChapter;
          const isSel = isSelection && selection.trim().length > 0;
          const disabled = busy || (isSelection ? !isSel : !currentChapterId);
          return (
            <button
              key={p.label}
              onClick={p.action}
              disabled={disabled}
              className="btn text-xs px-2 py-1 whitespace-nowrap"
              style={{
                borderColor: isSel ? "var(--color-accent)" : undefined,
                color: isSel ? "var(--color-accent)" : undefined,
              }}
              title={
                isSelection && !isSel
                  ? "先在编辑器中选中文本"
                  : isChapter && !currentChapterId
                  ? "先选择章节"
                  : ""
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Input */}
      <div
        className="p-3 border-t"
        style={{ borderColor: "var(--color-border)" }}
      >
        <textarea
          className="input min-h-[60px] max-h-32 resize-y text-sm"
          placeholder={
            !aiConfig
              ? "请先在设置中配置 AI"
              : "输入消息... (Shift+Enter 换行,Enter 发送)"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={busy || !aiConfig}
        />
        <div className="flex items-center justify-between mt-2">
          <button
            className="text-xs text-muted hover:text-default"
            onClick={insertChapterContext}
            disabled={!currentChapterId}
          >
            📎 引用当前章节
          </button>
          <button
            className="btn btn-primary text-xs"
            onClick={() => send()}
            disabled={busy || !input.trim() || !aiConfig}
          >
            {busy ? "生成中..." : "发送"}
          </button>
        </div>
      </div>

      <style>{`@keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }`}</style>
    </div>
  );
}
