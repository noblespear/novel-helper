// 类型定义

export interface ProjectSummary {
  id: string;
  name: string;
  synopsis: string;
  word_count: number;
  target_words: number;
  status: "draft" | "ongoing" | "finished";
  created_at: string;
  updated_at: string;
  last_chapter_title: string | null;
}

export interface Project {
  id: string;
  name: string;
  synopsis: string;
  target_words: number;
  daily_goal: number;
  created_at: string;
  updated_at: string;
  cover: string | null;
}

export interface Chapter {
  id: string;
  volume_id: string;
  title: string;
  order: number;
  word_count: number;
  status: "draft" | "finished";
  content: string;
  outline: string;
  created_at: string;
  updated_at: string;
}

export interface Volume {
  id: string;
  project_id: string;
  title: string;
  order: number;
  summary: string;
}

export interface CreateProjectRequest {
  name: string;
  synopsis: string;
  target_words: number;
  daily_goal: number;
}

// AI 相关
export interface ProviderConfig {
  provider_type: "mock" | "openai" | "anthropic";
  api_key: string;
  base_url: string;
  model: string;
}

export interface PromptTemplates {
  polish_selection: string;
  polish_chapter: string;
  continue_write: string;
  character_design: string;
  general_chat: string;
  rewrite: string;
}

export interface AISettings {
  config: ProviderConfig;
  prompt_templates: PromptTemplates;
}

// 知识库相关
export interface KbMetaInfo {
  embedding_model: string;
  embedding_dim: number;
  chunk_size: number;
  chunk_overlap: number;
  last_rebuild_ts: number;
}

export type ModelStatus =
  | { type: "not_downloaded"; manual_path: string; hf_url: string; files: string[] }
  | { type: "downloading"; progress: number }
  | { type: "ready"; path: string; dim: number }
  | { type: "error"; message: string };

export interface KbStatus {
  exists: boolean;
  last_rebuild_ts: number;
  chunk_count: number;
  model_status: ModelStatus;
  dirty: boolean;
}

export interface SearchHit {
  chunk_id: string;
  source: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface RebuildResult {
  chunks_total: number;
  duration_ms: number;
  last_rebuild_ts: number;
}

// Agent / Skill
export interface SkillMeta {
  name: string;
  label: string;
}

// Character
export interface Relationship {
  target: string;
  type: string;
  description: string;
}

export interface Character {
  id: string;
  project_id: string;
  name: string;
  avatar: string | null;
  personality: string;
  speaking_style: string;
  background: string;
  relationships: Relationship[];
  knowledge: string;
  enabled_skills: string[];
  created_at: number;
  updated_at: number;
}

// 大纲系统
export type OutlineLevel = "macro" | "volume" | "chapter";

export interface OutlineNode {
  id: string;
  level: OutlineLevel;
  parent_id: string | null;
  title: string;
  content: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface OutlineNodeTree extends Omit<OutlineNode, "children"> {
  children: OutlineNodeTree[];
}

// 设定集系统
export type LoreCategory = "world" | "faction" | "location" | "item" | "power" | "custom";

export interface LoreEntry {
  id: string;
  category: LoreCategory;
  name: string;
  description: string;
  details: string;
  tags: string[];
  related_characters: string[];
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatChunk {
  content: string;
  done: boolean;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
}

export type Theme = "dark" | "eye" | "light";
export type FontFamily = "writing" | "serif" | "sans";
