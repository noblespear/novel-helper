// 我的作品页(应用首页)

import { useEffect, useState } from "react";
import { useAppStore } from "../stores/app";
import { api } from "../lib/api";
import type { CreateProjectRequest, ProjectSummary } from "../types";
import { cn, formatNumber, formatRelativeTime, truncate } from "../lib/utils";

interface ProjectListProps {
  onOpenProject: (id: string) => void;
}

export function ProjectList({ onOpenProject }: ProjectListProps) {
  const { projects, refreshProjects } = useAppStore();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateProjectRequest>({
    name: "",
    synopsis: "",
    target_words: 1_000_000,
    daily_goal: 5000,
  });

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const submit = async () => {
    if (!form.name.trim()) return;
    try {
      const p = await api.createProject(form);
      await refreshProjects();
      setCreating(false);
      onOpenProject(p.id);
    } catch (e) {
      alert(`创建失败: ${e}`);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold font-writing">我的作品</h1>
            <p className="text-sm text-muted mt-1">
              {projects.length > 0
                ? `共 ${projects.length} 部作品`
                : "开始你的第一部长篇连载"}
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setCreating(true)}
          >
            + 新建作品
          </button>
        </header>

        {projects.length === 0 ? (
          <div className="card p-16 text-center">
            <p className="text-6xl mb-4">📖</p>
            <p className="text-lg mb-2 font-writing">还没有作品</p>
            <p className="text-sm text-muted mb-6">
              点击右上角"新建作品",开启你的长篇连载之旅
            </p>
            <button
              className="btn btn-primary mx-auto"
              onClick={() => setCreating(true)}
            >
              创建第一部作品
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onClick={() => onOpenProject(p.id)}
                onDelete={async () => {
                  if (confirm(`确认删除《${p.name}》?此操作不可恢复`)) {
                    await api.deleteProject(p.id);
                    await refreshProjects();
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {creating && (
        <Modal title="新建作品" onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <Field label="作品名">
              <input
                className="input"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                placeholder="例:诡秘之主"
                autoFocus
              />
            </Field>
            <Field label="简介">
              <textarea
                className="input min-h-[80px] resize-y"
                value={form.synopsis}
                onChange={(e) =>
                  setForm({ ...form, synopsis: e.target.value })
                }
                placeholder="一句话概括你的故事(选填)"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="目标字数">
                <input
                  className="input"
                  type="number"
                  value={form.target_words}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      target_words: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </Field>
              <Field label="每日目标">
                <input
                  className="input"
                  type="number"
                  value={form.daily_goal}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      daily_goal: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="btn"
                onClick={() => setCreating(false)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={submit}
                disabled={!form.name.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onClick,
  onDelete,
}: {
  project: ProjectSummary;
  onClick: () => void;
  onDelete: () => void;
}) {
  const progress =
    project.target_words > 0
      ? Math.min(100, (project.word_count / project.target_words) * 100)
      : 0;

  return (
    <div
      className="card p-5 cursor-pointer hover:card-elevated transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-12 h-16 rounded shrink-0"
          style={{
            background: "var(--color-elevated)",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-accent)",
            fontSize: 20,
            fontWeight: "bold",
            fontFamily: "Georgia, serif",
          }}
        >
          {project.name[0] ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base truncate font-writing">
            {project.name}
          </h3>
          <p className="text-xs text-muted mt-1 line-clamp-2 min-h-[2.4em]">
            {truncate(project.synopsis, 60) || "暂无简介"}
          </p>
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">字数</span>
          <span>
            <span className="font-medium">
              {formatNumber(project.word_count)}
            </span>
            <span className="text-muted">
              {" "}
              / {formatNumber(project.target_words)}
            </span>
          </span>
        </div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: "var(--color-elevated)" }}
        >
          <div
            className="h-full transition-all"
            style={{
              width: `${progress}%`,
              background: "var(--color-accent)",
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {project.status === "ongoing"
            ? "📝 连载中"
            : project.status === "finished"
            ? "✅ 已完结"
            : "📁 草稿"}
        </span>
        <span>{formatRelativeTime(project.updated_at)}</span>
      </div>

      {project.last_chapter_title && (
        <div
          className="mt-2 pt-2 text-xs text-muted truncate border-t"
          style={{ borderColor: "var(--color-border)" }}
        >
          最新:{project.last_chapter_title}
        </div>
      )}

      <button
        className="absolute -top-2 -right-2 btn btn-ghost text-xs opacity-0 hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="删除"
      >
        🗑
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted mb-1">{label}</div>
      {children}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-4 font-writing">{title}</h2>
        {children}
      </div>
    </div>
  );
}
