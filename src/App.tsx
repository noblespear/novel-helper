// 主应用:整合所有组件

import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ProjectList } from "./components/ProjectList";
import { ChapterTree } from "./components/ChapterTree";
import { Editor } from "./components/Editor";
import { RightPanel } from "./components/RightPanel";
import { CommandPalette } from "./components/CommandPalette";
import { ImmersiveOverlay } from "./components/ImmersiveOverlay";
import { useAppStore } from "./stores/app";
import { api } from "./lib/api";

type View = "home" | "writing" | "outline" | "character" | "setting" | "material" | "tool" | "setting-app";

export default function App() {
  const [view, setView] = useState<View>("home");
  const { theme, font, immersive, currentProjectId, setCurrentProject, refreshChapters, chapters, currentChapterId, toggleImmersive, commandPaletteOpen, setCommandPaletteOpen, loadAISettings } = useAppStore();

  // 加载 AI 设置
  useEffect(() => {
    loadAISettings();
  }, [loadAISettings]);

  // 应用主题类
  useEffect(() => {
    document.documentElement.className = theme === "dark" ? "" : `theme-${theme}`;
  }, [theme]);

  // 应用字体类(写到 html 以保证全局生效,避免与 body 字号冲突)
  useEffect(() => {
    document.documentElement.classList.remove("font-writing", "font-serif", "font-sans");
    document.documentElement.classList.add(`font-${font}`);
  }, [font]);

  // 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 防止在文本输入时触发(Esc 退出命令面板优先)
      const target = e.target as HTMLElement;
      const inEditor = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "B") {
        e.preventDefault();
        toggleImmersive();
        return;
      }
      // Esc 退出沉浸(优先于命令面板的 Esc 关闭)
      if (e.key === "Escape" && immersive) {
        e.preventDefault();
        toggleImmersive();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleImmersive, immersive]);

  // 进入作品
  const onOpenProject = async (id: string) => {
    try {
      await api.openProject(id);
      setCurrentProject(id);
      await refreshChapters(id); // 关键:进入项目后立刻拉取章节
      setView("writing");
    } catch (e) {
      console.error("Open project failed:", e);
    }
  };

  // 切换到 home 视图时清空当前项目
  const onGoHome = () => {
    setCurrentProject(null);
    setView("home");
  };

  // 计算当前章节
  const currentChapter = chapters.find((c) => c.id === currentChapterId);
  const projectName = currentProjectId
    ? useAppStore.getState().projects.find((p) => p.id === currentProjectId)?.name ?? null
    : null;

  // 视图分发
  const renderMain = () => {
    if (view === "home" || !currentProjectId) {
      return (
        <div className="flex-1 flex min-w-0">
          <ProjectList onOpenProject={onOpenProject} />
          {!immersive && <RightPanel />}
        </div>
      );
    }
    if (view === "writing") {
      return (
        <div className="flex-1 flex min-w-0">
          {!immersive && (
            <div
              className="w-60 shrink-0 border-r"
              style={{ borderColor: "var(--color-border)" }}
            >
              <ChapterTree projectId={currentProjectId} />
            </div>
          )}
          <Editor projectId={currentProjectId} />
          {!immersive && <RightPanel />}
        </div>
      );
    }
    return (
      <div className="flex-1 flex min-w-0">
        <Placeholder
          title={view}
          message="P0 阶段:此功能为占位,P1/P2 阶段实现"
        />
        {!immersive && <RightPanel />}
      </div>
    );
  };

  return (
    <div className="h-full w-full flex flex-col">
      {!immersive && <TopBar projectName={projectName} chapterTitle={currentChapter?.title ?? null} />}
      <div className="flex-1 flex overflow-hidden">
        {!immersive && <Sidebar activeView={view} onChangeView={(v) => setView(v as View)} onGoHome={onGoHome} />}
        {renderMain()}
      </div>
      <ImmersiveOverlay />
      <CommandPalette />
    </div>
  );
}

function Placeholder({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-muted">
      <div className="text-center">
        <p className="text-5xl mb-4">🚧</p>
        <p className="text-lg mb-2 font-writing">{title}</p>
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}
