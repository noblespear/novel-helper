// AI 区域管理 - 解析 / 操作 HTML 注释包裹的 AI 改写片段
//
// 格式: <!-- @ai:id:xxx state:pending original:base64 --> ... <!-- /ai:id:xxx -->
// 状态: pending | accepted | rejected
// original: 原文选区(可选,base64 编码的 utf8 — 防转义麻烦)

export type AiRegionState = "pending" | "accepted" | "rejected";

export interface AiRegion {
  id: string;
  state: AiRegionState;
  /// 在源文本中的起止偏移(包含注释)
  start: number;
  end: number;
  /// AI 写入内容的起止偏移(不含注释)
  aiStart: number;
  aiEnd: number;
  /// 选区类型: replace 替换了原内容, insert 续写在选区后
  kind: "replace" | "insert";
  /// 原选区文本(用于 reject 时还原)
  originalText: string;
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}_${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function toBase64(s: string): string {
  try {
    return btoa(unescape(encodeURIComponent(s)));
  } catch {
    return "";
  }
}

function fromBase64(s: string): string {
  try {
    return decodeURIComponent(escape(atob(s)));
  } catch {
    return "";
  }
}

const AI_REGEX = /<!--\s*@ai:id:([a-zA-Z0-9_]+)\s+state:(pending|accepted|rejected)(?:\s+original:([A-Za-z0-9+/=]+))?\s*-->([\s\S]*?)<!--\s*\/ai:id:\1\s*-->/g;

/**
 * 从文本中提取所有 AI 区域
 */
export function parseAiRegions(text: string): AiRegion[] {
  const regions: AiRegion[] = [];
  let m: RegExpExecArray | null;
  AI_REGEX.lastIndex = 0;
  while ((m = AI_REGEX.exec(text)) !== null) {
    const id = m[1];
    const state = m[2] as AiRegionState;
    const origB64 = m[3] || "";
    const inner = m[4];
    // inner 的起止: 整段起 + 起始注释长度
    const start = m.index;
    const end = m.index + m[0].length;
    // inner 的边界
    const innerStart = start + m[0].indexOf("-->") + 3;
    const innerEnd = innerStart + inner.length;
    // 修剪前后的换行
    const leadNewlines = inner.length - inner.replace(/^\n+/, "").length;
    const tailNewlines = inner.length - inner.replace(/\n+$/, "").length;
    const aiStart = innerStart + leadNewlines;
    const aiEnd = innerEnd - tailNewlines;
    regions.push({
      id,
      state,
      start,
      end,
      aiStart,
      aiEnd,
      kind: "replace",
      originalText: fromBase64(origB64),
    });
  }
  return regions;
}

/**
 * 包裹 AI 输出为区域标记
 */
export function wrapAiContent(
  aiText: string,
  originalText: string,
  kind: "replace" | "insert" = "replace"
): { wrapped: string; id: string } {
  const id = newId();
  const safe = aiText.replace(/<!--/g, "<!‐‐");
  const origB64 = toBase64(originalText || "");
  const origAttr = origB64 ? ` original:${origB64}` : "";
  const wrapped = `<!-- @ai:id:${id} state:pending${origAttr} -->${safe}<!-- /ai:id:${id} -->`;
  return { wrapped, id };
}

/**
 * 接受一个区域:删除注释,只保留 AI 内容
 */
export function acceptRegion(text: string, region: AiRegion): string {
  const before = text.slice(0, region.start);
  const after = text.slice(region.end);
  // AI 内容(aiStart..aiEnd 之间的原文)
  const inner = text.slice(region.aiStart, region.aiEnd);
  return before + inner + after;
}

/**
 * 拒绝一个区域:删除整段(注释 + AI 内容)
 * 如果有 original,还原 original
 */
export function rejectRegion(text: string, region: AiRegion): string {
  const before = text.slice(0, region.start);
  const after = text.slice(region.end);
  return before + (region.originalText || "") + after;
}

