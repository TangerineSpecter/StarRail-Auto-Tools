import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import Select from "primevue/select";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModelProviderSettingsPanel from "@/features/settings/ModelProviderSettingsPanel.vue";
import { emptyModelProviderSettings } from "@/features/settings/model-provider-settings";

const getSettings = vi.fn(async () => emptyModelProviderSettings());
const saveSettings = vi.fn(async (settings: unknown) => settings);

vi.mock("@/shared/api/model-provider", () => ({
  modelProviderApi: {
    getSettings: () => getSettings(),
    saveSettings: (settings: unknown) => saveSettings(settings),
  },
}));

function stubMatchMedia() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function mountPanel() {
  return mount(ModelProviderSettingsPanel, {
    props: { busy: false },
    global: { plugins: [PrimeVue] },
  });
}

describe("ModelProviderSettingsPanel", () => {
  beforeEach(() => {
    stubMatchMedia();
    getSettings.mockResolvedValue(emptyModelProviderSettings());
    saveSettings.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps every field on the same label / control / hint rows with custom PrimeVue selects", async () => {
    const wrapper = mountPanel();
    await vi.waitFor(() => expect(wrapper.find("form").exists()).toBe(true));

    const fields = wrapper.findAll(".model-settings-form > label");
    expect(fields.map((field) => field.get("span").text())).toEqual([
      "服务商",
      "模型",
      "接口地址",
      "API Key",
      "检索后端",
      "搜索 API Key",
    ]);
    for (const field of fields) {
      expect(field.find("input, .model-settings-select, .key-row").exists()).toBe(true);
      expect(field.get("small").text().length).toBeGreaterThan(0);
    }
    expect(wrapper.findAll("select")).toHaveLength(0);
    expect(wrapper.findAllComponents(Select)).toHaveLength(2);
  });

  it("toggles search API key requirement when switching between DeepSeek search and Tavily", async () => {
    const wrapper = mountPanel();
    await vi.waitFor(() => expect(wrapper.find("form").exists()).toBe(true));

    const selects = wrapper.findAllComponents(Select);
    const searchSelect = selects[1];
    const searchKeyField = wrapper.findAll(".model-settings-form > label")[5];
    const searchKeyInput = searchKeyField.get("input");

    expect(searchKeyInput.attributes("disabled")).toBeDefined();

    await searchSelect.vm.$emit("update:modelValue", "tavily");
    expect(searchKeyInput.attributes("disabled")).toBeUndefined();
    expect(searchKeyInput.attributes("placeholder")).toBe("tvly-...");

    await searchSelect.vm.$emit("update:modelValue", "deepseek");
    expect(searchKeyInput.attributes("disabled")).toBeDefined();
    expect(searchKeyField.get("small").text()).toContain("复用");
  });

  it("lets the user reveal an empty API key without a wait cursor", async () => {
    const wrapper = mountPanel();
    await vi.waitFor(() => expect(wrapper.find("form").exists()).toBe(true));

    const toggle = wrapper.get(".key-row button");
    expect(toggle.attributes("disabled")).toBeUndefined();
    expect(toggle.text()).toBe("显示");
    await toggle.trigger("click");
    expect(wrapper.get(".key-row input").attributes("type")).toBe("text");
  });
});
