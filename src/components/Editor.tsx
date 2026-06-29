// 编辑器(基于 CodeMirror 6)

import { useEffect, useRef, useState } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { useAppStore } from "../stores/app";
import { api } from "../lib/api";
import { countWords, formatNumber } from "../lib/utils";
import { registerEditor, unregisterEditor, type EditorApi } from "../lib/editorBridge";
import { SelectionToolbar } from "./SelectionToolbar";
import { useSelectionAction } from "../hooks/useSelectionAction";
import { aiRegionExtension } from "../lib/aiRegionExtension";
import { parseAiRegions, acceptRegion, rejectRegion } from "../lib/aiRegion";
import type { FontFamily } from "../types";

interface EditorProps {
  projectId: string;
}

export function Editor({ projectId }: EditorProps) {
  const { currentChapterId, chapters, font, theme, refreshChapters } =
    useAppStore();
  const [content, setContent] = useState("");
  const [outline, setOutline] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const lastSavedContent = useRef("");
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { handleAction } = useSelectionAction();

  const current = chapters.find((c) => c.id === currentChapterId);
  const isDark = theme === "dark";

  useEffect(() => {
    if (!currentChapterId) {
      setContent("");
      setOutline("");
      setTitle("");
      lastSavedContent.current = "";
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .loadChapter(projectId, currentChapterId)
      .then((c) => {
        if (cancelled) return;
        setContent(c.content);
        setOutline(c.outline);
        setTitle(c.title);
        lastSavedContent.current = c.content;
      })
      .catch((e) => console.error("Load chapter failed:", e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId, currentChapterId]);

  // 注册全局编辑器 API
  useEffect(() => {
    const api: EditorApi = {
      getSelection: () => {
        const view = cmRef.current?.view;
        if (!view) return "";
        const sel = view.state.selection.main;
        return sel.empty ? "" : view.state.doc.sliceString(sel.from, sel.to);
      },
      getSelectionInfo: () => {
        const view = cmRef.current?.view;
        if (!view) return { text: "", rect: null };
        const sel = view.state.selection.main;
        if (sel.empty) return { text: "", rect: null };
        const text = view.state.doc.sliceString(sel.from, sel.to);
        // 取选区最后一个字符的客户端坐标
        const coords = view.coordsAtPos(sel.to);
        if (!coords) return { text, rect: null };
        // 找到 view 的滚动容器(.cm-scroller),以它为基准
        const scroller = view.scrollDOM;
        const scrollerRect = scroller.getBoundingClientRect();
        const rect = {
          top: coords.top - scrollerRect.top + scroller.scrollTop,
          left: coords.left - scrollerRect.left + scroller.scrollLeft,
          width: coords.right - coords.left,
          height: coords.bottom - coords.top,
        };
        return { text, rect };
      },
      replaceSelection: (text: string) => {
        const view = cmRef.current?.view;
        if (!view) return;
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: text },
          selection: { anchor: sel.from + text.length },
        });
        view.focus();
      },
      insertAtCursor: (text: string) => {
        const view = cmRef.current?.view;
        if (!view) return;
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: text },
          selection: { anchor: sel.from + text.length },
        });
        view.focus();
      },
      getFullText: () => content,
      setFullText: (text: string) => {
        setContent(text);
        const view = cmRef.current?.view;
        if (view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: text },
          });
          view.focus();
        }
      },
      focus: () => cmRef.current?.view?.focus(),
      acceptAiRegion: (regionId: string) => {
        const view = cmRef.current?.view;
        if (!view) return;
        const text = view.state.doc.toString();
        const regions = parseAiRegions(text);
        const r = regions.find((x) => x.id === regionId && x.state === "pending");
        if (!r) return;
        const newText = acceptRegion(text, r);
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: newText },
        });
        setContent(newText);
        view.focus();
      },
      rejectAiRegion: (regionId: string) => {
        const view = cmRef.current?.view;
        if (!view) return;
        const text = view.state.doc.toString();
        const regions = parseAiRegions(text);
        const r = regions.find((x) => x.id === regionId && x.state === "pending");
        if (!r) return;
        const newText = rejectRegion(text, r);
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: newText },
        });
        setContent(newText);
        view.focus();
      },
    };
    registerEditor(api);
    return () => unregisterEditor();
  }, [content]);

  // 自动保存(2 秒防抖)
  useEffect(() => {
    if (!currentChapterId) return;
    if (content === lastSavedContent.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaving(true);
      try {
        await api.saveChapter(
          projectId,
          currentChapterId,
          content,
          outline
        );
        lastSavedContent.current = content;
        await refreshChapters(projectId);
      } catch (e) {
        console.error("Save failed:", e);
      } finally {
        setSaving(false);
      }
    }, 2000);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [content, outline, projectId, currentChapterId, refreshChapters]);

  if (!currentChapterId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <div className="text-center">
          <p className="text-6xl mb-4">📖</p>
          <p>从左侧选择或新建一个章节开始写作</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        加载中...
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
      <div
        className="px-6 py-2 border-b flex items-center gap-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <input
          className="flex-1 bg-transparent border-none outline-none text-lg font-medium font-writing"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="章节标题"
        />
        <span className="text-xs text-muted">
          {saving ? "保存中..." : lastSavedContent.current === content ? "已保存" : "编辑中..."}
        </span>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-auto bg-elevated relative">
        <div className="max-w-3xl mx-auto py-6">
          <CodeMirror
            ref={cmRef}
            value={content}
            onChange={(v) => setContent(v)}
            theme={isDark ? oneDark : "light"}
            extensions={[
              markdown({ base: markdownLanguage, codeLanguages: languages }),
              EditorView.lineWrapping,
              aiRegionExtension(),
              EditorView.theme({
                "&": { fontSize: "15px" },
                ".cm-content": {
                  fontFamily: getFontFamily(font),
                  lineHeight: "1.85",
                  padding: "8px 0",
                },
                ".cm-line": { padding: "0 24px" },
                ".cm-scroller": { fontFamily: "inherit" },
              }),
            ]}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
            }}
            placeholder="开始你的故事..."
          />
        </div>
        <SelectionToolbar
          scrollContainerRef={scrollerRef}
          onAction={async (action, text) => {
            console.log("[EDITOR] onAction called:", action, "text:", text.substring(0, 50));
            if (action === "copy") {
              const r = await handleAction(action, text);
              if (r) setToast("已复制到剪贴板");
            } else {
              setToast(`AI 正在${action === "polish" ? "润色" : action === "continue" ? "续写" : "改写"}…`);
              console.log("[EDITOR] Calling handleAction...");
              const r = await handleAction(action, text);
              console.log("[EDITOR] handleAction returned:", r ? "result" : "null");
              if (r) {
                r.apply(action === "continue" ? "insert" : "replace");
                setToast("✓ 已应用");
              } else {
                setToast("✗ 操作失败");
              }
            }
            setTimeout(() => setToast(null), 2000);
          }}
        />
      </div>
      {toast && (
        <div
          className="absolute bottom-16 left-1/2 transform -translate-x-1/2 px-3 py-1.5 rounded text-sm shadow-lg"
          style={{
            background: "var(--color-elevated)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            zIndex: 1100,
          }}
        >
          {toast}
        </div>
      )}

      <div
        className="px-6 py-1.5 border-t flex items-center justify-between text-xs text-muted"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span>
          {formatNumber(countWords(content))} 字
          {current && (
            <span className="ml-3">· 章节 #{current.order}</span>
          )}
        </span>
        <span>
          {saving ? "保存中..." : "自动保存"}
        </span>
      </div>
    </div>
  );
}

function getFontFamily(f: FontFamily): string {
  if (f === "writing")
    return "'LXGW WenKai', 'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', STSong, serif";
  if (f === "serif")
    return "'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', STSong, serif";
  return "'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif";
}
