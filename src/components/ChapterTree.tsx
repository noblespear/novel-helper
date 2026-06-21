// 章节树(写作页左栏)

import { useEffect, useState } from "react";
import { useAppStore } from "../stores/app";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

interface ChapterTreeProps {
  projectId: string;
}

export function ChapterTree({ projectId }: ChapterTreeProps) {
  const { chapters, currentChapterId, setCurrentChapter, refreshChapters } =
    useAppStore();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    refreshChapters(projectId);
  }, [projectId, refreshChapters]);

  const createChapter = async () => {
    if (!newTitle.trim()) return;
    try {
      // P0: 单卷模式,固定使用 "default"
      const c = await api.createChapter(projectId, "default", newTitle.trim());
      await refreshChapters(projectId);
      setCurrentChapter(c.id);
      setCreating(false);
      setNewTitle("");
    } catch (e) {
      alert(`创建失败: ${e}`);
    }
  };

  const deleteChapter = async (id: string) => {
    if (!confirm("确认删除该章节?")) return;
    try {
      await api.deleteChapter(projectId, id);
      if (currentChapterId === id) setCurrentChapter(null);
      await refreshChapters(projectId);
    } catch (e) {
      alert(`删除失败: ${e}`);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div
        className="px-3 py-2 border-b flex items-center justify-between"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span className="text-xs text-muted font-medium">章节目录</span>
        <button
          className="btn btn-ghost text-xs px-1.5 py-0.5"
          onClick={() => setCreating(true)}
          title="新建章节"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {chapters.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted">
            暂无章节
            <br />
            点击 + 新建
          </div>
        ) : (
          <div className="px-1">
            {chapters.map((c, idx) => {
              const isActive = currentChapterId === c.id;
              return (
                <div
                  key={c.id}
                  className={cn(
                    "chapter-item group justify-between"
                  )}
                  style={{
                    background: isActive
                      ? "var(--color-elevated)"
                      : undefined,
                    color: isActive
                      ? "var(--color-accent)"
                      : undefined,
                  }}
                  onClick={() => setCurrentChapter(c.id)}
                >
                  <span className="truncate flex-1">
                    <span className="text-xs text-muted mr-2">
                      {String(idx + 1).padStart(3, "0")}
                    </span>
                    {c.title || "(无标题)"}
                  </span>
                  <span className="text-xs text-muted">
                    {c.word_count > 0 ? `${c.word_count}` : ""}
                  </span>
                  <button
                    className="ml-1 opacity-0 group-hover:opacity-100 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChapter(c.id);
                    }}
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {creating && (
        <div
          className="p-2 border-t"
          style={{ borderColor: "var(--color-border)" }}
        >
          <input
            className="input text-sm mb-1.5"
            placeholder="章节标题"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createChapter();
              if (e.key === "Escape") setCreating(false);
            }}
            autoFocus
          />
          <div className="flex gap-1">
            <button
              className="btn btn-ghost text-xs flex-1"
              onClick={() => setCreating(false)}
            >
              取消
            </button>
            <button
              className="btn btn-primary text-xs flex-1"
              onClick={createChapter}
            >
              创建
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
