// CodeMirror extension: 扫描 AI 区域注释,渲染为:
//  - 浅色背景
//  - 虚线下划线
//  - 行内小图标(pending 时显示 ✨,accepted ✓,rejected 划线)
//  - pending 时图标可点击,弹出 接受/拒绝 操作
//
// 不实际编辑 doc,只通过 Decoration.widget / Decoration.mark 渲染
// 保存时原样保存注释 + 内容

import { Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { parseAiRegions, type AiRegion } from "./aiRegion";
import { getEditorApi } from "./editorBridge";

/// 状态变化时强制重算
const recompute = StateEffect.define<void>();

/// 装饰集(行级)
const decoField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    if (tr.docChanged || tr.effects.some((e) => e.is(recompute))) {
      return buildDecos(tr.state.doc.toString());
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildDecos(text: string): DecorationSet {
  const regions = parseAiRegions(text);
  if (regions.length === 0) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  // 排序:按 start
  regions.sort((a, b) => a.start - b.start);
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    const cls = stateToClass(r.state);

    // 隐藏起始注释 <!-- @ai:id:xxx ... -->
    builder.add(
      r.start,
      r.aiStart,
      Decoration.mark({
        attributes: { class: "cm-ai-hidden", style: "display:none" },
        inclusive: false,
      })
    );

    // AI 内容区装饰(浅色背景 + 虚线)
    builder.add(
      r.aiStart,
      r.aiEnd,
      Decoration.mark({
        attributes: { class: cls },
        // 防止 decoration 自身被嵌套
        inclusive: false,
      })
    );

    // 隐藏结束注释 <!-- /ai:id:xxx -->
    builder.add(
      r.aiEnd,
      r.end,
      Decoration.mark({
        attributes: { class: "cm-ai-hidden", style: "display:none" },
        inclusive: false,
      })
    );

    // 在 AI 区域末尾加一个 widget 小图标
    builder.add(
      r.aiEnd,
      r.aiEnd,
      Decoration.widget({
        widget: new AiRegionBadge(r),
        side: 1,
      })
    );
  }
  return builder.finish();
}

function stateToClass(state: AiRegion["state"]): string {
  switch (state) {
    case "pending":
      return "cm-ai-region cm-ai-pending";
    case "accepted":
      return "cm-ai-region cm-ai-accepted";
    case "rejected":
      return "cm-ai-region cm-ai-rejected";
  }
}

class AiRegionBadge extends WidgetType {
  constructor(readonly region: AiRegion) {
    super();
  }
  eq(other: AiRegionBadge): boolean {
    return other.region.id === this.region.id && other.region.state === this.region.state;
  }
  ignoreEvent(): boolean {
    return false;
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-ai-badge-wrap";
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "2px";
    wrap.style.marginLeft = "4px";
    wrap.style.userSelect = "none";

    const badge = document.createElement("span");
    badge.className = `cm-ai-badge cm-ai-badge-${this.region.state}`;
    badge.textContent = stateToIcon(this.region.state);
    badge.title = stateToTitle(this.region.state);
    badge.dataset.aiRegionId = this.region.id;
    badge.style.cursor = this.region.state === "pending" ? "pointer" : "default";
    badge.style.fontSize = "0.75em";
    badge.style.padding = "0 4px";
    badge.style.borderRadius = "6px";
    badge.style.transition = "opacity 0.15s";

    if (this.region.state === "pending") {
      // 显示两个小按钮
      const accept = document.createElement("button");
      accept.className = "cm-ai-action cm-ai-action-accept";
      accept.textContent = "✓";
      accept.title = "接受";
      accept.dataset.aiAction = "accept";
      accept.dataset.aiRegionId = this.region.id;
      Object.assign(accept.style, {
        fontSize: "0.7em",
        padding: "0 5px",
        marginLeft: "2px",
        border: "1px solid rgba(120,180,120,0.5)",
        background: "rgba(120,180,120,0.15)",
        color: "rgba(80,140,80,1)",
        borderRadius: "4px",
        cursor: "pointer",
      } as CSSStyleDeclaration);

      const reject = document.createElement("button");
      reject.className = "cm-ai-action cm-ai-action-reject";
      reject.textContent = "✗";
      reject.title = "拒绝(删除)";
      reject.dataset.aiAction = "reject";
      reject.dataset.aiRegionId = this.region.id;
      Object.assign(reject.style, {
        fontSize: "0.7em",
        padding: "0 5px",
        marginLeft: "1px",
        border: "1px solid rgba(200,120,120,0.5)",
        background: "rgba(200,120,120,0.15)",
        color: "rgba(160,80,80,1)",
        borderRadius: "4px",
        cursor: "pointer",
      } as CSSStyleDeclaration);

      wrap.appendChild(accept);
      wrap.appendChild(reject);
    }

    wrap.appendChild(badge);

    // 绑定事件(用 capture,避免被 CodeMirror 拦截)
    wrap.addEventListener("mousedown", (e) => e.stopPropagation(), true);
    wrap.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as HTMLElement;
      const action = target.dataset.aiAction;
      const id = target.dataset.aiRegionId;
      if (!action || !id) return;
      const editorApi = getEditorApi();
      if (!editorApi) return;
      if (action === "accept") editorApi.acceptAiRegion(id);
      else if (action === "reject") editorApi.rejectAiRegion(id);
    }, true);

    return wrap;
  }
}

function stateToIcon(s: AiRegion["state"]): string {
  return s === "pending" ? "✨" : s === "accepted" ? "✓" : "✗";
}

function stateToTitle(s: AiRegion["state"]): string {
  return s === "pending"
    ? "AI 编辑"
    : s === "accepted"
      ? "已接受"
      : "已拒绝";
}

/// 编辑器初始化时也跑一次(处理空 editorView)
const initView = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      // 触发一次 recompute
      view.dispatch({ effects: recompute.of(undefined) });
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        update.view.dispatch({ effects: recompute.of(undefined) });
      }
    }
  }
);

const aiRegionTheme = EditorView.theme({
  ".cm-ai-region": {
    borderRadius: "3px",
    padding: "0 2px",
  },
  ".cm-ai-pending": {
    backgroundColor: "rgba(229, 165, 92, 0.15)",
    borderBottom: "1px dashed rgba(229, 165, 92, 0.7)",
  },
  ".cm-ai-accepted": {
    backgroundColor: "rgba(120, 180, 120, 0.10)",
    borderBottom: "1px solid rgba(120, 180, 120, 0.5)",
  },
  ".cm-ai-rejected": {
    backgroundColor: "rgba(200, 120, 120, 0.10)",
    borderBottom: "1px solid rgba(200, 120, 120, 0.4)",
    textDecoration: "line-through",
    opacity: "0.65",
  },
  ".cm-ai-hidden": {
    display: "none !important",
    height: "0 !important",
    overflow: "hidden !important",
  },
  ".cm-ai-badge": {
    display: "inline-block",
    marginLeft: "2px",
  },
  ".cm-ai-badge-pending": {
    backgroundColor: "rgba(229, 165, 92, 0.3)",
    color: "rgba(229, 165, 92, 1)",
  },
  ".cm-ai-badge-accepted": {
    backgroundColor: "rgba(120, 180, 120, 0.3)",
    color: "rgba(80, 140, 80, 1)",
  },
  ".cm-ai-badge-rejected": {
    backgroundColor: "rgba(200, 120, 120, 0.3)",
    color: "rgba(160, 80, 80, 1)",
  },
});

export function aiRegionExtension(): Extension {
  return [decoField, initView, aiRegionTheme];
}
