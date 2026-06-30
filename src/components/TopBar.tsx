// 顶栏

import { useAppStore } from "../stores/app";

interface TopBarProps {
  projectName: string | null;
  chapterTitle: string | null;
}

export function TopBar({ projectName, chapterTitle }: TopBarProps) {
  const { theme, setTheme, font, setFont, immersive, toggleImmersive, setCommandPaletteOpen } =
    useAppStore();
  return (
    <div
      className="h-11 flex items-center justify-between px-4 border-b select-none"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-center gap-2 text-sm min-w-0 flex-1">
        <span
          className="font-medium text-base"
          style={{ letterSpacing: "0.02em" }}
        >
          {projectName ?? "NovelHelper"}
        </span>
        {chapterTitle && (
          <>
            <span className="text-muted opacity-50 mx-1">/</span>
            <span className="text-muted truncate">{chapterTitle}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          className="btn btn-ghost text-xs px-2.5 py-1 flex items-center gap-1.5"
          onClick={() => setCommandPaletteOpen(true)}
          title="命令面板 (Ctrl+Shift+P)"
        >
          <span className="opacity-60 text-[10px]">Ctrl+Shift+P</span>
        </button>
        <div
          className="flex items-center gap-0.5 ml-1 px-1 py-0.5 rounded"
          style={{ background: "var(--color-elevated)" }}
        >
          {(["dark", "eye", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className="text-xs px-1.5 py-0.5 rounded transition-colors"
              style={{
                background: theme === t ? "var(--color-bg)" : "transparent",
                color: theme === t ? "var(--color-accent)" : "var(--color-text-muted)",
              }}
              title={t === "dark" ? "暗色" : t === "eye" ? "护眼" : "亮色"}
            >
              {t === "dark" ? "🌙" : t === "eye" ? "🌿" : "☀"}
            </button>
          ))}
        </div>
        <button
          className="btn btn-ghost text-xs px-2 py-1"
          onClick={toggleImmersive}
          title="沉浸模式 (Ctrl+Shift+B)"
        >
          {immersive ? "❐" : "▣"}
        </button>
        <div
          className="flex items-center gap-0.5 ml-1 px-1 py-0.5 rounded"
          style={{ background: "var(--color-elevated)" }}
        >
          {(["writing", "serif", "sans"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFont(f)}
              className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              style={{
                background: font === f ? "var(--color-bg)" : "transparent",
                color: font === f ? "var(--color-accent)" : "var(--color-text-muted)",
              }}
              title={f === "writing" ? "书法" : f === "serif" ? "宋体" : "黑体"}
            >
              字
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}