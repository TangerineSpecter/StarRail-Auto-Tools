import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import AboutPanel from "@/features/about/AboutPanel.vue";
import { APP_VERSION, PROJECT_RELEASES_URL, PROJECT_URL } from "@/shared/app-info";
import type { AppUpdate, AppUpdateDownloadProgress } from "@/shared/api/updater";
import type { AppUpdaterContext, AppUpdaterStatus } from "@/shared/contracts/updater";
import { openExternalUrl } from "@/shared/utils/open-external-url";

vi.mock("@/shared/utils/open-external-url", () => ({ openExternalUrl: vi.fn() }));

function createMockUpdater(initial?: {
  status?: AppUpdaterStatus;
  update?: AppUpdate | null;
  progress?: AppUpdateDownloadProgress | null;
  errorMessage?: string;
}): AppUpdaterContext {
  const status = ref<AppUpdaterStatus>(initial?.status ?? "idle");
  const update = ref<AppUpdate | null>(initial?.update ?? null);
  const progress = ref<AppUpdateDownloadProgress | null>(initial?.progress ?? null);
  const errorMessage = ref(initial?.errorMessage ?? "");
  const lastCheckedAt = ref<string | null>(null);

  return {
    status,
    update,
    progress,
    errorMessage,
    lastCheckedAt,
    isChecking: computed(() => status.value === "checking"),
    isInstalling: computed(() => status.value === "downloading" || status.value === "installing"),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    installAvailableUpdate: vi.fn().mockResolvedValue(undefined),
    openManualDownload: vi.fn().mockResolvedValue(undefined),
  };
}

describe("AboutPanel", () => {
  it("shows product details and opens the repository in the default browser", async () => {
    const wrapper = mount(AboutPanel, {
      props: { protocolVersion: "reliquary-v25.0.0 / HSR-4.7" },
    });

    expect(wrapper.text()).toContain("星穹铁道工具箱");
    expect(wrapper.text()).toContain("VERSION");
    expect(wrapper.text()).toContain(`v${APP_VERSION}`);
    expect(wrapper.find(".game-version-label").text()).toContain("星穹铁道 4.7");
    expect(wrapper.find(".game-version-label").text()).toContain("WINDOWS");
    expect(wrapper.text()).toContain("GitHub");
    expect(wrapper.text()).not.toContain(PROJECT_URL);

    await wrapper.find(".github-tag").trigger("click");
    expect(openExternalUrl).toHaveBeenCalledWith(PROJECT_URL);

    const manualDownloadBtn = wrapper
      .findAll(".update-card button")
      .find((button) => button.text().includes("手动下载"));
    expect(manualDownloadBtn).toBeDefined();
    await manualDownloadBtn!.trigger("click");
    expect(openExternalUrl).toHaveBeenCalledWith(PROJECT_RELEASES_URL);
  });

  it("does not claim support for a game version absent from the runtime protocol", () => {
    const wrapper = mount(AboutPanel, { props: { protocolVersion: "unknown" } });

    expect(wrapper.find(".game-version-label").text()).toContain("未知");
  });

  it("supports manual update checks, install trigger, progress display, and error fallback", async () => {
    const updater = createMockUpdater();
    const wrapper = mount(AboutPanel, {
      props: { protocolVersion: "reliquary-v25.0.0 / HSR-4.7", updater },
    });

    const checkButton = wrapper
      .findAll(".update-card button")
      .find((button) => button.text().includes("检查更新"));
    expect(checkButton).toBeDefined();
    await checkButton!.trigger("click");
    expect(updater.checkForUpdates).toHaveBeenCalledWith({ silent: false });

    updater.update.value = {
      version: "1.0.14",
      notes: "修复自动更新权限",
      install: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    updater.status.value = "available";
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("NEW v1.0.14");
    expect(wrapper.text()).toContain("修复自动更新权限");

    const installButton = wrapper
      .findAll(".update-card button")
      .find((button) => button.text().includes("立即更新"));
    expect(installButton).toBeDefined();
    await installButton!.trigger("click");
    expect(updater.installAvailableUpdate).toHaveBeenCalledTimes(1);

    updater.status.value = "downloading";
    updater.progress.value = {
      phase: "downloading",
      downloadedBytes: 5 * 1024 * 1024,
      totalBytes: 10 * 1024 * 1024,
      percent: 50,
    };
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("正在下载 50%");

    updater.status.value = "error";
    updater.progress.value = null;
    updater.errorMessage.value = "连接 GitHub 更新服务失败";
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("连接 GitHub 更新服务失败");
    expect(wrapper.text()).toContain("重试更新");

    const manualButton = wrapper
      .findAll(".update-card button")
      .find((button) => button.text().includes("手动下载"));
    await manualButton!.trigger("click");
    expect(updater.openManualDownload).toHaveBeenCalledTimes(1);
  });
});
