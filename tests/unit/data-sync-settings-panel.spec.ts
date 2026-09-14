import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import DataSyncSettingsPanel from "@/features/settings/DataSyncSettingsPanel.vue";
import { emptySyncSettings } from "@/features/settings/sync-settings";
import { syncApi } from "@/shared/api/sync";
import type { SyncSettings } from "@/types";

vi.mock("@/shared/api/sync", () => ({
  syncApi: {
    getSettings: vi.fn(async () => emptySyncSettings()),
    saveSettings: vi.fn(async () => undefined),
    test: vi.fn(async () => undefined),
    upload: vi.fn(async () => ({ status: "completed" })),
    download: vi.fn(async () => ({ status: "completed", summary: {} })),
  },
}));

function validSettings(): SyncSettings {
  const settings = emptySyncSettings();
  settings.webdav = {
    serverUrl: "https://dav.example.com",
    remotePath: "/StarRailTools",
    username: "user",
    password: "secret",
  };
  return settings;
}

async function mountReadyPanel() {
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
  (wrapper.vm as unknown as { settings: SyncSettings }).settings = validSettings();
  return wrapper;
}

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

  it("asks before uploading over a newer remote snapshot", async () => {
    vi.mocked(syncApi.upload).mockResolvedValueOnce({
      status: "conflict",
      localGeneratedAt: 1_000,
      remoteGeneratedAt: 2_000,
      remoteRevision: "remote-v2",
    });
    const wrapper = await mountReadyPanel();

    await wrapper.get(".transfer-action.upload").trigger("click");
    await vi.waitFor(() => expect(wrapper.text()).toContain("远端数据已变化"));
    expect(syncApi.upload).toHaveBeenCalledWith(expect.anything(), undefined);

    await wrapper.get("button.confirm-download").trigger("click");
    await vi.waitFor(() =>
      expect(syncApi.upload).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ remoteRevision: "remote-v2" }),
      ),
    );
  });

  it("asks before downloading over newer local data", async () => {
    vi.mocked(syncApi.download).mockResolvedValueOnce({
      status: "conflict",
      localGeneratedAt: 2_000,
      remoteGeneratedAt: 1_000,
      remoteRevision: "remote-v1",
    });
    const wrapper = await mountReadyPanel();

    await wrapper.get(".transfer-action.download").trigger("click");
    await wrapper.get("button.confirm-download").trigger("click");
    await vi.waitFor(() => expect(wrapper.text()).toContain("本地数据有未同步修改"));
    expect(syncApi.download).toHaveBeenCalledWith(expect.anything(), undefined);

    await wrapper.get("button.confirm-download").trigger("click");
    await vi.waitFor(() =>
      expect(syncApi.download).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ remoteRevision: "remote-v1" }),
      ),
    );
  });
});
