// 全局编辑器桥接 - 让 AIChatPanel 之类可以调用编辑器方法
// 不通过 Zustand 是因为 EditorView 引用不适合放进 store

export interface EditorApi {
  getSelection(): string;
  replaceSelection(text: string): void;
  insertAtCursor(text: string): void;
  getFullText(): string;
  setFullText(text: string): void;
  focus(): void;
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
