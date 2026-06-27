// 右栏(可切换:大纲/人物/AI/检索/知识库/AI设置)
// 人物 tab 是 agent 的家(角色扮演 + 知识召回 + 编辑)

import { useState, useEffect } from "react";
import { useAppStore } from "../stores/app";
import { AIChatPanel } from "./AIChatPanel";
import { AISettingsPanel } from "./AISettingsPanel";
import { KnowledgeBase } from "./KnowledgeBase";
import { CharacterPanel as CharacterTab } from "./CharacterPanel";
import { cn } from "../lib/utils";
import type { OutlineNodeTree } from "../types";

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
        {rightPanel === "character" && currentProjectId && <CharacterTab projectId={currentProjectId} />}
        {rightPanel === "ai" && <AIChatPanel />}
        {rightPanel === "rag" && <RAGPanel />}
        {rightPanel === "kb" && currentProjectId && <KnowledgeBase projectId={currentProjectId} />}
        {rightPanel === "ai-settings" && <AISettingsPanel />}
      </div>
    </aside>
  );
}

function OutlinePanel() {
  const { currentProjectId, outline, loadOutline, addOutlineNode, updateOutlineNode, deleteOutlineNode } = useAppStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [addMenuParentId, setAddMenuParentId] = useState<string | null>(null);

  useEffect(() => {
    if (currentProjectId) {
      loadOutline(currentProjectId);
    }
  }, [currentProjectId, loadOutline]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (node: OutlineNodeTree) => {
    setEditingId(node.id);
    setEditingTitle(node.title);
  };

  const finishEdit = async (node: OutlineNodeTree) => {
    if (!currentProjectId || !editingTitle.trim()) {
      setEditingId(null);
      return;
    }
    await updateOutlineNode(currentProjectId, {
      ...node,
      title: editingTitle.trim(),
    });
    setEditingId(null);
  };

  const handleDelete = async (nodeId: string) => {
    if (!currentProjectId) return;
    if (confirm("确认删除此节点及其所有子节点?")) {
      await deleteOutlineNode(currentProjectId, nodeId);
    }
  };

  const handleAdd = async (level: string) => {
    if (!currentProjectId) return;
    const title = level === "macro" ? "总纲" : level === "volume" ? "新卷" : "新章节";
    await addOutlineNode(currentProjectId, level, addMenuParentId, title);
    setShowAddMenu(false);
    setAddMenuParentId(null);
  };

  const openAddMenu = (parentId: string | null = null) => {
    setAddMenuParentId(parentId);
    setShowAddMenu(true);
  };

  const renderNode = (node: OutlineNodeTree, depth: number = 0) => {
    const isExpanded = expandedIds.has(node.id);
    const isEditing = editingId === node.id;
    const hasChildren = node.children.length > 0;
    const levelIcon = node.level === "macro" ? "📖" : node.level === "volume" ? "📚" : "📄";

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1 py-1 px-2 hover:bg-[var(--color-elevated)] rounded group"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {/* 展开/折叠按钮 */}
          <button
            className="w-4 h-4 flex items-center justify-center text-muted"
            onClick={() => toggleExpand(node.id)}
          >
            {hasChildren ? (isExpanded ? "▼" : "▶") : <span className="w-4" />}
          </button>

          {/* 级别图标 */}
          <span className="text-xs">{levelIcon}</span>

          {/* 标题 */}
          {isEditing ? (
            <input
              className="flex-1 bg-[var(--color-elevated)] border border-[var(--color-border)] rounded px-1 text-sm outline-none"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={() => finishEdit(node)}
              onKeyDown={(e) => {
                if (e.key === "Enter") finishEdit(node);
                if (e.key === "Escape") setEditingId(null);
              }}
              autoFocus
            />
          ) : (
            <span
              className="flex-1 text-sm cursor-pointer truncate"
              onDoubleClick={() => startEdit(node)}
            >
              {node.title}
            </span>
          )}

          {/* 操作按钮 */}
          <div className="hidden group-hover:flex items-center gap-1">
            <button
              className="text-xs text-muted hover:text-[var(--color-accent)]"
              onClick={() => openAddMenu(node.id)}
              title="添加子节点"
            >
              +
            </button>
            <button
              className="text-xs text-muted hover:text-red-500"
              onClick={() => handleDelete(node.id)}
              title="删除"
            >
              ×
            </button>
          </div>
        </div>

        {/* 子节点 */}
        {isExpanded &&
          node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-xs font-medium text-default">📋 大纲</span>
        <button
          className="text-xs text-muted hover:text-[var(--color-accent)]"
          onClick={() => openAddMenu(null)}
        >
          + 添加
        </button>
      </div>

      {/* 添加菜单 */}
      {showAddMenu && (
        <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-elevated)]">
          <p className="text-xs text-muted mb-1">选择级别:</p>
          <div className="flex gap-2">
            <button
              className="px-2 py-1 text-xs rounded bg-[var(--color-bg)] hover:bg-[var(--color-accent)] hover:text-white"
              onClick={() => handleAdd("macro")}
            >
              📖 总纲
            </button>
            <button
              className="px-2 py-1 text-xs rounded bg-[var(--color-bg)] hover:bg-[var(--color-accent)] hover:text-white"
              onClick={() => handleAdd("volume")}
            >
              📚 卷
            </button>
            <button
              className="px-2 py-1 text-xs rounded bg-[var(--color-bg)] hover:bg-[var(--color-accent)] hover:text-white"
              onClick={() => handleAdd("chapter")}
            >
              📄 章
            </button>
            <button
              className="px-2 py-1 text-xs rounded text-muted"
              onClick={() => setShowAddMenu(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 大纲树 */}
      <div className="flex-1 overflow-auto p-2">
        {outline.length === 0 ? (
          <div className="text-center text-muted text-xs py-8">
            <p className="mb-2">暂无大纲</p>
            <p>点击右上角"+ 添加"开始创建</p>
          </div>
        ) : (
          outline.map((node) => renderNode(node))
        )}
      </div>
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
