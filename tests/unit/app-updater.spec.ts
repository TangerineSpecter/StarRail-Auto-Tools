import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppUpdater } from "@/app/composables/useAppUpdater";
import { PROJECT_RELEASES_URL } from "@/shared/app-info";
import {
  checkForAppUpdate,
  formatUpdateBytes,
  formatUpdateError,
  type AppUpdate,
  type AppUpdateDownloadProgress,
} from "@/shared/api/updater";
import { describeDownloadProgress, type AppUpdaterContext } from "@/shared/contracts/updater";
import { check as tauriCheck } from "@tauri-apps/plugin-updater";
import { openExternalUrl } from "@/shared/utils/open-external-url";

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("@/shared/utils/open-external-url", () => ({
  openExternalUrl: vi.fn(),
}));

const mockedCheck = vi.mocked(tauriCheck);
const mockedOpenExternalUrl = vi.mocked(openExternalUrl);

function setTauriRuntime(enabled: boolean) {
  if (enabled) {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
      writable: true,
    });
  } else {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mountUpdater() {
  let context!: AppUpdaterContext;
  const Host = defineComponent({
    setup() {
      context = useAppUpdater();
      return () => null;
    },
  });
  const wrapper = mount(Host);
  return { wrapper, context };
}

describe("updater helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setTauriRuntime(true);
  });

  afterEach(() => {
    setTauriRuntime(false);
  });

  it("formats byte sizes and download progress descriptions", () => {
    expect(formatUpdateBytes(0)).toBe("0 B");
    expect(formatUpdateBytes(512)).toBe("512 B");
    expect(formatUpdateBytes(2048)).toBe("2 KB");
    expect(formatUpdateBytes(15 * 1024 * 1024)).toBe("15.0 MB");

    expect(
      describeDownloadProgress({
        phase: "downloading",
        downloadedBytes: 5 * 1024 * 1024,
        totalBytes: 10 * 1024 * 1024,
        percent: 50,
      }),
    ).toBe("正在下载 50%（5.0 MB / 10.0 MB）");
    expect(
      describeDownloadProgress({
        phase: "installing",
        downloadedBytes: 10 * 1024 * 1024,
        totalBytes: 10 * 1024 * 1024,
        percent: 100,
      }),
    ).toBe("下载完成，正在启动安装程序…");
  });

  it("translates common updater failures into actionable messages", () => {
    expect(formatUpdateError(new Error("updater.check not allowed"))).toContain("缺少更新权限");
    expect(formatUpdateError(new Error("plugin:updater not found"))).toContain("开发构建");
    expect(formatUpdateError(new Error("minisign signature verify failed"))).toContain("签名校验");
    expect(formatUpdateError(new Error("error sending request: timed out"))).toContain("网络");
  });

  it("reports download progress events from plugin-updater", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const downloadAndInstall = vi.fn().mockImplementation(async (onEvent) => {
      onEvent?.({ event: "Started", data: { contentLength: 1000 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 400 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 600 } });
      onEvent?.({ event: "Finished" });
    });
    mockedCheck.mockResolvedValue({
      version: "1.0.14",
      body: "修复自动更新权限",
      downloadAndInstall,
      close,
    } as never);

    const update = await checkForAppUpdate();
    expect(update).not.toBeNull();
    expect(update?.version).toBe("1.0.14");

    const snapshots: AppUpdateDownloadProgress[] = [];
    await update?.install((progress) => snapshots.push(progress));

    expect(snapshots).toEqual([
      { phase: "started", downloadedBytes: 0, totalBytes: 1000, percent: 0 },
      { phase: "downloading", downloadedBytes: 400, totalBytes: 1000, percent: 40 },
      { phase: "downloading", downloadedBytes: 1000, totalBytes: 1000, percent: 100 },
      { phase: "installing", downloadedBytes: 1000, totalBytes: 1000, percent: 100 },
    ]);

    await update?.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("returns null outside Tauri runtime", async () => {
    setTauriRuntime(false);
    await expect(checkForAppUpdate()).resolves.toBeNull();
    expect(mockedCheck).not.toHaveBeenCalled();
  });
});

describe("useAppUpdater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setTauriRuntime(true);
  });

  afterEach(() => {
    setTauriRuntime(false);
  });

  it("stays quiet when startup silent check fails and surfaces errors on manual check", async () => {
    mockedCheck.mockRejectedValueOnce(new Error("connect timeout"));
    const { wrapper, context } = mountUpdater();
    await flushPromises();

    expect(context.status.value).toBe("idle");
    expect(context.errorMessage.value).toBe("");

    mockedCheck.mockRejectedValueOnce(new Error("connect timeout"));
    await context.checkForUpdates({ silent: false });

    expect(context.status.value).toBe("error");
    expect(context.errorMessage.value).toContain("连接 GitHub 更新服务失败");
    wrapper.unmount();
  });

  it("tracks download progress, recovers from install failure, and opens manual releases", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    let attempts = 0;
    const downloadAndInstall = vi.fn().mockImplementation(async (onEvent) => {
      attempts += 1;
      onEvent?.({ event: "Started", data: { contentLength: 200 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 100 } });
      if (attempts === 1) {
        throw new Error("network reset");
      }
      onEvent?.({ event: "Progress", data: { chunkLength: 100 } });
      onEvent?.({ event: "Finished" });
    });

    mockedCheck.mockResolvedValueOnce({
      version: "1.0.14",
      body: "更新说明",
      downloadAndInstall,
      close,
    } as never);

    const { wrapper, context } = mountUpdater();
    await flushPromises();

    expect(context.status.value).toBe("available");
    expect(context.update.value?.version).toBe("1.0.14");

    await context.installAvailableUpdate();
    expect(context.status.value).toBe("error");
    expect(context.isInstalling.value).toBe(false);
    expect(context.errorMessage.value).toContain("连接 GitHub 更新服务失败");

    await context.installAvailableUpdate();
    expect(context.status.value).toBe("installing");
    expect(context.progress.value?.percent).toBe(100);

    await context.openManualDownload();
    expect(mockedOpenExternalUrl).toHaveBeenCalledWith(PROJECT_RELEASES_URL);

    wrapper.unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("ignores stale out-of-order check responses and closes replaced update handles", async () => {
    const firstDeferred = createDeferred<unknown>();
    const secondDeferred = createDeferred<unknown>();
    const staleClose = vi.fn().mockResolvedValue(undefined);
    const freshClose = vi.fn().mockResolvedValue(undefined);

    mockedCheck
      .mockReturnValueOnce(firstDeferred.promise as Promise<never>)
      .mockReturnValueOnce(secondDeferred.promise as Promise<never>);

    const { wrapper, context } = mountUpdater();
    const secondCheck = context.checkForUpdates({ silent: false });

    secondDeferred.resolve({
      version: "1.0.15",
      body: "最新",
      downloadAndInstall: vi.fn(),
      close: freshClose,
    });
    await secondCheck;
    expect(context.update.value?.version).toBe("1.0.15");

    firstDeferred.resolve({
      version: "1.0.14",
      body: "旧响应",
      downloadAndInstall: vi.fn(),
      close: staleClose,
    });
    await flushPromises();

    expect(context.update.value?.version).toBe("1.0.15");
    expect(staleClose).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    expect(freshClose).toHaveBeenCalledTimes(1);
  });

  it("reports up-to-date when no newer release is published", async () => {
    mockedCheck.mockResolvedValueOnce(null);
    const { wrapper, context } = mountUpdater();
    await flushPromises();

    expect(context.status.value).toBe("up-to-date");
    expect(context.update.value).toBeNull();
    expect(context.lastCheckedAt.value).not.toBeNull();
    wrapper.unmount();
  });

  it("keeps AppUpdate type contract compatible for callers", () => {
    const dummy: AppUpdate = {
      version: "1.0.14",
      notes: null,
      install: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    expect(dummy.version).toBe("1.0.14");
  });
});
