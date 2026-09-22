import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_BASE_URL,
  emptyModelProviderSettings,
  maskApiKey,
  mergeModelProviderSettings,
  validateModelProviderSettings,
} from "@/features/settings/model-provider-settings";

describe("model provider settings", () => {
  it("defaults to DeepSeek's official endpoint and Flash model", () => {
    expect(emptyModelProviderSettings()).toEqual({
      provider: "deepseek",
      apiKey: "",
      baseUrl: DEEPSEEK_BASE_URL,
      model: "deepseek-flash",
      searchProvider: "duckduckgo",
      searchApiKey: "",
    });
  });

  it("preserves only the supported provider while merging saved settings", () => {
    expect(
      mergeModelProviderSettings({ provider: "deepseek", model: "deepseek-v4-pro" }),
    ).toMatchObject({
      provider: "deepseek",
      model: "deepseek-v4-pro",
    });
  });

  it("uses the official endpoint and supported model names", () => {
    const settings = emptyModelProviderSettings();
    settings.baseUrl = "https://api.deepseek.com/v1";
    expect(validateModelProviderSettings(settings)).toContain("官方");
    settings.baseUrl = DEEPSEEK_BASE_URL;
    settings.model = "other" as never;
    expect(validateModelProviderSettings(settings)).toContain("Flash");
    settings.model = "deepseek-flash";
    settings.searchProvider = "google" as never;
    expect(validateModelProviderSettings(settings)).toContain("博查");
  });

  it("masks configured API keys", () => {
    expect(maskApiKey("sk-abcdefghijkl")).toBe("sk-a••••ijkl");
  });
});
