import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileSync from "@/mobile/MobileSync.vue";
import { syncApi } from "@/shared/api/sync";
import { inventoryApi } from "@/shared/api/inventory";
import { emptySyncSettings } from "@/features/settings/sync-settings";

vi.mock("@/shared/api/sync", () => ({
  syncApi: {
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
    download: vi.fn(),
  },
}));

vi.mock("@/shared/api/inventory", () => ({
  inventoryApi: {
    summary: vi.fn(),
  },
}));

describe("MobileSync.vue", () => {
  const baseSettings = {
    ...emptySyncSettings(),
    protocol: "webdav" as const,
    webdav: {
      serverUrl: "https://nas.example.com",
      remotePath: "/StarRailTools/",
      username: "astral_traveler",
      password: "secret_password",
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(syncApi.getSettings).mockResolvedValue(structuredClone(baseSettings));
    vi.mocked(syncApi.saveSettings).mockResolvedValue(undefined);
    vi.mocked(syncApi.download).mockResolvedValue({
      status: "completed",
      summary: {
        relics: 120,
        lightCones: 30,
        characters: 15,
        teams: 4,
        lastSyncAt: 1700000000000,
        protocolVersion: "1.0",
      },
    });
    vi.mocked(inventoryApi.summary).mockResolvedValue({
      relics: 120,
      lightCones: 30,
      characters: 15,
      teams: 4,
      lastSyncAt: 1700000000000,
      protocolVersion: "1.0",
    });
  });

  it("renders connection status, server information and summary metrics", async () => {
    const wrapper = mount(MobileSync);
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("数据同步站");
      expect(wrapper.text()).toContain("准备就绪");
      expect(wrapper.text()).toContain("15 角色 · 120 遗器 · 30 光锥");
    });
    expect(wrapper.find("#sync-server-url").exists()).toBe(true);
    expect((wrapper.find("#sync-server-url").element as HTMLInputElement).value).toBe(
      "https://nas.example.com",
    );
  });

  it("toggles password visibility between password and text", async () => {
    const wrapper = mount(MobileSync);
    await vi.waitFor(() => {
      expect(wrapper.find("#sync-password").exists()).toBe(true);
    });
    const pwdInput = wrapper.find("#sync-password");
    expect(pwdInput.attributes("type")).toBe("password");

    const toggleBtn = wrapper.find(".password-eye-btn");
    await toggleBtn.trigger("click");
    expect(pwdInput.attributes("type")).toBe("text");

    await toggleBtn.trigger("click");
    expect(pwdInput.attributes("type")).toBe("password");
  });

  it("opens and closes help guide drawer", async () => {
    const wrapper = mount(MobileSync, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    });

    const helpBtn = wrapper.find(".help-toggle-btn");
    await helpBtn.trigger("click");
    expect(wrapper.text()).toContain("使用指南与说明");

    const closeBtn = wrapper.find(".sheet-close-btn");
    await closeBtn.trigger("click");
    const drawer = wrapper.findComponent({ name: "Drawer" });
    expect(drawer.props("visible")).toBe(false);
  });

  it("triggers download and emits synced on successful sync", async () => {
    const wrapper = mount(MobileSync);
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("准备就绪");
    });

    const downloadBtn = wrapper.find(".sync-action-btn.primary");
    await downloadBtn.trigger("click");
    await vi.waitFor(() => {
      expect(syncApi.download).toHaveBeenCalled();
      expect(wrapper.emitted("synced")).toBeTruthy();
      expect(wrapper.text()).toContain("同步完成");
    });
  });
});
