// 全局状态管理 (Zustand)

import { create } from "zustand";
import { api } from "../lib/api";
import type { Chapter, FontFamily, ProjectSummary, ProviderConfig, Theme, OutlineNodeTree, OutlineNode } from "../types";

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

  // 大纲
  outline: OutlineNodeTree[];
  outlineFlat: OutlineNode[];
  loadOutline: (projectId: string) => Promise<void>;
  addOutlineNode: (projectId: string, level: string, parentId: string | null, title: string) => Promise<OutlineNode | null>;
  updateOutlineNode: (projectId: string, node: OutlineNode) => Promise<void>;
  deleteOutlineNode: (projectId: string, nodeId: string) => Promise<void>;
  reorderOutlineNodes: (projectId: string, orderedIds: string[]) => Promise<void>;

  // UI
  rightPanel: "outline" | "character" | "ai" | "rag" | "kb" | "ai-settings";
  setRightPanel: (
    p: "outline" | "character" | "ai" | "rag" | "kb" | "ai-settings"
  ) => void;
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

  // 大纲
  outline: [],
  outlineFlat: [],
  loadOutline: async (projectId: string) => {
    try {
      const [tree, flat] = await Promise.all([
        api.loadOutline(projectId),
        api.loadOutlineFlat(projectId),
      ]);
      set({ outline: tree, outlineFlat: flat });
    } catch (e) {
      console.error("Failed to load outline:", e);
    }
  },
  addOutlineNode: async (projectId, level, parentId, title) => {
    try {
      const node = await api.addOutlineNode(projectId, level as any, parentId, title);
      // 重新加载大纲
      const [tree, flat] = await Promise.all([
        api.loadOutline(projectId),
        api.loadOutlineFlat(projectId),
      ]);
      set({ outline: tree, outlineFlat: flat });
      return node;
    } catch (e) {
      console.error("Failed to add outline node:", e);
      return null;
    }
  },
  updateOutlineNode: async (projectId, node) => {
    try {
      await api.updateOutlineNode(projectId, node);
      // 重新加载大纲
      const [tree, flat] = await Promise.all([
        api.loadOutline(projectId),
        api.loadOutlineFlat(projectId),
      ]);
      set({ outline: tree, outlineFlat: flat });
    } catch (e) {
      console.error("Failed to update outline node:", e);
    }
  },
  deleteOutlineNode: async (projectId, nodeId) => {
    try {
      await api.deleteOutlineNode(projectId, nodeId);
      // 重新加载大纲
      const [tree, flat] = await Promise.all([
        api.loadOutline(projectId),
        api.loadOutlineFlat(projectId),
      ]);
      set({ outline: tree, outlineFlat: flat });
    } catch (e) {
      console.error("Failed to delete outline node:", e);
    }
  },
  reorderOutlineNodes: async (projectId, orderedIds) => {
    try {
      await api.reorderOutlineNodes(projectId, orderedIds);
      // 重新加载大纲
      const [tree, flat] = await Promise.all([
        api.loadOutline(projectId),
        api.loadOutlineFlat(projectId),
      ]);
      set({ outline: tree, outlineFlat: flat });
    } catch (e) {
      console.error("Failed to reorder outline nodes:", e);
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
