import type { DeepSeekModel, ModelProviderSettings, SearchProvider } from "@/types";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_DEFAULT_MODEL: DeepSeekModel = "deepseek-flash";
export const DEEPSEEK_MODELS: Array<{ id: DeepSeekModel; label: string; description: string }> = [
  { id: "deepseek-flash", label: "Flash", description: "速度与成本优先，支持图像理解" },
  { id: "deepseek-v4-pro", label: "Pro", description: "更强的推理与生成能力" },
];
export const SEARCH_PROVIDERS: Array<{
  id: SearchProvider;
  label: string;
  description: string;
}> = [
  {
    id: "duckduckgo",
    label: "DuckDuckGo",
    description: "免费、无需 Key，适合先跑通；中文攻略有时不稳定",
  },
  {
    id: "bocha",
    label: "博查",
    description: "中文攻略更稳，需在博查开放平台领取免费次数并填写 Key",
  },
];

export function emptyModelProviderSettings(): ModelProviderSettings {
  return {
    provider: "deepseek",
    apiKey: "",
    baseUrl: DEEPSEEK_BASE_URL,
    model: DEEPSEEK_DEFAULT_MODEL,
    searchProvider: "duckduckgo",
    searchApiKey: "",
  };
}

export function mergeModelProviderSettings(
  value?: Partial<ModelProviderSettings> | null,
): ModelProviderSettings {
  const base = emptyModelProviderSettings();
  return {
    provider: "deepseek",
    apiKey: value?.apiKey ?? base.apiKey,
    baseUrl: value?.baseUrl ?? base.baseUrl,
    model: isDeepSeekModel(value?.model) ? value.model : base.model,
    searchProvider: isSearchProvider(value?.searchProvider)
      ? value.searchProvider
      : base.searchProvider,
    searchApiKey: value?.searchApiKey ?? base.searchApiKey,
  };
}

export function validateModelProviderSettings(settings: ModelProviderSettings): string {
  if (settings.baseUrl !== DEEPSEEK_BASE_URL) return "DeepSeek 官方接口地址不可修改。";
  if (!isDeepSeekModel(settings.model)) return "请选择 Flash 或 Pro 模型。";
  if (!isSearchProvider(settings.searchProvider)) return "请选择 DuckDuckGo 或博查作为检索后端。";
  return "";
}

function isDeepSeekModel(value: unknown): value is DeepSeekModel {
  return value === "deepseek-flash" || value === "deepseek-v4-pro";
}

function isSearchProvider(value: unknown): value is SearchProvider {
  return value === "duckduckgo" || value === "bocha";
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey) return "尚未配置";
  if (apiKey.length <= 8) return "••••••••";
  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
}
