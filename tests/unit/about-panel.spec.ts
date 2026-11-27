import { flushPromises, mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AboutPanel from "@/features/about/AboutPanel.vue";
import { APP_VERSION, PROJECT_RELEASES_URL, PROJECT_URL } from "@/shared/app-info";
import { diagnosticsApi, type DiagnosticLogStatus } from "@/shared/api/diagnostics";
import type { AppUpdate, AppUpdateDownloadProgress } from "@/shared/api/updater";
import type { AppUpdaterContext, AppUpdaterStatus } from "@/shared/contracts/updater";
import { formatDiagnosticBytes, frontendDiagnostics } from "@/shared/diagnostics/frontend";
import { openExternalUrl } from "@/shared/utils/open-external-url";

vi.mock("@/shared/utils/open-external-url", () => ({ openExternalUrl: vi.fn() }));
vi.mock("@/shared/api/diagnostics", () => ({
  diagnosticsApi: {
    getStatus: vi.fn(),
    clear: vi.fn(),
    export: vi.fn(),
  },
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
    frontendDiagnostics.clear();
    vi.mocked(diagnosticsApi.getStatus).mockResolvedValue({ backendBytes: 0 });
    vi.mocked(diagnosticsApi.clear).mockResolvedValue({ backendBytes: 0 });
    vi.mocked(diagnosticsApi.export).mockResolvedValue(null);
  });

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

  it("displays current diagnostic log size, clears logs, and disables cleanup when empty", async () => {
    frontendDiagnostics.record("info", "diagnostics", "sample frontend entry");
    const frontendSize = frontendDiagnostics.byteLength();
    const backendSize = 2048;
    vi.mocked(diagnosticsApi.getStatus).mockResolvedValue({ backendBytes: backendSize });
    vi.mocked(diagnosticsApi.clear).mockResolvedValue({ backendBytes: 0 });

    const wrapper = mount(AboutPanel, {
      props: { protocolVersion: "reliquary-v25.0.0 / HSR-4.7" },
    });
    await flushPromises();

    expect(wrapper.find(".diagnostic-size-badge").text()).toContain("当前大小");
    expect(wrapper.find(".diagnostic-size-badge").text()).toContain(
      formatDiagnosticBytes(frontendSize + backendSize),
    );
    expect(wrapper.find(".diagnostic-size-detail").text()).toContain(
      `前端 ${formatDiagnosticBytes(frontendSize)} · 后端 ${formatDiagnosticBytes(backendSize)}`,
    );

    const clearButton = wrapper
      .findAll(".diagnostic-card button")
      .find((button) => button.text().includes("清理日志"));
    expect(clearButton).toBeDefined();
    expect((clearButton!.element as HTMLButtonElement).disabled).toBe(false);

    await clearButton!.trigger("click");
    await flushPromises();

    expect(diagnosticsApi.clear).toHaveBeenCalledTimes(1);
    expect(frontendDiagnostics.byteLength()).toBe(0);
    expect(wrapper.find(".diagnostic-size-badge").text()).toContain("0 B");
    expect(wrapper.find(".diagnostic-card [role='status']").text()).toContain("已清理分析日志");
    expect((clearButton!.element as HTMLButtonElement).disabled).toBe(true);
  });

  it("ignores stale status responses after cleanup and reports cleanup errors", async () => {
    let resolveStatus!: (status: DiagnosticLogStatus) => void;
    vi.mocked(diagnosticsApi.getStatus).mockImplementation(
      () =>
        new Promise<DiagnosticLogStatus>((resolve) => {
          resolveStatus = resolve;
        }),
    );
    frontendDiagnostics.record("warn", "diagnostics", "pending frontend entry");

    const wrapper = mount(AboutPanel, {
      props: { protocolVersion: "reliquary-v25.0.0 / HSR-4.7" },
    });

    const clearButton = wrapper
      .findAll(".diagnostic-card button")
      .find((button) => button.text().includes("清理日志"));
    await clearButton!.trigger("click");
    await flushPromises();

    resolveStatus({ backendBytes: 4096 });
    await flushPromises();

    expect(wrapper.find(".diagnostic-size-badge").text()).toContain("0 B");

    frontendDiagnostics.record("error", "diagnostics", "new failure");
    vi.mocked(diagnosticsApi.getStatus).mockResolvedValue({ backendBytes: 128 });
    vi.mocked(diagnosticsApi.export).mockResolvedValue("/tmp/diag.json");
    const exportButton = wrapper
      .findAll(".diagnostic-card button")
      .find((button) => button.text().includes("导出分析日志"));
    await exportButton!.trigger("click");
    await flushPromises();
    expect(wrapper.find(".diagnostic-card [role='status']").text()).toContain("/tmp/diag.json");

    vi.mocked(diagnosticsApi.clear).mockRejectedValue(new Error("permission denied"));
    await clearButton!.trigger("click");
    await flushPromises();
    expect(wrapper.find(".diagnostic-card [role='status']").text()).toContain(
      "分析日志清理失败：Error: permission denied",
    );
  });
});
