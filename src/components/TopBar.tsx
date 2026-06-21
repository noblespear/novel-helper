// 顶栏

import { useAppStore } from "../stores/app";
import { cn } from "../lib/utils";

interface TopBarProps {
  projectName: string | null;
  chapterTitle: string | null;
}

export function TopBar({ projectName, chapterTitle }: TopBarProps) {
  const { theme, setTheme, immersive, toggleImmersive, setCommandPaletteOpen } =
    useAppStore();
  return (
    <div
      className="h-10 flex items-center justify-between px-3 border-b"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-center gap-2 text-sm min-w-0 flex-1">
        {projectName ? (
          <>
            <span className="font-medium font-writing truncate">
              {projectName}
            </span>
            {chapterTitle && (
              <>
                <span className="text-muted">·</span>
                <span className="text-muted truncate">{chapterTitle}</span>
              </>
            )}
          </>
        ) : (
          <span className="text-muted">NovelHelper</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          className="btn btn-ghost text-xs px-2"
          onClick={() => setCommandPaletteOpen(true)}
          title="命令面板 (Ctrl+Shift+P)"
        >
          🔍
        </button>
        <button
          className={cn("btn btn-ghost text-xs px-2")}
          onClick={toggleImmersive}
          title="沉浸模式 (Ctrl+Shift+B)"
        >
          {immersive ? "❐" : "▣"}
        </button>
        <div
          className="flex items-center gap-0.5 ml-1 px-1 py-0.5 rounded"
          style={{ background: "var(--color-elevated)" }}
        >
          {(["dark", "eye", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                "text-xs px-1.5 py-0.5 rounded",
                theme === t ? "accent-bright" : "text-muted"
              )}
              style={{
                background:
                  theme === t ? "var(--color-bg)" : undefined,
              }}
              title={t === "dark" ? "暗色" : t === "eye" ? "护眼" : "亮色"}
            >
              {t === "dark" ? "🌙" : t === "eye" ? "🌿" : "☀"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
