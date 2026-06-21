// 全局状态管理 (Zustand)

import { create } from "zustand";
import { api } from "../lib/api";
import type { Chapter, FontFamily, ProjectSummary, ProviderConfig, Theme } from "../types";

interface AppState {
  // 主题与外观
  theme: Theme;
  font: FontFamily;
  immersive: boolean;
  setTheme: (t: Theme) => void;
  setFont: (f: FontFamily) => void;
  toggleImmersive: () => void;

  // 作品
  projects: ProjectSummary[];
  currentProjectId: string | null;
  setCurrentProject: (id: string | null) => void;
  refreshProjects: () => Promise<void>;

  // 章节
  chapters: Chapter[];
  currentChapterId: string | null;
  setCurrentChapter: (id: string | null) => void;
  refreshChapters: (projectId: string) => Promise<void>;

  // AI
  aiConfig: ProviderConfig | null;
  setAIConfig: (c: ProviderConfig) => void;
  loadAISettings: () => Promise<void>;

  // UI
  rightPanel: "outline" | "character" | "ai" | "rag" | "ai-settings";
  setRightPanel: (p: "outline" | "character" | "ai" | "rag" | "ai-settings") => void;
  leftPanelVisible: boolean;
  toggleLeftPanel: () => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // 主题
  theme: "dark",
  font: "writing",
  immersive: false,
  setTheme: (t) => {
    set({ theme: t });
    document.documentElement.className = t === "dark" ? "" : `theme-${t}`;
  },
  setFont: (f) => set({ font: f }),
  toggleImmersive: () => set((s) => ({ immersive: !s.immersive })),

  // 作品
  projects: [],
  currentProjectId: null,
  setCurrentProject: (id) => {
    set({
      currentProjectId: id,
      chapters: [],
      currentChapterId: null,
    });
  },
  refreshProjects: async () => {
    try {
      const list = await api.listProjects();
      set({ projects: list });
    } catch (e) {
      console.error("Failed to list projects:", e);
    }
  },

  // 章节
  chapters: [],
  currentChapterId: null,
  setCurrentChapter: (id) => set({ currentChapterId: id }),
  refreshChapters: async (projectId: string) => {
    try {
      const list = await api.listChapters(projectId);
      set({ chapters: list });
    } catch (e) {
      console.error("Failed to list chapters:", e);
    }
  },

  // AI
  aiConfig: null,
  setAIConfig: (c) => set({ aiConfig: c }),
  loadAISettings: async () => {
    try {
      const s = await api.getAISettings();
      set({ aiConfig: s.config });
    } catch (e) {
      console.error("Failed to load AI settings:", e);
    }
  },

  // UI
  rightPanel: "outline",
  setRightPanel: (p) => set({ rightPanel: p }),
  leftPanelVisible: true,
  toggleLeftPanel: () =>
    set((s) => ({ leftPanelVisible: !s.leftPanelVisible })),
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}));
