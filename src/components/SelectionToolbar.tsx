// 划线创作浮窗 - 鼠标抬起后捕获选区,在选区下方弹出
// 4 个操作: 润色 / 续写 / 重写 / 复制

import { useEffect, useState, useRef, useCallback } from "react";
import { getEditorApi, type SelectionInfo } from "../lib/editorBridge";

export type SelectionAction = "polish" | "continue" | "rewrite" | "copy";

interface SelectionToolbarProps {
  onAction: (action: SelectionAction, text: string) => void;
  /// 浮窗挂载的滚动容器 ref(用于计算可见性)
  scrollContainerRef?: React.RefObject<HTMLElement>;
}

const TOOLBAR_OFFSET = 8; // 距离选区下方的像素
const TOOLBAR_HIDE_DELAY = 0; // mousedown 后立即隐藏

export function SelectionToolbar({ onAction, scrollContainerRef }: SelectionToolbarProps) {
  const [info, setInfo] = useState<SelectionInfo | null>(null);
  const [hidden, setHidden] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  // 监听 mousedown:mousedown 时隐藏 toolbar(避免挡住下一次选区)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // 如果点击的是 toolbar 内部，不隐藏
      const target = e.target as HTMLElement;
      if (target.closest('[data-selection-toolbar]')) return;

      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        setInfo(null);
      }, TOOLBAR_HIDE_DELAY);
    };
    // capture 阶段,先于 CodeMirror 处理
    document.addEventListener("mousedown", handler, true);
    return () => {
      document.removeEventListener("mousedown", handler, true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  // 监听 mouseup:捕获选区,显示 toolbar
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // 忽略来自 toolbar 自身的 mouseup
      const target = e.target as HTMLElement;
      if (target.closest('[data-selection-toolbar]')) return;

      // 取消待执行的 hide
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      // 延迟一帧,等浏览器把选区写入 selection
      requestAnimationFrame(() => {
        const api = getEditorApi();
        if (!api) return;
        const sel = api.getSelectionInfo();
        if (!sel.text) {
          setInfo(null);
          return;
        }
        setInfo(sel);
        setHidden(false);
      });
    };
    document.addEventListener("mouseup", handler);
    return () => document.removeEventListener("mouseup", handler);
  }, []);

  // 滚出视口时隐藏
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container || !info?.rect) return;
    const onScroll = () => {
      const cRect = container.getBoundingClientRect();
      const selTop = info.rect!.top + (container.scrollTop || 0);
      if (selTop < 0 || selTop > cRect.height + 200) {
        setHidden(true);
      } else {
        setHidden(false);
      }
    };
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, [info, scrollContainerRef]);

  // Escape 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && info) {
        setInfo(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [info]);

  const handleClick = useCallback(
    (action: SelectionAction) => {
      if (!info?.text) return;
      onAction(action, info.text);
      // 操作触发后关闭 toolbar
      setInfo(null);
    },
    [info, onAction]
  );

  if (!info?.text || !info.rect || hidden) {
    return null;
  }

  const style: React.CSSProperties = {
    position: "absolute",
    top: info.rect.top + info.rect.height + TOOLBAR_OFFSET,
    left: info.rect.left + info.rect.width / 2,
    transform: "translateX(-50%)",
    zIndex: 1000,
    pointerEvents: "auto",
  };

  return (
    <div
      data-selection-toolbar
      style={style}
      className="flex gap-1 px-1.5 py-1 rounded-lg shadow-xl"
      onMouseDown={(e) => {
        // 防止点击 toolbar 时编辑器失焦、selection 丢失
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <ToolbarButton onClick={() => handleClick("polish")} label="润色" icon="✨" />
      <ToolbarButton onClick={() => handleClick("continue")} label="续写" icon="➡️" />
      <ToolbarButton onClick={() => handleClick("rewrite")} label="重写" icon="🔄" />
      <div className="w-px bg-gray-600 mx-0.5" />
      <ToolbarButton onClick={() => handleClick("copy")} label="复制" icon="📋" />
    </div>
  );
}

function ToolbarButton({
  onClick,
  label,
  icon,
}: {
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors"
      style={{
        background: "var(--color-elevated)",
        color: "var(--color-text)",
        border: "1px solid var(--color-border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--color-accent-soft-bg, rgba(229, 165, 92, 0.18))";
        e.currentTarget.style.color = "var(--color-accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--color-elevated)";
        e.currentTarget.style.color = "var(--color-text)";
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
