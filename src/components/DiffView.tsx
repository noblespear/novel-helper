// DiffView - 内联词级 diff 视图,带接受/拒绝按钮

import { useMemo } from "react";
import { diffWords } from "diff";

export interface DiffViewProps {
  original: string;
  revised: string;
  onAccept: () => void;
  onReject: () => void;
  title?: string;
  mode?: "side" | "inline";
}

export function DiffView({ original, revised, onAccept, onReject, title, mode = "inline" }: DiffViewProps) {
  const parts = useMemo(() => diffWords(original, revised), [original, revised]);
  const stats = useMemo(() => {
    let added = 0, removed = 0;
    for (const p of parts) {
      const n = p.value.length;
      if (p.added) added += n;
      else if (p.removed) removed += n;
    }
    return { added, removed };
  }, [parts]);

  return (
    <div
      className="rounded-lg overflow-hidden my-2 text-sm"
      style={{
        border: "1px solid var(--color-border)",
        background: "var(--color-elevated)",
      }}
    >
      <div
        className="px-3 py-1.5 flex items-center justify-between text-xs"
        style={{
          background: "var(--color-bg)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium">{title ?? "AI 建议"}</span>
          <span className="text-muted">
            <span style={{ color: "#4ade80" }}>+{stats.added}</span>
            {" / "}
            <span style={{ color: "#f87171" }}>−{stats.removed}</span>
          </span>
        </div>
        <div className="flex gap-1.5">
          <button
            className="text-xs px-2 py-0.5 rounded"
            style={{
              background: "rgba(74, 222, 128, 0.15)",
              color: "#4ade80",
            }}
            onClick={onAccept}
            title="接受修改,替换到编辑器"
          >
            ✓ 接受
          </button>
          <button
            className="text-xs px-2 py-0.5 rounded"
            style={{
              background: "rgba(248, 113, 113, 0.15)",
              color: "#f87171",
            }}
            onClick={onReject}
            title="拒绝修改"
          >
            ✗ 拒绝
          </button>
        </div>
      </div>
      <div className="p-3 leading-relaxed font-writing" style={{ fontSize: "13px" }}>
        {mode === "inline" ? (
          <InlineDiff parts={parts} />
        ) : (
          <SideBySide original={original} revised={revised} />
        )}
      </div>
    </div>
  );
}

function InlineDiff({ parts }: { parts: ReturnType<typeof diffWords> }) {
  return (
    <div className="whitespace-pre-wrap">
      {parts.map((p, i) => {
        if (p.added) {
          return (
            <span
              key={i}
              style={{
                background: "rgba(74, 222, 128, 0.18)",
                color: "#86efac",
                textDecoration: "none",
              }}
            >
              {p.value}
            </span>
          );
        }
        if (p.removed) {
          return (
            <span
              key={i}
              style={{
                background: "rgba(248, 113, 113, 0.18)",
                color: "#fca5a5",
                textDecoration: "line-through",
                textDecorationColor: "rgba(248, 113, 113, 0.5)",
              }}
            >
              {p.value}
            </span>
          );
        }
        return <span key={i}>{p.value}</span>;
      })}
    </div>
  );
}

function SideBySide({ original, revised }: { original: string; revised: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div
          className="text-xs text-muted mb-1 pb-1"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          原文
        </div>
        <div
          className="whitespace-pre-wrap"
          style={{ background: "rgba(248, 113, 113, 0.06)", padding: 8, borderRadius: 4 }}
        >
          {original}
        </div>
      </div>
      <div>
        <div
          className="text-xs text-muted mb-1 pb-1"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          建议
        </div>
        <div
          className="whitespace-pre-wrap"
          style={{ background: "rgba(74, 222, 128, 0.06)", padding: 8, borderRadius: 4 }}
        >
          {revised}
        </div>
      </div>
    </div>
  );
}
