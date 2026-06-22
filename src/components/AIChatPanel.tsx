// AI 助手右栏 - 简洁的聊天界面

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/app";
import { api } from "../lib/api";
import { getEditorApi } from "../lib/editorBridge";
import { DiffView } from "./DiffView";
import type { ChatMessage } from "../types";

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
  const listRef = useRef<HTMLDivElement>(null);

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

    const systemMsg: ChatMessage | null = systemPrompt
      ? { role: "system", content: systemPrompt }
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
                  ? { ...m, content: m.content, streaming: false }
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
        const sys = `你是一个中文网文润色助手。保持作者文风,只改不通顺、错别字、明显病句。直接返回润色后的文本,不要解释、不要 markdown 包裹。`;
        send(editorSel, sys, "polish-selection", editorSel);
      },
    },
    {
      label: "📝 润色本章",
      requiresChapter: true,
      action: () => {
        const chapter = chapters.find((c) => c.id === currentChapterId);
        if (!chapter) return;
        const sys = `你是一个中文网文润色助手。保持作者文风,只改不通顺、错别字、明显病句。直接返回润色后的全文,不要解释。`;
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
        const sys = `你是中文网文续写助手。基于用户给的正文续写约 200 字,保持文风一致,情节连贯。只返回续写内容,不要解释。`;
        send(context, sys, "continue", context);
      },
    },
    {
      label: "🎭 角色建议",
      action: () => send("基于常见网文模式,给我 3 个有张力的主角人设方向,每个 50 字以内", `你是网文编辑,擅长角色设计。`, "general"),
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
                  {m.content || (m.streaming ? "思考中..." : "")}
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
              : currentChapterId
              ? "输入消息... (Shift+Enter 换行)"
              : "先选择章节"
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
