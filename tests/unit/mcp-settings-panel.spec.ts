import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import McpSettingsPanel from "@/features/mcp/McpSettingsPanel.vue";
import { emptyMcpSettings, emptyMcpStatus } from "@/features/mcp/mcp-settings";

const getSettings = vi.fn(async () => emptyMcpSettings());
const saveSettings = vi.fn(async (settings: unknown) => settings);
const getStatus = vi.fn(async () => emptyMcpStatus());
const regenerateToken = vi.fn(async () => ({ ...emptyMcpSettings(), token: "abcd1234efgh5678" }));

vi.mock("@/shared/api/mcp", () => ({
  mcpApi: {
    getSettings: () => getSettings(),
    saveSettings: (settings: unknown) => saveSettings(settings),
    getStatus: () => getStatus(),
    regenerateToken: () => regenerateToken(),
  },
}));

describe("McpSettingsPanel", () => {
  it("shows the two sync tools and switches client snippets", async () => {
    const wrapper = mount(McpSettingsPanel, {
      props: { busy: false },
      global: {
        stubs: {
          InputNumber: { template: "<input />" },
        },
      },
    });
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("upload_local_data");
    });
    expect(wrapper.text()).toContain("restore_remote_backup");
    expect(wrapper.text()).toContain("[mcp_servers.starrail]");

    await wrapper.get('[aria-label="客户端配置"] button:nth-child(2)').trigger("click");
    expect(wrapper.text()).toContain('"mcpServers"');
    expect(wrapper.text()).toContain("starrail");
    expect(wrapper.get('[aria-label="客户端配置"]').text()).toContain("TraeWork");
  });

  it("blocks invalid ports before invoking save", async () => {
    const wrapper = mount(McpSettingsPanel, {
      props: { busy: false },
      global: {
        stubs: {
          InputNumber: { template: "<input />" },
        },
      },
    });
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("保存并应用");
    });
    wrapper.vm.settings.port = 80;
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("error")?.[0]).toEqual(["端口必须在 1024 到 65535 之间。"]);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("reports a failed status refresh after settings are saved", async () => {
    saveSettings.mockResolvedValueOnce({
      enabled: false,
      port: 18765,
      token: "",
    });
    getStatus.mockRejectedValueOnce(new Error("status failed"));
    const wrapper = mount(McpSettingsPanel, {
      props: { busy: false },
      global: {
        stubs: {
          InputNumber: { template: "<input />" },
        },
      },
    });
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("保存并应用");
    });
    await wrapper.get("form").trigger("submit");
    await vi.waitFor(() => {
      expect(wrapper.emitted("error")?.[0]?.[0]).toContain("status failed");
    });
  });
});
