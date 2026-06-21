// 我的作品页(应用首页)

import { useEffect, useState } from "react";
import { useAppStore } from "../stores/app";
import { api } from "../lib/api";
import type { CreateProjectRequest, ProjectSummary } from "../types";
import { formatNumber, formatRelativeTime, truncate } from "../lib/utils";

// 由书名生成稳定的渐变背景
function coverGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const palettes = [
    ["#2A3B2F", "#1A221C"], // 墨绿
    ["#3B2A2A", "#221818"], // 砖红
    ["#2A2F3B", "#181B22"], // 靛蓝
    ["#3B3A2A", "#22211A"], // 橄榄
    ["#3B2A38", "#221A1F"], // 紫红
    ["#2A3B36", "#1A2220"], // 青绿
    ["#3B352A", "#22201A"], // 棕褐
  ];
  const p = palettes[h % palettes.length];
  return `linear-gradient(135deg, ${p[0]} 0%, ${p[1]} 100%)`;
}

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
    <div className="flex-1 overflow-auto p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-wide">我的作品</h1>
            <p className="text-sm text-muted mt-1.5">
              {projects.length > 0
                ? `共 ${projects.length} 部作品 · 总字数 ${formatNumber(projects.reduce((s, p) => s + p.word_count, 0))}`
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
          <EmptyState onCreate={() => setCreating(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
            <CreateCard onClick={() => setCreating(true)} />
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

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="card p-16 text-center relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, var(--color-accent) 0, var(--color-accent) 1px, transparent 1px, transparent 24px)",
        }}
      />
      <div className="relative">
        <div
          className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center text-4xl"
          style={{
            background: "var(--color-accent-soft)",
            color: "var(--color-accent)",
          }}
        >
          📖
        </div>
        <h2 className="text-xl mb-2">还没有作品</h2>
        <p className="text-sm text-muted mb-6">
          点击右上角"新建作品",开启你的长篇连载之旅
        </p>
        <button className="btn btn-primary mx-auto" onClick={onCreate}>
          创建第一部作品
        </button>
      </div>
    </div>
  );
}

function CreateCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="card p-5 flex flex-col items-center justify-center text-muted hover:text-default transition-colors"
      style={{ minHeight: 200 }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-2xl mb-3"
        style={{
          background: "var(--color-accent-soft)",
          color: "var(--color-accent)",
        }}
      >
        +
      </div>
      <span className="text-sm">新建作品</span>
    </button>
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
      className="card overflow-hidden cursor-pointer hover:card-elevated transition-all group"
      onClick={onClick}
    >
      {/* 封面条 */}
      <div
        className="h-24 relative flex items-end p-3"
        style={{ background: coverGradient(project.name) }}
      >
        <div
          className="absolute top-2 right-2 text-2xl opacity-20"
          style={{ color: "var(--color-accent)" }}
        >
          📖
        </div>
        <div
          className="text-xs px-2 py-0.5 rounded"
          style={{
            background: "rgba(0,0,0,0.4)",
            color: "var(--color-text-muted)",
          }}
        >
          {project.status === "ongoing"
            ? "📝 连载中"
            : project.status === "finished"
            ? "✅ 已完结"
            : "📁 草稿"}
        </div>
      </div>

      <div className="p-4">
        <h3 className="font-bold text-base truncate mb-1">{project.name}</h3>
        <p className="text-xs text-muted line-clamp-2 min-h-[2.4em] mb-3">
          {truncate(project.synopsis, 60) || "暂无简介"}
        </p>

        <div className="space-y-1.5 mb-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">字数</span>
            <span>
              <span className="font-medium" style={{ color: "var(--color-text)" }}>
                {formatNumber(project.word_count)}
              </span>
              <span className="text-muted">
                {" "}/ {formatNumber(project.target_words)}
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
          <span>{formatRelativeTime(project.updated_at)}</span>
          {project.last_chapter_title && (
            <span className="truncate ml-2" title={project.last_chapter_title}>
              最新:{project.last_chapter_title}
            </span>
          )}
        </div>
      </div>

      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded flex items-center justify-center text-xs"
        style={{
          background: "rgba(0,0,0,0.6)",
          color: "var(--color-text-muted)",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="删除"
      >
        ×
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted mb-1.5">{label}</div>
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
        <h2 className="text-lg font-bold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}
