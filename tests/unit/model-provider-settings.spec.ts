import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_BASE_URL,
  emptyModelProviderSettings,
  findSearchProvider,
  maskApiKey,
  mergeModelProviderSettings,
  validateModelProviderSettings,
} from "@/features/settings/model-provider-settings";

describe("model provider settings", () => {
  it("defaults to DeepSeek's official endpoint, Flash model, and DeepSeek search", () => {
    expect(emptyModelProviderSettings()).toEqual({
      provider: "deepseek",
      apiKey: "",
      baseUrl: DEEPSEEK_BASE_URL,
      model: "deepseek-flash",
      searchProvider: "deepseek",
      searchApiKey: "",
    });
  });

  it("preserves supported search providers and migrates legacy DuckDuckGo to DeepSeek", () => {
    expect(
      mergeModelProviderSettings({
        provider: "deepseek",
        model: "deepseek-v4-pro",
        searchProvider: "tavily",
      }),
    ).toMatchObject({
      provider: "deepseek",
      model: "deepseek-v4-pro",
      searchProvider: "tavily",
    });
    expect(
      mergeModelProviderSettings({ searchProvider: "duckduckgo" as never }).searchProvider,
    ).toBe("deepseek");
  });

  it("uses the official endpoint and supported model / search provider names", () => {
    const settings = emptyModelProviderSettings();
    settings.baseUrl = "https://api.deepseek.com/v1";
    expect(validateModelProviderSettings(settings)).toContain("官方");
    settings.baseUrl = DEEPSEEK_BASE_URL;
    settings.model = "other" as never;
    expect(validateModelProviderSettings(settings)).toContain("Flash");
    settings.model = "deepseek-flash";
    settings.searchProvider = "deepseek";
    expect(validateModelProviderSettings(settings)).toBe("");
    settings.searchProvider = "tavily";
    expect(validateModelProviderSettings(settings)).toBe("");
    settings.searchProvider = "duckduckgo" as never;
    expect(validateModelProviderSettings(settings)).toContain("博查");
  });

  it("exposes search key requirements per search provider", () => {
    expect(findSearchProvider("deepseek").requiresSearchKey).toBe(false);
    expect(findSearchProvider("tavily").requiresSearchKey).toBe(true);
    expect(findSearchProvider("bocha").requiresSearchKey).toBe(true);
  });

  it("masks configured API keys", () => {
    expect(maskApiKey("sk-abcdefghijkl")).toBe("sk-a••••ijkl");
  });
});
