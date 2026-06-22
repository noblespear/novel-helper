// AI 设置页 - 配置 Provider、API key、Model

import { useEffect, useState } from "react";
import { useAppStore } from "../stores/app";
import { api } from "../lib/api";
import type { ProviderConfig, PromptTemplates } from "../types";

const DEFAULT_PROMPTS: PromptTemplates = {
  polish_selection:
    "你是一个中文网文润色助手。保持作者文风,只改不通顺、错别字、明显病句。直接返回润色后的文本,不要解释、不要 markdown 包裹。",
  polish_chapter:
    "你是一个中文网文润色助手。保持作者文风,只改不通顺、错别字、明显病句。直接返回润色后的全文,不要解释。",
  continue_write:
    "你是中文网文续写助手。基于用户给的正文续写约 200 字,保持文风一致,情节连贯。只返回续写内容,不要解释。",
  character_design: "你是网文编辑,擅长角色设计。",
  general_chat:
    "你是一个中文网文写作助手,帮作者构思、答疑、激发灵感。回答简洁有针对性,优先给可执行的具体建议。",
  rewrite:
    "你是中文网文改写助手。保持原意,把用户给的文本换一种更生动的表达方式重写,保留关键情节,只调整文笔、句式、视角细节。直接返回改写后的文本,不要解释。",
};

const PROMPT_KEYS: { key: keyof PromptTemplates; label: string; hint: string }[] = [
  {
    key: "polish_selection",
    label: "选区润色",
    hint: "用于「润色选区」,占位符:{text} {chapter_title}",
  },
  {
    key: "polish_chapter",
    label: "整章润色",
    hint: "用于「润色本章」,占位符:{text} {chapter_title}",
  },
  {
    key: "continue_write",
    label: "续写",
    hint: "用于「续写 200 字」,占位符:{text} {chapter_title}",
  },
  {
    key: "rewrite",
    label: "改写",
    hint: "用于划线浮窗「重写」,占位符:{text} {chapter_title}",
  },
  {
    key: "character_design",
    label: "角色设计",
    hint: "用于「角色建议」",
  },
  {
    key: "general_chat",
    label: "通用聊天",
    hint: "用于普通对话,空 = 不发 system 消息",
  },
];

const PRESET_PROVIDERS = [
  {
    type: "mock",
    label: "Mock (无需 Key,演示用)",
    baseUrl: "",
    defaultModel: "mock-balanced",
  },
  {
    type: "openai",
    label: "DeepSeek (OpenAI 兼容)",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
  },
  {
    type: "openai",
    label: "Moonshot Kimi (OpenAI 兼容)",
    baseUrl: "https://api.moonshot.cn",
    defaultModel: "moonshot-v1-8k",
  },
  {
    type: "openai",
    label: "通义千问 (OpenAI 兼容)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode",
    defaultModel: "qwen-plus",
  },
  {
    type: "openai",
    label: "OpenAI 官方",
    baseUrl: "https://api.openai.com",
    defaultModel: "gpt-4o-mini",
  },
  {
    type: "anthropic",
    label: "Anthropic Claude",
    baseUrl: "",
    defaultModel: "claude-3-5-sonnet-20241022",
  },
] as const;

export function AISettingsPanel() {
  const { aiConfig, setAIConfig } = useAppStore();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [providerType, setProviderType] = useState<"mock" | "openai" | "anthropic">("mock");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [prompts, setPrompts] = useState<PromptTemplates>(DEFAULT_PROMPTS);
  const [promptsSaving, setPromptsSaving] = useState(false);
  const [promptsResult, setPromptsResult] = useState<string | null>(null);

  useEffect(() => {
    if (aiConfig) {
      setProviderType(aiConfig.provider_type);
      setBaseUrl(aiConfig.base_url);
      setModel(aiConfig.model);
      setApiKey(aiConfig.api_key || "");
    }
  }, [aiConfig]);

  // 加载提示词模板
  useEffect(() => {
    api
      .getPromptTemplates()
      .then((t) => setPrompts(t))
      .catch(() => setPrompts(DEFAULT_PROMPTS));
  }, []);

  const onPresetChange = (presetLabel: string) => {
    const preset = PRESET_PROVIDERS.find((p) => p.label === presetLabel);
    if (!preset) return;
    setProviderType(preset.type as "mock" | "openai" | "anthropic");
    setBaseUrl(preset.baseUrl);
    setModel(preset.defaultModel);
  };

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const newConfig: ProviderConfig = {
        provider_type: providerType,
        api_key: apiKey, // 后端会写入 keyring
        base_url: baseUrl,
        model: model,
      };
      const updated = await api.updateAIConfig(newConfig);
      setAIConfig(updated);
      setApiKey(""); // 清空输入
      setTestResult("✓ 已保存");
    } catch (e) {
      setTestResult(`✗ 保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrompts = async () => {
    setPromptsSaving(true);
    setPromptsResult(null);
    try {
      await api.updatePromptTemplates(prompts);
      setPromptsResult("✓ 已保存");
    } catch (e) {
      setPromptsResult(`✗ 保存失败: ${e}`);
    } finally {
      setPromptsSaving(false);
    }
  };

  const resetPrompts = () => {
    if (confirm("恢复全部提示词为内置默认值?当前编辑会丢失。")) {
      setPrompts(DEFAULT_PROMPTS);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setAvailableModels([]);
    try {
      // 先保存当前设置(如果改了)
      if (apiKey) {
        await handleSave();
      }
      const ok = await api.validateAIKey();
      if (ok) {
        setTestResult("✓ API Key 有效");
        // 尝试列模型
        setLoadingModels(true);
        try {
          const models = await api.listAIModels();
          setAvailableModels(models);
        } catch (e) {
          console.warn("list models failed:", e);
        } finally {
          setLoadingModels(false);
        }
      } else {
        setTestResult("✗ API Key 无效");
      }
    } catch (e) {
      setTestResult(`✗ ${e}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h2 className="text-2xl font-bold mb-2">AI 设置</h2>
      <p className="text-sm text-muted mb-6">
        配置 AI Provider 以使用润色、续写、角色设计等 AI 功能。API Key 加密存储在系统凭据管理器。
      </p>

      <div className="card p-6 space-y-4">
        <Field label="Provider 预设">
          <select
            className="input"
            value={
              PRESET_PROVIDERS.find(
                (p) => p.baseUrl === baseUrl && p.type === providerType
              )?.label || ""
            }
            onChange={(e) => onPresetChange(e.target.value)}
          >
            <option value="">自定义</option>
            {PRESET_PROVIDERS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="API Key">
          <input
            type="password"
            className="input font-mono"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              aiConfig?.api_key
                ? "已设置(留空保留原值,输入新值覆盖)"
                : "sk-..."
            }
            autoComplete="off"
          />
          <div className="text-xs text-muted mt-1">
            {providerType === "mock"
              ? "Mock 模式不需要 API Key"
              : "Key 仅存于本地(Windows 凭据管理器),不发送到任何地方"}
          </div>
        </Field>

        {providerType !== "mock" && (
          <Field label="Base URL">
            <input
              className="input font-mono text-xs"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com"
            />
          </Field>
        )}

        <Field label="默认模型">
          <input
            className="input font-mono"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="deepseek-chat"
            list="model-suggestions"
          />
          {availableModels.length > 0 && (
            <datalist id="model-suggestions">
              {availableModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          )}
          <div className="text-xs text-muted mt-1">
            {loadingModels
              ? "正在加载模型列表..."
              : availableModels.length > 0
              ? `已加载 ${availableModels.length} 个可用模型`
              : "点下方「测试」可拉取模型列表"}
          </div>
        </Field>

        <div className="flex gap-2 pt-2">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            className="btn"
            onClick={handleTest}
            disabled={testing || providerType === "mock"}
          >
            {testing ? "测试中..." : "测试连接"}
          </button>
        </div>

        {testResult && (
          <div
            className="text-sm px-3 py-2 rounded"
            style={{
              background: testResult.startsWith("✓")
                ? "var(--color-accent-soft-bg, rgba(229, 165, 92, 0.12))"
                : "rgba(220, 50, 50, 0.12)",
              color: testResult.startsWith("✓")
                ? "var(--color-accent)"
                : "#e57373",
            }}
          >
            {testResult}
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-muted">
        <p className="font-medium mb-2">当前状态</p>
        <ul className="space-y-1 list-disc pl-5">
          <li>Provider: {aiConfig?.provider_type || "未设置"}</li>
          <li>Base URL: {aiConfig?.base_url || "—"}</li>
          <li>Model: {aiConfig?.model || "—"}</li>
          <li>API Key: {aiConfig?.api_key ? "已设置 ✓" : "未设置"}</li>
        </ul>
      </div>

      {/* 系统提示词模板 */}
      <div className="mt-6 card p-5">
        <button
          onClick={() => setPromptsOpen((v) => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <div>
            <div className="font-medium">系统提示词模板</div>
            <div className="text-xs text-muted mt-0.5">
              自定义每个 AI 动作的系统提示,留空表示使用内置默认
            </div>
          </div>
          <span className="text-muted">{promptsOpen ? "▾" : "▸"}</span>
        </button>

        {promptsOpen && (
          <div className="mt-4 space-y-4">
            {PROMPT_KEYS.map(({ key, label, hint }) => (
              <Field key={key} label={label} hint={hint}>
                <textarea
                  className="input text-xs font-mono min-h-[60px] resize-y"
                  value={prompts[key]}
                  onChange={(e) =>
                    setPrompts((p) => ({ ...p, [key]: e.target.value }))
                  }
                  placeholder="(空 = 使用内置默认)"
                />
              </Field>
            ))}

            <div className="flex gap-2 pt-1">
              <button
                className="btn btn-primary"
                onClick={handleSavePrompts}
                disabled={promptsSaving}
              >
                {promptsSaving ? "保存中..." : "保存提示词"}
              </button>
              <button className="btn" onClick={resetPrompts}>
                恢复默认
              </button>
            </div>

            {promptsResult && (
              <div
                className="text-sm px-3 py-2 rounded"
                style={{
                  background: promptsResult.startsWith("✓")
                    ? "var(--color-accent-soft-bg, rgba(229, 165, 92, 0.12))"
                    : "rgba(220, 50, 50, 0.12)",
                  color: promptsResult.startsWith("✓")
                    ? "var(--color-accent)"
                    : "#e57373",
                }}
              >
                {promptsResult}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs text-muted mb-1.5 font-medium">{label}</div>
      {children}
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </label>
  );
}
