// Agent 面板 - 调用 Skill 处理用户请求,流式展示

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { SkillMeta, ChatChunk } from "../types";

interface AgentPanelProps {
  projectId: string;
}

interface AgentMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  toolCalls?: string[];
  streaming?: boolean;
}

export function AgentPanel({ projectId }: AgentPanelProps) {
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [currentSkill, setCurrentSkill] = useState<string>("recall");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listSkills().then(setSkills).catch(() => setSkills([]));
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: AgentMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const agentId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: agentId, role: "agent", content: "", streaming: true, toolCalls: [] },
    ]);
    setInput("");
    setBusy(true);

    try {
      await api.runSkill(projectId, currentSkill, text, (chunk: ChatChunk) => {
        if (chunk.done) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentId ? { ...m, streaming: false } : m
            )
          );
          setBusy(false);
        } else {
          // 检测 [工具:xxx] 这种消息
          const toolMatch = chunk.content.match(/^\[工具: ([^\]]+)\]$/);
          if (toolMatch) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentId
                  ? {
                      ...m,
                      toolCalls: [...(m.toolCalls || []), toolMatch[1]],
                    }
                  : m
              )
            );
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentId
                  ? { ...m, content: m.content + chunk.content }
                  : m
              )
            );
          }
        }
      });
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentId
            ? { ...m, content: `[错误] ${e}`, streaming: false }
            : m
        )
      );
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full text-sm">
      {/* 头部: skill 选择器 */}
      <div
        className="px-3 py-2 border-b flex items-center gap-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span className="text-xs text-muted">Skill:</span>
        <select
          className="input text-xs flex-1"
          value={currentSkill}
          onChange={(e) => setCurrentSkill(e.target.value)}
          disabled={busy}
        >
          {skills.map((s) => (
            <option key={s.name} value={s.name}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* 消息列表 */}
      <div ref={listRef} className="flex-1 overflow-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-muted text-xs text-center mt-8">
            <p className="mb-2">选择 Skill,输入请求</p>
            <p>Agent 会自动调用工具检索知识库</p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "text-right" : ""}
            >
              {m.role === "user" ? (
                <div
                  className="inline-block max-w-[90%] px-3 py-2 rounded-lg text-left whitespace-pre-wrap"
                  style={{
                    background:
                      "var(--color-accent-soft-bg, rgba(229, 165, 92, 0.12))",
                    color: "var(--color-accent)",
                  }}
                >
                  {m.content}
                </div>
              ) : (
                <div
                  className="inline-block max-w-[95%] px-3 py-2 rounded-lg text-left"
                  style={{
                    background: "var(--color-elevated)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {m.toolCalls.map((tc, i) => (
                        <span
                          key={i}
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            background: "var(--color-accent-soft-bg, rgba(229, 165, 92, 0.12))",
                            color: "var(--color-accent)",
                          }}
                        >
                          🔧 {tc}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">
                    {m.content || (m.streaming ? "思考中..." : "")}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 输入 */}
      <div
        className="border-t p-2 flex gap-1"
        style={{ borderColor: "var(--color-border)" }}
      >
        <textarea
          className="input flex-1 text-sm min-h-[40px] max-h-24 resize-y"
          placeholder={`向 ${skills.find((s) => s.name === currentSkill)?.label || currentSkill} 提问...`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={busy}
        />
        <button
          className="btn btn-primary text-sm px-3"
          onClick={send}
          disabled={busy || !input.trim()}
        >
          {busy ? "..." : "发送"}
        </button>
      </div>
    </div>
  );
}
