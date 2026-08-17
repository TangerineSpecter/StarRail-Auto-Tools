import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import DataSyncSettingsPanel from "@/features/settings/DataSyncSettingsPanel.vue";
import { emptySyncSettings } from "@/features/settings/sync-settings";

vi.mock("@/shared/api/sync", () => ({
  syncApi: {
    getSettings: vi.fn(async () => emptySyncSettings()),
    saveSettings: vi.fn(async () => undefined),
    test: vi.fn(async () => undefined),
    upload: vi.fn(async () => undefined),
    download: vi.fn(async () => undefined),
  },
}));

describe("DataSyncSettingsPanel", () => {
  it("switches protocol fields without dropping the shared layout", async () => {
    const wrapper = mount(DataSyncSettingsPanel, {
      props: { busy: false },
      global: {
        stubs: {
          InputText: { template: "<input />" },
          InputNumber: { template: "<input />" },
          Password: { template: "<input />" },
          Checkbox: { template: "<input type='checkbox' />" },
        },
      },
    });
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("服务器地址");
    });

    expect(wrapper.text()).toContain("服务器地址");
    expect(wrapper.text()).toContain("你的 WebDAV");

    await wrapper.get('[aria-label="同步协议"] button:nth-child(2)').trigger("click");
    expect(wrapper.text()).toContain("使用 FTPS (TLS)");
    expect(wrapper.text()).toContain("你的 FTP");

    await wrapper.get('[aria-label="同步协议"] button:nth-child(3)').trigger("click");
    expect(wrapper.text()).toContain("私钥路径（可选）");
    expect(wrapper.text()).toContain("你的 SFTP");

    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("error")?.[0]).toEqual(["请完整填写主机、远端同步目录和用户名。"]);
  });
});
