// 命令面板 (Ctrl+Shift+P 唤起)

import { useEffect, useState } from "react";
import { useAppStore } from "../stores/app";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  action: () => void;
}

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, toggleImmersive, setTheme } =
    useAppStore();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (e.key === "Escape" && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("");
    }
  }, [commandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  const commands: Command[] = [
    {
      id: "immersive",
      label: "切换沉浸模式",
      hint: "Ctrl+Shift+B",
      group: "视图",
      action: () => {
        toggleImmersive();
        setCommandPaletteOpen(false);
      },
    },
    {
      id: "theme-dark",
      label: "切换为暗色主题",
      group: "外观",
      action: () => {
        setTheme("dark");
        setCommandPaletteOpen(false);
      },
    },
    {
      id: "theme-eye",
      label: "切换为护眼主题",
      group: "外观",
      action: () => {
        setTheme("eye");
        setCommandPaletteOpen(false);
      },
    },
    {
      id: "theme-light",
      label: "切换为亮色主题",
      group: "外观",
      action: () => {
        setTheme("light");
        setCommandPaletteOpen(false);
      },
    },
    {
      id: "new-chapter",
      label: "新建章节",
      group: "作品",
      action: () => {
        alert("请点击左栏的 + 按钮新建章节(快捷键支持计划中)");
        setCommandPaletteOpen(false);
      },
    },
  ];

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="card w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          className="w-full px-4 py-3 bg-transparent border-none outline-none text-sm"
          style={{ borderBottom: "1px solid var(--color-border)" }}
          placeholder="输入命令..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-80 overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">
              没有匹配的命令
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                className="w-full px-4 py-2 flex items-center justify-between text-left hover:elevated text-sm"
                onClick={c.action}
              >
                <span>{c.label}</span>
                <span className="text-xs text-muted">{c.hint || c.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
