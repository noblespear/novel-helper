// AI 设置页 - 配置 Provider、API key、Model

import { useEffect, useState } from "react";
import { useAppStore } from "../stores/app";
import { api } from "../lib/api";
import type { ProviderConfig } from "../types";

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

  useEffect(() => {
    if (aiConfig) {
      setProviderType(aiConfig.provider_type);
      setBaseUrl(aiConfig.base_url);
      setModel(aiConfig.model);
      // api_key 不回显(从 keyring 读取,后端不应该返回明文)
    }
  }, [aiConfig]);

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
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted mb-1.5 font-medium">{label}</div>
      {children}
    </label>
  );
}
