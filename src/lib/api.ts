// Tauri IPC 封装

import { invoke, Channel } from "@tauri-apps/api/core";
import type {
  Chapter,
  CreateProjectRequest,
  Project,
  ProjectSummary,
  ProviderConfig,
  PromptTemplates,
  AISettings,
  ChatMessage,
  ChatChunk,
} from "../types";

export const api = {
  // 项目
  listProjects: () => invoke<ProjectSummary[]>("list_projects"),
  openProject: (projectId: string) =>
    invoke<Project>("open_project", { projectId }),
  createProject: (req: CreateProjectRequest) =>
    invoke<Project>("create_project", { req }),
  deleteProject: (projectId: string) =>
    invoke<void>("delete_project", { projectId }),

  // 章节
  listChapters: (projectId: string) =>
    invoke<Chapter[]>("list_chapters", { projectId }),
  createChapter: (projectId: string, volumeId: string, title: string) =>
    invoke<Chapter>("create_chapter", { projectId, volumeId, title }),
  loadChapter: (projectId: string, chapterId: string) =>
    invoke<Chapter>("load_chapter", { projectId, chapterId }),
  saveChapter: (
    projectId: string,
    chapterId: string,
    content: string,
    outline: string
  ) =>
    invoke<void>("save_chapter", {
      projectId,
      chapterId,
      content,
      outline,
    }),
  deleteChapter: (projectId: string, chapterId: string) =>
    invoke<void>("delete_chapter", { projectId, chapterId }),

  // AI
  getAISettings: () => invoke<AISettings>("get_ai_settings"),
  updateAIConfig: (newConfig: ProviderConfig) =>
    invoke<ProviderConfig>("update_ai_config", { newConfig }),
  listAIModels: () => invoke<string[]>("list_ai_models"),
  validateAIKey: () => invoke<boolean>("validate_ai_key"),
  getPromptTemplates: () => invoke<PromptTemplates>("get_prompt_templates"),
  updatePromptTemplates: (templates: PromptTemplates) =>
    invoke<void>("update_prompt_templates", { templates }),
  aiChatStream: (
    messages: ChatMessage[],
    onChunk: (chunk: ChatChunk) => void,
    model?: string
  ) => {
    const channel = new Channel<ChatChunk>();
    channel.onmessage = onChunk;
    return invoke<void>("ai_chat_stream", {
      onChunk: channel,
      messages,
      model: model ?? null,
    });
  },
};
