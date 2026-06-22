// 知识库面板 - 显示状态 / 重建按钮 / 检索入口

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { KbStatus, ModelStatus, SearchHit } from "../types";

interface KnowledgeBaseProps {
  projectId: string;
}

export function KnowledgeBase({ projectId }: KnowledgeBaseProps) {
  const [status, setStatus] = useState<KbStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const s = await api.getKbStatus(projectId);
      setStatus(s);
    } catch (e) {
      console.error("getKbStatus failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [projectId]);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await api.downloadEmbeddingModel();
      await refresh();
    } catch (e: any) {
      setDownloadError(String(e));
    } finally {
      setDownloading(false);
    }
  };

  const handleRebuild = async () => {
    setRebuilding(true);
    setRebuildResult(null);
    try {
      const r = await api.rebuildKb(projectId);
      setRebuildResult(
        `✓ 索引完成: ${r.chunks_total} 个块, 耗时 ${(r.duration_ms / 1000).toFixed(1)}s`
      );
      await refresh();
    } catch (e: any) {
      setRebuildResult(`✗ ${e}`);
    } finally {
      setRebuilding(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await api.searchFts(projectId, query, 20);
      setHits(r);
    } catch (e) {
      console.error("search failed:", e);
    } finally {
      setSearching(false);
    }
  };

  if (!status) {
    return (
      <div className="p-4 text-sm text-muted">加载中...</div>
    );
  }

  return (
    <div className="p-4 space-y-4 text-sm">
      {/* 状态卡片 */}
      <div className="card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium">知识库状态</span>
          <button
            className="btn text-xs px-2 py-0.5"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? "刷新..." : "刷新"}
          </button>
        </div>
        <div className="text-xs space-y-1 text-muted">
          <div>块数: {status.chunk_count}</div>
          <div>
            上次重建:{" "}
            {status.last_rebuild_ts > 0
              ? new Date(status.last_rebuild_ts * 1000).toLocaleString()
              : "从未"}
          </div>
        </div>
      </div>

      {/* 模型状态 */}
      <div className="card p-4 space-y-2">
        <div className="font-medium">Embedding 模型</div>
        <ModelStatusView
          status={status.model_status}
          downloading={downloading}
          onDownload={handleDownload}
          error={downloadError}
        />
      </div>

      {/* 重建按钮 */}
      <div className="card p-4 space-y-2">
        <div className="font-medium">重建索引</div>
        <div className="text-xs text-muted">
          全量扫描所有章节/大纲/角色,重新分块建立索引。
        </div>
        <button
          className="btn btn-primary text-sm w-full"
          onClick={handleRebuild}
          disabled={rebuilding || status.model_status.type === "not_downloaded"}
        >
          {rebuilding ? "重建中..." : "重建知识库"}
        </button>
        {rebuildResult && (
          <div
            className="text-xs px-2 py-1 rounded"
            style={{
              background: rebuildResult.startsWith("✓")
                ? "var(--color-accent-soft-bg, rgba(229, 165, 92, 0.12))"
                : "rgba(220, 50, 50, 0.12)",
              color: rebuildResult.startsWith("✓")
                ? "var(--color-accent)"
                : "#e57373",
            }}
          >
            {rebuildResult}
          </div>
        )}
      </div>

      {/* 检索 */}
      <div className="card p-4 space-y-2">
        <div className="font-medium">检索</div>
        <div className="flex gap-1">
          <input
            type="text"
            className="input flex-1 text-sm"
            placeholder="全文搜索(中文分词 + FTS5)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button
            className="btn text-sm px-3"
            onClick={handleSearch}
            disabled={searching}
          >
            {searching ? "..." : "查"}
          </button>
        </div>
        {hits.length > 0 && (
          <div className="space-y-2 mt-2 max-h-96 overflow-y-auto">
            {hits.map((h) => (
              <div
                key={h.chunk_id}
                className="text-xs p-2 rounded"
                style={{
                  background: "var(--color-elevated)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="flex items-center justify-between text-muted mb-1">
                  <span>{h.source}</span>
                  <span>{(h.score * 100).toFixed(0)}%</span>
                </div>
                <div className="whitespace-pre-wrap">{h.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModelStatusView({
  status,
  downloading,
  onDownload,
  error,
}: {
  status: ModelStatus;
  downloading: boolean;
  onDownload: () => void;
  error: string | null;
}) {
  switch (status.type) {
    case "ready":
      return (
        <div className="text-xs space-y-1">
          <div style={{ color: "#4ade80" }}>✓ 模型已就绪</div>
          <div className="text-muted break-all">{status.path}</div>
          <div className="text-muted">维度: {status.dim}</div>
        </div>
      );
    case "not_downloaded":
      return (
        <div className="text-xs space-y-2">
          <div style={{ color: "#f87171" }}>模型未下载</div>
          <div className="text-muted">首次使用需下载 BGE-small-zh 模型 (~100MB)</div>
          <button
            className="btn btn-primary text-sm w-full"
            onClick={onDownload}
            disabled={downloading}
          >
            {downloading ? "下载中..." : "自动下载"}
          </button>
          {error && (
            <div
              className="text-xs p-2 rounded whitespace-pre-wrap"
              style={{ background: "rgba(220, 50, 50, 0.12)", color: "#e57373" }}
            >
              {error}
            </div>
          )}
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">手动下载指引</summary>
            <div className="mt-1 p-2 rounded space-y-1" style={{ background: "var(--color-elevated)" }}>
              <div>1. 访问 {status.hf_url}</div>
              <div>2. 下载以下文件到 <code>{status.manual_path}</code>:</div>
              <ul className="list-disc pl-5">
                {status.files.map((f) => (
                  <li key={f}>
                    <code>{f}</code>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      );
    case "downloading":
      return (
        <div className="text-xs">
          下载中: {(status.progress * 100).toFixed(0)}%
        </div>
      );
    case "error":
      return (
        <div className="text-xs space-y-1">
          <div style={{ color: "#f87171" }}>加载失败</div>
          <div className="text-muted">{status.message}</div>
          <button className="btn text-sm" onClick={onDownload}>
            重试
          </button>
        </div>
      );
  }
}
