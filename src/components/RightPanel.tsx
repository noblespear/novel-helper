// 右栏(可切换:大纲/人物/AI/检索/知识库/AI设置)
// 人物 tab 是 agent 的家(角色扮演 + 知识召回 + 编辑)

import { useState, useEffect } from "react";
import { useAppStore } from "../stores/app";
import { api } from "../lib/api";
import { AIChatPanel } from "./AIChatPanel";
import { AISettingsPanel } from "./AISettingsPanel";
import { KnowledgeBase } from "./KnowledgeBase";
import { CharacterPanel as CharacterTab } from "./CharacterPanel";
import { LorePanel as LoreTab } from "./LorePanel";
import { cn } from "../lib/utils";
import type { OutlineNodeTree, ChatMessage } from "../types";

const tabs = [
  { id: "outline" as const, label: "大纲", icon: "📋" },
  { id: "character" as const, label: "人物", icon: "👤" },
  { id: "lore" as const, label: "设定", icon: "🌍" },
  { id: "ai" as const, label: "AI", icon: "🤖" },
  { id: "rag" as const, label: "检索", icon: "🔍" },
  { id: "kb" as const, label: "知识库", icon: "📚" },
];

export function RightPanel() {
  const { rightPanel, setRightPanel, currentProjectId } = useAppStore();
  return (
    <aside
      className="w-80 shrink-0 border-l flex flex-col"
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
    >
      <div
        className="flex border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            className={cn(
              "flex-1 py-2 text-xs flex items-center justify-center gap-1 transition-colors",
              rightPanel === t.id
                ? "border-b-2 accent-bright"
                : "text-muted hover:elevated"
            )}
            style={{
              borderColor:
                rightPanel === t.id ? "var(--color-accent)" : undefined,
              background: rightPanel === t.id ? "var(--color-elevated)" : undefined,
            }}
            onClick={() => setRightPanel(t.id)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto text-sm">
        {rightPanel === "outline" && <OutlinePanel />}
        {rightPanel === "character" && currentProjectId && <CharacterTab projectId={currentProjectId} />}
        {rightPanel === "lore" && currentProjectId && <LoreTab projectId={currentProjectId} />}
        {rightPanel === "ai" && <AIChatPanel />}
        {rightPanel === "rag" && <RAGPanel />}
        {rightPanel === "kb" && currentProjectId && <KnowledgeBase projectId={currentProjectId} />}
        {rightPanel === "ai-settings" && <AISettingsPanel />}
      </div>
    </aside>
  );
}

function OutlinePanel() {
  const { currentProjectId, outline, loadOutline, addOutlineNode, updateOutlineNode, deleteOutlineNode } = useAppStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingContent, setEditingContent] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  useEffect(() => {
    if (currentProjectId) {
      loadOutline(currentProjectId);
    }
  }, [currentProjectId, loadOutline]);

  // 找到选中的节点
  const findNode = (nodes: OutlineNodeTree[], id: string): OutlineNodeTree | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = findNode(n.children, id);
      if (found) return found;
    }
    return null;
  };
  const selectedNode = selectedId ? findNode(outline, selectedId) : null;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectNode = (node: OutlineNodeTree) => {
    // 先保存之前的编辑
    saveCurrentEdit();
    setSelectedId(node.id);
    setEditingTitle(node.title);
    setEditingContent(node.content);
    // 自动展开
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(node.id);
      return next;
    });
  };

  const saveCurrentEdit = async () => {
    if (!currentProjectId || !selectedId || !selectedNode) return;
    if (editingTitle === selectedNode.title && editingContent === selectedNode.content) return;
    await updateOutlineNode(currentProjectId, {
      ...selectedNode,
      title: editingTitle,
      content: editingContent,
    });
  };

  const handleAdd = async (level: string, parentId: string | null = null) => {
    if (!currentProjectId) return;
    const title = level === "macro" ? "总纲" : level === "volume" ? "新卷" : "新章节";
    const node = await addOutlineNode(currentProjectId, level, parentId, title);
    if (node) {
      selectNode({ ...node, children: [] });
    }
  };

  const handleDelete = async (nodeId: string) => {
    if (!currentProjectId) return;
    if (!confirm("确认删除此节点及其所有子节点?")) return;
    if (selectedId === nodeId) {
      setSelectedId(null);
    }
    await deleteOutlineNode(currentProjectId, nodeId);
  };

  const handleAIGenerate = async () => {
    if (!currentProjectId || !selectedNode) return;
    setAiGenerating(true);

    // 构建提示词
    let systemPrompt = "";
    let userPrompt = "";

    if (selectedNode.level === "macro") {
      systemPrompt = `你是一个专业的中文网文大纲助手。你的任务是根据用户提供的总纲，生成合理的分卷结构。

输出要求：
1. 严格按照 JSON 格式输出，不要包含任何其他文字
2. 每卷需要有标题和内容描述
3. 卷的数量根据故事规模合理规划（一般 3-5 卷）
4. 每卷包含 3-5 个章节作为示例

重要：JSON 必须完整，不要被截断。

输出 JSON 格式：
{
  "volumes": [
    {
      "title": "卷标题",
      "content": "本卷故事概要",
      "chapters": [
        { "title": "章标题", "content": "章节情节要点" }
      ]
    }
  ]
}`;

      userPrompt = `请根据以下总纲，生成分卷结构（3-5卷，每卷3-5章）：

总纲标题：${selectedNode.title}
总纲内容：${selectedNode.content || "（请根据标题推断故事内容）"}`;
    } else if (selectedNode.level === "volume") {
      systemPrompt = `你是一个专业的中文网文大纲助手。你的任务是根据用户提供的卷信息，生成详细的章节大纲。

输出要求：
1. 严格按照 JSON 格式输出，不要包含任何其他文字
2. 每章需要有标题和情节要点
3. 章节数量控制在 3-5 章
4. 章节之间要有连贯性

重要：JSON 必须完整，不要被截断。

输出 JSON 格式：
{
  "chapters": [
    { "title": "章标题", "content": "章节情节要点" }
  ]
}`;

      userPrompt = `请根据以下卷信息，生成章节大纲（3-5章）：

卷标题：${selectedNode.title}
卷内容：${selectedNode.content || "（请根据标题推断内容）"}`;
    }

    try {
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

      let acc = "";
      await api.aiChatStream(messages, (chunk) => {
        if (!chunk.done && chunk.content) {
          acc += chunk.content;
        }
      });

      console.log("AI response:", acc);

      // 解析 JSON 响应 - 更健壮的解析
      let jsonStr = acc;

      // 1. 尝试提取 markdown 代码块中的 JSON
      const jsonMatch = acc.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      // 2. 清理字符串
      jsonStr = jsonStr.trim();

      // 3. 尝试修复常见的 JSON 问题
      // 如果以 { 开头但没有匹配的 }，尝试补全
      if (jsonStr.startsWith("{") && !jsonStr.endsWith("}")) {
        // 找到最后一个完整的对象
        const lastCompleteObj = jsonStr.lastIndexOf("}");
        if (lastCompleteObj > 0) {
          jsonStr = jsonStr.substring(0, lastCompleteObj + 1);
          // 补全数组和对象
          const openBrackets = (jsonStr.match(/\[/g) || []).length;
          const closeBrackets = (jsonStr.match(/\]/g) || []).length;
          const openBraces = (jsonStr.match(/{/g) || []).length;
          const closeBraces = (jsonStr.match(/}/g) || []).length;

          for (let i = 0; i < openBrackets - closeBrackets; i++) jsonStr += "]";
          for (let i = 0; i < openBraces - closeBraces; i++) jsonStr += "}";
        }
      }

      console.log("Parsed JSON:", jsonStr);

      const result = JSON.parse(jsonStr);

      // 根据级别添加节点
      let addedCount = 0;
      if (selectedNode.level === "macro" && result.volumes) {
        for (const vol of result.volumes) {
          const volNode = await addOutlineNode(currentProjectId, "volume", selectedNode.id, vol.title);
          if (volNode) {
            // 更新卷的 content
            if (vol.content) {
              await updateOutlineNode(currentProjectId, { ...volNode, content: vol.content });
            }
            if (vol.chapters) {
              for (const ch of vol.chapters) {
                const chNode = await addOutlineNode(currentProjectId, "chapter", volNode.id, ch.title);
                if (chNode && ch.content) {
                  await updateOutlineNode(currentProjectId, { ...chNode, content: ch.content });
                }
                addedCount++;
              }
            }
          }
        }
      } else if (selectedNode.level === "volume" && result.chapters) {
        for (const ch of result.chapters) {
          const chNode = await addOutlineNode(currentProjectId, "chapter", selectedNode.id, ch.title);
          if (chNode && ch.content) {
            await updateOutlineNode(currentProjectId, { ...chNode, content: ch.content });
          }
          addedCount++;
        }
      }

      // 重新加载大纲
      await loadOutline(currentProjectId);
      alert(`AI 大纲生成完成！共添加 ${addedCount} 个节点。`);
    } catch (e) {
      console.error("AI generation failed:", e);
      alert("AI 生成失败：" + e + "\n\n请确保已配置 AI Provider。");
    } finally {
      setAiGenerating(false);
    }
  };

  // 根据父节点级别决定可以添加的子节点类型
  const getAddableLevels = (parentLevel: string | null): string[] => {
    if (!parentLevel) return ["macro"];
    if (parentLevel === "macro") return ["volume"];
    if (parentLevel === "volume") return ["chapter"];
    return []; // chapter 下不能再添加子节点
  };

  const renderNode = (node: OutlineNodeTree, depth: number = 0) => {
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedId === node.id;
    const hasChildren = node.children.length > 0;
    const levelIcon = node.level === "macro" ? "📖" : node.level === "volume" ? "📚" : "📄";
    const addable = getAddableLevels(node.level);

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1 py-1 px-2 rounded group cursor-pointer ${isSelected ? "bg-[var(--color-elevated)] border border-[var(--color-accent)]" : "hover:bg-[var(--color-elevated)] border border-transparent"}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => selectNode(node)}
        >
          {/* 展开/折叠按钮 */}
          <button
            className="w-4 h-4 flex items-center justify-center text-muted shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node.id);
            }}
          >
            {hasChildren ? (isExpanded ? "▼" : "▶") : <span className="w-4" />}
          </button>

          {/* 级别图标 */}
          <span className="text-xs shrink-0">{levelIcon}</span>

          {/* 标题 */}
          <span className="flex-1 text-sm truncate">{node.title}</span>

          {/* 内容预览 */}
          {node.content && (
            <span className="text-xs text-muted truncate max-w-[80px]">
              {node.content.slice(0, 20)}...
            </span>
          )}

          {/* 操作按钮 */}
          <div className="hidden group-hover:flex items-center gap-1 shrink-0">
            {addable.length > 0 && (
              <button
                className="text-xs text-muted hover:text-[var(--color-accent)]"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAdd(addable[0], node.id);
                }}
                title={`添加${addable[0] === "volume" ? "卷" : "章"}`}
              >
                +
              </button>
            )}
            <button
              className="text-xs text-muted hover:text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(node.id);
              }}
              title="删除"
            >
              ×
            </button>
          </div>
        </div>

        {/* 子节点 */}
        {isExpanded &&
          node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-xs font-medium text-default">📋 大纲</span>
        <div className="flex items-center gap-2">
          {selectedNode && selectedNode.level !== "chapter" && (
            <button
              className="text-xs px-2 py-0.5 rounded bg-[var(--color-accent)] text-white disabled:opacity-50"
              onClick={handleAIGenerate}
              disabled={aiGenerating}
            >
              {aiGenerating ? "..." : "🤖 AI 拆解"}
            </button>
          )}
          <button
            className="text-xs text-muted hover:text-[var(--color-accent)]"
            onClick={() => handleAdd("macro")}
          >
            + 添加
          </button>
        </div>
      </div>

      {/* 内容区：左侧树 + 右侧编辑 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：大纲树 */}
        <div className="w-48 border-r overflow-y-auto" style={{ borderColor: "var(--color-border)" }}>
          <div className="p-2">
            {outline.length === 0 ? (
              <div className="text-center text-muted text-xs py-8">
                <p className="mb-2">暂无大纲</p>
                <p>点击"+ 添加"开始创建</p>
              </div>
            ) : (
              outline.map((node) => renderNode(node))
            )}
          </div>
        </div>

        {/* 右侧：编辑区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedNode ? (
            <>
              {/* 标题编辑 */}
              <div className="px-3 py-2 border-b" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-muted">
                    {selectedNode.level === "macro" ? "📖 总纲" : selectedNode.level === "volume" ? "📚 卷" : "📄 章"}
                  </span>
                </div>
                <input
                  className="input text-sm w-full"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={saveCurrentEdit}
                  placeholder="标题"
                />
              </div>

              {/* 内容编辑 */}
              <div className="flex-1 overflow-hidden">
                <textarea
                  className="w-full h-full p-3 text-sm bg-transparent border-none outline-none resize-none font-writing"
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  onBlur={saveCurrentEdit}
                  placeholder={selectedNode.level === "chapter" ? "在此输入章节正文..." : "在此输入大纲内容..."}
                  style={{ lineHeight: "1.8" }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted text-xs">
              选择左侧节点编辑内容
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RAGPanel() {
  return (
    <div className="p-4">
      <p className="mb-2 text-default">🔍 全书检索</p>
      <p className="text-xs text-muted">请使用顶部「知识库」标签</p>
    </div>
  );
}
