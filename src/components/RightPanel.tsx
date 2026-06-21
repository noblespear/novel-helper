// 右栏(可切换:大纲/人物/AI/RAG) - P0 暂时是占位 UI

import { useAppStore } from "../stores/app";
import { cn } from "../lib/utils";

const tabs = [
  { id: "outline" as const, label: "大纲", icon: "📋" },
  { id: "character" as const, label: "人物", icon: "👤" },
  { id: "ai" as const, label: "AI", icon: "🤖" },
  { id: "rag" as const, label: "RAG", icon: "🔍" },
];

export function RightPanel() {
  const { rightPanel, setRightPanel } = useAppStore();
  return (
    <aside
      className="w-72 border-l flex flex-col"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div
        className="flex border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            className={cn(
              "flex-1 py-2 text-xs flex items-center justify-center gap-1 transition-colors",
              rightPanel === t.id
                ? "border-b-2 accent-bright"
                : "text-muted hover:elevated"
            )}
            style={{
              borderColor:
                rightPanel === t.id ? "var(--color-accent)" : undefined,
              background: rightPanel === t.id ? "var(--color-elevated)" : undefined,
            }}
            onClick={() => setRightPanel(t.id)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4 text-sm">
        {rightPanel === "outline" && <OutlinePanel />}
        {rightPanel === "character" && <CharacterPanel />}
        {rightPanel === "ai" && <AIPanel />}
        {rightPanel === "rag" && <RAGPanel />}
      </div>
    </aside>
  );
}

function OutlinePanel() {
  return (
    <div className="text-muted">
      <p className="mb-2">📋 章节大纲</p>
      <p className="text-xs">P0 阶段:仅占位,P2 阶段实现细纲编辑</p>
    </div>
  );
}

function CharacterPanel() {
  return (
    <div className="text-muted">
      <p className="mb-2">👤 当前章节人物</p>
      <p className="text-xs">P0 阶段:仅占位,P2 阶段实现角色卡</p>
    </div>
  );
}

function AIPanel() {
  return (
    <div className="text-muted">
      <p className="mb-2">🤖 AI 助手</p>
      <p className="text-xs">P0 阶段:仅占位,P1 阶段接入 AI</p>
    </div>
  );
}

function RAGPanel() {
  return (
    <div className="text-muted">
      <p className="mb-2">🔍 全书检索</p>
      <p className="text-xs">P0 阶段:仅占位,P3 阶段实现 RAG</p>
    </div>
  );
}
