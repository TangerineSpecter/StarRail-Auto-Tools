import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import SettingsPage from "@/pages/SettingsPage.vue";
import { emptySyncSettings } from "@/features/settings/sync-settings";
import { emptyMcpSettings, emptyMcpStatus } from "@/features/mcp/mcp-settings";
import { runtimeContextKey } from "@/shared/contracts/runtime";
import { ref } from "vue";

vi.mock("@/shared/api/sync", () => ({
  syncApi: {
    getSettings: vi.fn(async () => emptySyncSettings()),
    saveSettings: vi.fn(async () => undefined),
    test: vi.fn(async () => undefined),
    upload: vi.fn(async () => undefined),
    download: vi.fn(async () => undefined),
  },
}));

vi.mock("@/shared/api/mcp", () => ({
  mcpApi: {
    getSettings: vi.fn(async () => emptyMcpSettings()),
    saveSettings: vi.fn(async (settings: unknown) => settings),
    getStatus: vi.fn(async () => emptyMcpStatus()),
    regenerateToken: vi.fn(async () => emptyMcpSettings()),
  },
}));

describe("SettingsPage", () => {
  it("keeps the sync station visible and can open MCP management", async () => {
    const wrapper = mount(SettingsPage, {
      global: {
        provide: {
          [runtimeContextKey]: {
            busy: ref(false),
            error: ref(""),
            notice: ref(""),
          },
        },
        stubs: {
          InputText: { template: "<input />" },
          InputNumber: { template: "<input />" },
          Password: { template: "<input />" },
          Checkbox: { template: "<input type='checkbox' />" },
        },
      },
    });

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("数据同步站");
      expect(wrapper.text()).toContain("服务器地址");
    });

    await wrapper.get('[aria-label="软件设置分区"] button:nth-child(2)').trigger("click");
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("MCP 管理");
      expect(wrapper.text()).toContain("upload_local_data");
    });
    expect(wrapper.text()).not.toContain("服务器地址");
  });

  it("does not switch sections while a settings action is busy", async () => {
    const wrapper = mount(SettingsPage, {
      global: {
        provide: {
          [runtimeContextKey]: {
            busy: ref(true),
            error: ref(""),
            notice: ref(""),
          },
        },
        stubs: {
          InputText: { template: "<input />" },
          InputNumber: { template: "<input />" },
          Password: { template: "<input />" },
          Checkbox: { template: "<input type='checkbox' />" },
        },
      },
    });

    const mcpTab = wrapper.get('[aria-label="软件设置分区"] button:nth-child(2)');
    expect(mcpTab.attributes("disabled")).toBeDefined();
    await mcpTab.trigger("click");
    expect(wrapper.text()).toContain("服务器地址");
    expect(wrapper.text()).not.toContain("upload_local_data");
  });
});
