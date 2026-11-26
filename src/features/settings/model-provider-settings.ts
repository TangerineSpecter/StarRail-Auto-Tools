import type { DeepSeekModel, ModelProviderSettings, SearchProvider } from "@/types";

export interface DeepSeekModelOption {
  id: DeepSeekModel;
  label: string;
  badge: string;
  description: string;
}

export interface SearchProviderOption {
  id: SearchProvider;
  label: string;
  badge: string;
  description: string;
  requiresSearchKey: boolean;
  keyPlaceholder: string;
  keyHint: string;
}

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_DEFAULT_MODEL: DeepSeekModel = "deepseek-flash";
export const DEEPSEEK_MODELS: DeepSeekModelOption[] = [
  {
    id: "deepseek-flash",
    label: "Flash",
    badge: "deepseek-flash",
    description: "速度与成本优先，支持图像理解",
  },
  {
    id: "deepseek-v4-pro",
    label: "Pro",
    badge: "deepseek-v4-pro",
    description: "更强的推理与生成能力",
  },
];
export const SEARCH_PROVIDERS: SearchProviderOption[] = [
  {
    id: "deepseek",
    label: "DeepSeek 搜索",
    badge: "官方 · 复用 Key",
    description: "官方 /v1/tools/search 接口，直接复用上方 Key，约 ¥0.005/次且支持返回网页正文",
    requiresSearchKey: false,
    keyPlaceholder: "复用上方 DeepSeek API Key",
    keyHint: "直接复用上方 DeepSeek API Key，无需额外填写搜索 Key。",
  },
  {
    id: "tavily",
    label: "Tavily",
    badge: "免费额度",
    description: "每月含免费检索额度，支持拉取完整攻略正文，需填写 Tavily API Key",
    requiresSearchKey: true,
    keyPlaceholder: "tvly-...",
    keyHint: "在 Tavily 控制台创建并粘贴 API Key。",
  },
  {
    id: "bocha",
    label: "博查",
    badge: "中文",
    description: "中文攻略稳定，需在博查开放平台创建并填写搜索 Key",
    requiresSearchKey: true,
    keyPlaceholder: "sk-...",
    keyHint: "在博查开放平台创建并粘贴 API Key。",
  },
];

export function findDeepSeekModel(id?: string): DeepSeekModelOption {
  return DEEPSEEK_MODELS.find((item) => item.id === id) ?? DEEPSEEK_MODELS[0];
}

export function findSearchProvider(id?: string): SearchProviderOption {
  return SEARCH_PROVIDERS.find((item) => item.id === id) ?? SEARCH_PROVIDERS[0];
}

export function emptyModelProviderSettings(): ModelProviderSettings {
  return {
    provider: "deepseek",
    apiKey: "",
    baseUrl: DEEPSEEK_BASE_URL,
    model: DEEPSEEK_DEFAULT_MODEL,
    searchProvider: "deepseek",
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
  if (!isSearchProvider(settings.searchProvider)) {
    return "请选择 DeepSeek 搜索、Tavily 或博查作为检索后端。";
  }
  return "";
}

function isDeepSeekModel(value: unknown): value is DeepSeekModel {
  return value === "deepseek-flash" || value === "deepseek-v4-pro";
}

function isSearchProvider(value: unknown): value is SearchProvider {
  return value === "deepseek" || value === "tavily" || value === "bocha";
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey) return "尚未配置";
  if (apiKey.length <= 8) return "••••••••";
  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
}
