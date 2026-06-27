// 全局编辑器桥接 - 让 AIChatPanel 之类可以调用编辑器方法
// 不通过 Zustand 是因为 EditorView 引用不适合放进 store

export interface SelectionInfo {
  text: string;
  rect: { top: number; left: number; width: number; height: number } | null;
}

export interface EditorApi {
  getSelection(): string;
  getSelectionInfo(): SelectionInfo;
  replaceSelection(text: string): void;
  insertAtCursor(text: string): void;
  getFullText(): string;
  setFullText(text: string): void;
  focus(): void;
  /// 接受 AI 区域 — 去掉注释,保留内容
  acceptAiRegion(regionId: string): void;
  /// 拒绝 AI 区域 — 整段删除
  rejectAiRegion(regionId: string): void;
}

let api: EditorApi | null = null;

export function registerEditor(e: EditorApi): void {
  api = e;
}

export function unregisterEditor(): void {
  api = null;
}

export function getEditorApi(): EditorApi | null {
  return api;
}
