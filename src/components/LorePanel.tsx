// 设定集面板 - 世界观/势力/地点/物品等分类管理

import { useState, useEffect } from "react";
import { useAppStore } from "../stores/app";
import type { LoreEntry, LoreCategory } from "../types";

interface LorePanelProps {
  projectId: string;
}

const CATEGORIES: { id: LoreCategory; label: string; icon: string }[] = [
  { id: "world", label: "世界观", icon: "🌍" },
  { id: "faction", label: "势力", icon: "⚔️" },
  { id: "location", label: "地点", icon: "📍" },
  { id: "item", label: "物品", icon: "🗡️" },
  { id: "power", label: "能力", icon: "✨" },
  { id: "custom", label: "自定义", icon: "📝" },
];

export function LorePanel({ projectId }: LorePanelProps) {
  const { lore, loadLore, addLoreEntry, updateLoreEntry, deleteLoreEntry } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState<LoreCategory | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LoreEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadLore(projectId);
  }, [projectId, loadLore]);

  const filteredLore = lore.filter((e) => {
    if (selectedCategory && e.category !== selectedCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleAdd = async (category: LoreCategory) => {
    // 直接创建新条目，使用默认名称，然后在编辑区修改
    const defaultName = `新${CATEGORIES.find((c) => c.id === category)?.label || "条目"}`;
    const entry = await addLoreEntry(projectId, category, defaultName);
    if (entry) {
      setSelectedId(entry.id);
      setEditing({ ...entry });
    }
  };

  const handleSelect = (entry: LoreEntry) => {
    setSelectedId(entry.id);
    setEditing({ ...entry });
  };

  const handleSave = async () => {
    if (!editing) return;
    await updateLoreEntry(projectId, editing);
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!confirm("确认删除此设定条目?")) return;
    await deleteLoreEntry(projectId, selectedId);
    setSelectedId(null);
    setEditing(null);
  };

  const selected = lore.find((e) => e.id === selectedId) || null;

  return (
    <div className="flex flex-col h-full">
      {/* 头部：搜索 + 类别筛选 */}
      <div className="p-2 border-b" style={{ borderColor: "var(--color-border)" }}>
        <input
          className="input text-xs w-full mb-2"
          placeholder="搜索设定..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          <button
            className={`px-2 py-0.5 text-xs rounded ${!selectedCategory ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-elevated)]"}`}
            onClick={() => setSelectedCategory(null)}
          >
            全部
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`px-2 py-0.5 text-xs rounded ${selectedCategory === c.id ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-elevated)]"}`}
              onClick={() => setSelectedCategory(c.id)}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区：上方列表 + 下方编辑 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 上方：条目列表 */}
        <div className="border-b overflow-y-auto shrink-0" style={{ borderColor: "var(--color-border)", minHeight: "80px", maxHeight: "180px" }}>
          <div className="p-2">
            <button
              className="btn btn-primary w-full text-xs mb-2"
              onClick={() => handleAdd(selectedCategory || "world")}
            >
              + 新增
            </button>
          </div>
          {filteredLore.length === 0 ? (
            <div className="text-xs text-muted text-center p-4">暂无设定</div>
          ) : (
            <div className="space-y-0.5 pb-2">
              {filteredLore.map((e) => {
                const cat = CATEGORIES.find((c) => c.id === e.category);
                return (
                  <button
                    key={e.id}
                    onClick={() => handleSelect(e)}
                    className="w-full text-left px-2 py-1.5 text-xs flex items-center gap-1"
                    style={{
                      background: e.id === selectedId ? "var(--color-elevated)" : "transparent",
                      color: "var(--color-text)",
                    }}
                  >
                    <span className="shrink-0">{cat?.icon || "📝"}</span>
                    <span className="truncate">{e.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 下方：编辑区 */}
        <div className="flex-1 overflow-y-auto">
          {editing ? (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">
                  {CATEGORIES.find((c) => c.id === editing.category)?.icon}{" "}
                  {CATEGORIES.find((c) => c.id === editing.category)?.label}
                </span>
                <button
                  onClick={handleDelete}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  删除
                </button>
              </div>

              <label className="block">
                <div className="text-xs text-muted mb-1">名称</div>
                <input
                  className="input text-sm w-full"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>

              <label className="block">
                <div className="text-xs text-muted mb-1">简介</div>
                <textarea
                  className="input text-xs min-h-[40px] resize-y w-full"
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="一句话描述"
                />
              </label>

              <label className="block">
                <div className="text-xs text-muted mb-1">详细内容</div>
                <textarea
                  className="input text-xs min-h-[100px] resize-y w-full"
                  value={editing.details}
                  onChange={(e) => setEditing({ ...editing, details: e.target.value })}
                  placeholder="详细设定（支持 Markdown）"
                />
              </label>

              <label className="block">
                <div className="text-xs text-muted mb-1">标签（逗号分隔）</div>
                <input
                  className="input text-xs w-full"
                  value={editing.tags.join(", ")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                    })
                  }
                  placeholder="重要, 伏笔, ..."
                />
              </label>

              <button className="btn btn-primary w-full" onClick={handleSave}>
                保存
              </button>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted text-xs h-full">
              选择一个条目或新建
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
