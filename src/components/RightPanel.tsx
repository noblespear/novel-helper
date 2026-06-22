// 右栏(可切换:大纲/人物/AI/检索/知识库/AI设置)

import { useAppStore } from "../stores/app";
import { AIChatPanel } from "./AIChatPanel";
import { AISettingsPanel } from "./AISettingsPanel";
import { KnowledgeBase } from "./KnowledgeBase";
import { cn } from "../lib/utils";

const tabs = [
  { id: "outline" as const, label: "大纲", icon: "📋" },
  { id: "character" as const, label: "人物", icon: "👤" },
  { id: "ai" as const, label: "AI", icon: "🤖" },
  { id: "rag" as const, label: "检索", icon: "🔍" },
  { id: "kb" as const, label: "知识库", icon: "📚" },
];

export function RightPanel() {
  const { rightPanel, setRightPanel, currentProjectId } = useAppStore();
  return (
    <aside
      className="w-80 shrink-0 border-l flex flex-col"
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
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

      <div className="flex-1 overflow-auto text-sm">
        {rightPanel === "outline" && <OutlinePanel />}
        {rightPanel === "character" && <CharacterPanel />}
        {rightPanel === "ai" && <AIChatPanel />}
        {rightPanel === "rag" && <RAGPanel />}
        {rightPanel === "kb" && currentProjectId && <KnowledgeBase projectId={currentProjectId} />}
        {rightPanel === "ai-settings" && <AISettingsPanel />}
      </div>
    </aside>
  );
}

function OutlinePanel() {
  return (
    <div className="p-4">
      <p className="mb-2 text-default">📋 章节大纲</p>
      <p className="text-xs text-muted">P1 阶段:仅占位,P2 阶段实现细纲编辑</p>
    </div>
  );
}

function CharacterPanel() {
  return (
    <div className="p-4">
      <p className="mb-2 text-default">👤 当前章节人物</p>
      <p className="text-xs text-muted">P1 阶段:仅占位,P2 阶段实现角色卡</p>
    </div>
  );
}

function RAGPanel() {
  return (
    <div className="p-4">
      <p className="mb-2 text-default">🔍 全书检索</p>
      <p className="text-xs text-muted">请使用顶部「知识库」标签</p>
    </div>
  );
}
