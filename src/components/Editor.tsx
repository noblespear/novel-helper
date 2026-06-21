// 编辑器(基于 CodeMirror 6)

import { useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { useAppStore } from "../stores/app";
import { api } from "../lib/api";
import { countWords, formatNumber } from "../lib/utils";
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
    <div className="flex-1 flex flex-col h-full overflow-hidden">
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

      <div className="flex-1 overflow-auto bg-elevated">
        <div className="max-w-3xl mx-auto py-6">
          <CodeMirror
            value={content}
            onChange={(v) => setContent(v)}
            theme={isDark ? oneDark : "light"}
            extensions={[
              markdown({ base: markdownLanguage, codeLanguages: languages }),
              EditorView.lineWrapping,
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
      </div>

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
