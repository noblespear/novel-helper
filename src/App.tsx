// 主应用:整合所有组件

import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ProjectList } from "./components/ProjectList";
import { ChapterTree } from "./components/ChapterTree";
import { Editor } from "./components/Editor";
import { RightPanel } from "./components/RightPanel";
import { CommandPalette } from "./components/CommandPalette";
import { useAppStore } from "./stores/app";
import { api } from "./lib/api";
import { cn } from "./lib/utils";

type View = "home" | "writing" | "outline" | "character" | "setting" | "material" | "tool" | "setting-app";

export default function App() {
  const [view, setView] = useState<View>("home");
  const { theme, font, immersive, currentProjectId, setCurrentProject, chapters, currentChapterId, toggleImmersive } = useAppStore();

  // 应用主题类
  useEffect(() => {
    document.documentElement.className = theme === "dark" ? "" : `theme-${theme}`;
  }, [theme]);

  // 应用字体类
  useEffect(() => {
    document.body.className = `font-${font}`;
  }, [font]);

  // 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "B") {
        e.preventDefault();
        toggleImmersive();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleImmersive]);

  // 进入作品
  const onOpenProject = async (id: string) => {
    try {
      await api.openProject(id);
      setCurrentProject(id);
      setView("writing");
    } catch (e) {
      console.error("Open project failed:", e);
    }
  };

  // 计算当前章节
  const currentChapter = chapters.find((c) => c.id === currentChapterId);
  const projectName = currentProjectId
    ? useAppStore.getState().projects.find((p) => p.id === currentProjectId)?.name ?? null
    : null;

  // 视图分发
  const renderMain = () => {
    if (view === "home" || !currentProjectId) {
      return <ProjectList onOpenProject={onOpenProject} />;
    }
    if (view === "writing") {
      return (
        <div className="flex-1 flex">
          {!immersive && (
            <div
              className="w-60 border-r"
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
      <Placeholder
        title={view}
        message="P0 阶段:此功能为占位,P1/P2 阶段实现"
      />
    );
  };

  return (
    <div className="h-full w-full flex flex-col">
      {!immersive && <TopBar projectName={projectName} chapterTitle={currentChapter?.title ?? null} />}
      <div className="flex-1 flex overflow-hidden">
        {!immersive && <Sidebar activeView={view} onChangeView={(v) => setView(v as View)} />}
        {renderMain()}
      </div>
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
