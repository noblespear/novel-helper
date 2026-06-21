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

export type Theme = "dark" | "eye" | "light";
export type FontFamily = "writing" | "serif" | "sans";
