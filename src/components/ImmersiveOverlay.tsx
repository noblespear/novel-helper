// 沉浸模式浮层:总有一个可见的退出入口,避免用户被卡住

import { useAppStore } from "../stores/app";
import { useEffect, useState } from "react";

export function ImmersiveOverlay() {
  const { immersive, toggleImmersive, currentProjectId, chapters, currentChapterId } =
    useAppStore();
  const [hovered, setHovered] = useState(false);
  const [showHint, setShowHint] = useState(true);

  // 5 秒后自动淡出底部提示
  useEffect(() => {
    if (!immersive) return;
    setShowHint(true);
    const t = setTimeout(() => setShowHint(false), 5000);
    return () => clearTimeout(t);
  }, [immersive]);

  if (!immersive) return null;

  const currentChapter = chapters.find((c) => c.id === currentChapterId);
  const hasProject = !!currentProjectId;

  return (
    <>
      {/* 左侧固定:沉浸标识 + 章节名 */}
      <div
        style={{
          position: "fixed",
          top: 10,
          left: 16,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          pointerEvents: "auto",
          opacity: hovered ? 0.95 : 0.6,
          transition: "opacity 200ms",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span
          style={{
            padding: "4px 10px",
            borderRadius: 4,
            background: "var(--color-elevated)",
            color: "var(--color-accent)",
            border: "1px solid var(--color-border)",
            fontWeight: 500,
            fontSize: 11,
          }}
        >
          沉浸模式
        </span>
        {hasProject && (
          <span style={{ color: "var(--color-text-muted)" }}>
            {currentChapter?.title ?? "(未选章节)"}
          </span>
        )}
      </div>

      {/* 右侧固定:退出按钮(独立 fixed div,不依赖 flex) */}
      <button
        onClick={toggleImmersive}
        style={{
          position: "fixed",
          top: 10,
          right: 16,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          background: "#E5A55C",
          color: "#131C18",
          border: "none",
          boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
          cursor: "pointer",
          opacity: hovered ? 1 : 0.9,
          transition: "opacity 200ms",
          pointerEvents: "auto",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title="退出沉浸模式 (Esc 或 Ctrl+Shift+B)"
      >
        <span style={{ fontSize: 14 }}>❐</span>
        <span>退出</span>
      </button>

      {/* 底部固定:Esc 提示 */}
      <div
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 9999,
          opacity: showHint ? 1 : 0.35,
          transition: "opacity 500ms",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--color-elevated)",
            color: "var(--color-text-muted)",
            border: "1px solid var(--color-border)",
          }}
        >
          <kbd
            style={{
              padding: "2px 6px",
              borderRadius: 3,
              fontSize: 10,
              fontFamily: "ui-monospace, monospace",
              background: "var(--color-bg)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            Esc
          </kbd>
          <span>退出沉浸</span>
        </div>
      </div>
    </>
  );
}
