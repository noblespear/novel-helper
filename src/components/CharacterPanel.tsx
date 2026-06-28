// 角色面板 - 统一管理 + 角色扮演(Agent 的家)
// 用户的指示:agent 本质要归入人物
// 这里实现:左边角色列表,右边选中后的详情(编辑 + 角色扮演 + 知识召回)

import { useEffect, useState, useRef } from "react";
import { api } from "../lib/api";
import type { Character, ChatChunk, Relationship, SearchHit } from "../types";

interface CharacterPanelProps {
  projectId: string;
}

type Mode = "edit" | "roleplay" | "recall";

export function CharacterPanel({ projectId }: CharacterPanelProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("edit");
  // editing 是当前正在编辑的字符(可能是新建的或已存在的)
  // selected 是右侧主显示用的(从 characters 找)
  const [editing, setEditing] = useState<Character | null>(null);

  const refresh = async () => {
    try {
      const list = await api.listCharacters(projectId);
      setCharacters(list);
      // 自动选中第一个
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id);
        setEditing({ ...list[0] });
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refresh();
  }, [projectId]);

  // 当 selectedId 改变时,如果 editing 不匹配(不是新建的),则同步
  // 否则保持 editing 不变(用户可能正在编辑刚选中的或新建的)
  useEffect(() => {
    if (!editing || editing.id !== selectedId) {
      const c = characters.find((x) => x.id === selectedId);
      if (c) setEditing({ ...c });
    }
  }, [selectedId, characters]);

  const selected = characters.find((c) => c.id === selectedId) || null;

  const createNew = () => {
    const newChar: Character = {
      id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      project_id: projectId,
      name: "新角色",
      avatar: "👤",
      personality: "",
      speaking_style: "",
      background: "",
      relationships: [],
      knowledge: "",
      enabled_skills: [],
      created_at: 0,
      updated_at: 0,
    };
    // 直接设置 editing,绕过 useEffect 等待 characters 列表
    setEditing(newChar);
    setSelectedId(newChar.id);
    setMode("edit");
  };

  const save = async () => {
    if (!editing) return;
    try {
      const saved = await api.upsertCharacter(projectId, editing);
      setEditing(saved);
      await refresh();
    } catch (e) {
      alert("保存失败: " + e);
    }
  };

  const del = async () => {
    if (!selectedId) return;
    if (!confirm(`删除「${selected?.name}」?`)) return;
    try {
      await api.deleteCharacter(projectId, selectedId);
      setSelectedId(null);
      await refresh();
    } catch (e) {
      alert("删除失败: " + e);
    }
  };

  return (
    <div className="flex flex-col h-full text-sm">
      {/* 顶部:角色列表（横向滚动） */}
      <div
        className="border-b p-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <button
            className="btn btn-primary text-xs px-2 py-1"
            onClick={createNew}
          >
            + 新角色
          </button>
          {characters.length === 0 && (
            <span className="text-xs text-muted">还没有角色，点击新建</span>
          )}
        </div>
        {characters.length > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {characters.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="shrink-0 px-2 py-1 rounded text-xs flex items-center gap-1"
                style={{
                  background:
                    c.id === selectedId
                      ? "var(--color-elevated)"
                      : "var(--color-bg)",
                  color: "var(--color-text)",
                  border:
                    c.id === selectedId
                      ? "1px solid var(--color-accent)"
                      : "1px solid var(--color-border)",
                }}
              >
                <span>{c.avatar || "👤"}</span>
                <span className="truncate max-w-[80px]">{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 下方:详情 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {(selected || (editing && editing.id === selectedId)) ? (
          <>
            <div
              className="px-3 py-2 border-b flex items-center gap-2 shrink-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="text-lg">{(selected || editing)?.avatar || "👤"}</span>
              <span className="font-medium flex-1 truncate">{(selected || editing)?.name}</span>
              {selected && (
                <button
                  onClick={del}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  删除
                </button>
              )}
            </div>
            <div
              className="flex border-b shrink-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              {(["edit", "roleplay", "recall"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex-1 py-1.5 text-xs"
                  style={{
                    borderBottom:
                      mode === m ? "2px solid var(--color-accent)" : "none",
                    color:
                      mode === m
                        ? "var(--color-accent)"
                        : "var(--color-text-muted)",
                  }}
                >
                  {m === "edit" ? "编辑" : m === "roleplay" ? "🎭 角色扮演" : "🔍 知识召回"}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-hidden">
              {mode === "edit" && editing && (
                <CharacterEditor
                  character={editing}
                  onChange={setEditing}
                  onSave={save}
                />
              )}
              {mode === "roleplay" && selected && (
                <RoleplayChat
                  projectId={projectId}
                  character={selected}
                />
              )}
              {mode === "recall" && selected && (
                <RecallPanel projectId={projectId} characterName={selected.name} />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted text-xs">
            选择一个角色或新建
          </div>
        )}
      </div>
    </div>
  );
}

function CharacterEditor({
  character,
  onChange,
  onSave,
}: {
  character: Character;
  onChange: (c: Character) => void;
  onSave: () => void;
}) {
  const update = <K extends keyof Character>(k: K, v: Character[K]) => {
    onChange({ ...character, [k]: v });
  };
  const updateRel = (idx: number, r: Relationship) => {
    const rels = [...character.relationships];
    rels[idx] = r;
    update("relationships", rels);
  };
  const addRel = () => {
    update("relationships", [
      ...character.relationships,
      { target: "", type: "朋友", description: "" },
    ]);
  };
  const delRel = (idx: number) => {
    update(
      "relationships",
      character.relationships.filter((_, i) => i !== idx)
    );
  };

  return (
    <div className="p-3 space-y-2 overflow-y-auto h-full">
      <div className="grid grid-cols-2 gap-2">
        <Field label="姓名">
          <input
            className="input text-sm"
            value={character.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </Field>
        <Field label="头像 (emoji)">
          <input
            className="input text-sm text-center"
            value={character.avatar || ""}
            onChange={(e) => update("avatar", e.target.value)}
            maxLength={4}
          />
        </Field>
      </div>
      <Field label="性格">
        <textarea
          className="input text-xs min-h-[50px] resize-y"
          value={character.personality}
          onChange={(e) => update("personality", e.target.value)}
          placeholder="例如:沉默寡言,内心细腻,对陌生人警惕"
        />
      </Field>
      <Field label="说话风格">
        <textarea
          className="input text-xs min-h-[40px] resize-y"
          value={character.speaking_style}
          onChange={(e) => update("speaking_style", e.target.value)}
          placeholder="例如:短句,常用反问,极少主动开口"
        />
      </Field>
      <Field label="背景">
        <textarea
          className="input text-xs min-h-[60px] resize-y"
          value={character.background}
          onChange={(e) => update("background", e.target.value)}
          placeholder="出身/经历/动机/..."
        />
      </Field>
      <Field label="该角色知道什么">
        <textarea
          className="input text-xs min-h-[50px] resize-y"
          value={character.knowledge}
          onChange={(e) => update("knowledge", e.target.value)}
          placeholder="角色掌握的信息(角色扮演时会被注入 system prompt)"
        />
      </Field>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted font-medium">人物关系</span>
          <button
            onClick={addRel}
            className="text-xs text-accent hover:underline"
            style={{ color: "var(--color-accent)" }}
          >
            + 添加
          </button>
        </div>
        <div className="space-y-1">
          {character.relationships.map((r, i) => (
            <div key={i} className="flex gap-1 items-center">
              <input
                className="input text-xs flex-1"
                placeholder="角色名"
                value={r.target}
                onChange={(e) => updateRel(i, { ...r, target: e.target.value })}
              />
              <input
                className="input text-xs w-20"
                placeholder="关系"
                value={r.type}
                onChange={(e) => updateRel(i, { ...r, type: e.target.value })}
              />
              <input
                className="input text-xs flex-1"
                placeholder="描述"
                value={r.description}
                onChange={(e) =>
                  updateRel(i, { ...r, description: e.target.value })
                }
              />
              <button
                onClick={() => delRel(i)}
                className="text-red-400 text-xs px-1"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <button className="btn btn-primary w-full mt-2" onClick={onSave}>
        保存
      </button>
    </div>
  );
}

function RoleplayChat({
  projectId,
  character,
}: {
  projectId: string;
  character: Character;
}) {
  const [messages, setMessages] = useState<{ role: "user" | "character"; content: string }[]>(
    []
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setBusy(true);

    const charMsgId = `c-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { role: "character", content: "" },
    ]);

    try {
      await api.runRoleplay(projectId, character.id, text, (chunk: ChatChunk) => {
        if (chunk.done) {
          setBusy(false);
        } else if (chunk.content) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "character") {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + chunk.content },
              ];
            }
            return prev;
          });
        }
      });
    } catch (e) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "character") {
          return [
            ...prev.slice(0, -1),
            { ...last, content: `[错误] ${e}` },
          ];
        }
        return prev;
      });
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div
        className="px-3 py-2 text-xs text-muted border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        🎭 正在以 <strong>{character.name}</strong> 的身份对话
      </div>
      <div ref={listRef} className="flex-1 overflow-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <div className="text-muted text-xs text-center mt-8">
            输入消息开始角色扮演
            <br />
            AI 会用 {character.name} 的语气回应
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div
                className="inline-block max-w-[90%] px-3 py-2 rounded-lg text-left whitespace-pre-wrap"
                style={{
                  background:
                    m.role === "user"
                      ? "var(--color-accent-soft-bg, rgba(229, 165, 92, 0.12))"
                      : "var(--color-elevated)",
                  color:
                    m.role === "user"
                      ? "var(--color-accent)"
                      : "var(--color-text)",
                  border:
                    m.role === "character"
                      ? "1px solid var(--color-border)"
                      : "none",
                }}
              >
                {m.content || (busy && m.role === "character" ? "..." : "")}
              </div>
            </div>
          ))
        )}
      </div>
      <div
        className="border-t p-2 flex gap-1"
        style={{ borderColor: "var(--color-border)" }}
      >
        <textarea
          className="input flex-1 text-sm min-h-[40px] max-h-24 resize-y"
          placeholder={`对 ${character.name} 说...`}
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

function RecallPanel({
  projectId,
  characterName,
}: {
  projectId: string;
  characterName: string;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await api.searchFts(projectId, query, 20);
      setHits(r);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="p-3 space-y-2">
      <div className="text-xs text-muted">
        检索「{characterName}」相关的章节片段
      </div>
      <div className="flex gap-1">
        <input
          className="input flex-1 text-sm"
          placeholder="搜索关键词..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button className="btn text-sm px-3" onClick={search} disabled={searching}>
          {searching ? "..." : "查"}
        </button>
      </div>
      {hits.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {hits.map((h) => (
            <div
              key={h.chunk_id}
              className="text-xs p-2 rounded"
              style={{
                background: "var(--color-elevated)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div className="flex justify-between text-muted mb-1">
                <span>{h.source}</span>
                <span>{(h.score * 100).toFixed(0)}%</span>
              </div>
              <div className="whitespace-pre-wrap">{h.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted mb-1 font-medium">{label}</div>
      {children}
    </label>
  );
}
