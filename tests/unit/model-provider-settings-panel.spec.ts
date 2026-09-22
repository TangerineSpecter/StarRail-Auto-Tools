import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
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

describe("ModelProviderSettingsPanel", () => {
  it("keeps every field on the same label / control / hint rows", async () => {
    const wrapper = mount(ModelProviderSettingsPanel, { props: { busy: false } });
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
      expect(field.find("input, select, .key-row").exists()).toBe(true);
      expect(field.get("small").text().length).toBeGreaterThan(0);
    }
  });

  it("lets the user reveal an empty API key without a wait cursor", async () => {
    const wrapper = mount(ModelProviderSettingsPanel, { props: { busy: false } });
    await vi.waitFor(() => expect(wrapper.find("form").exists()).toBe(true));

    const toggle = wrapper.get(".key-row button");
    expect(toggle.attributes("disabled")).toBeUndefined();
    expect(toggle.text()).toBe("显示");
    await toggle.trigger("click");
    expect(wrapper.get(".key-row input").attributes("type")).toBe("text");
  });
});
