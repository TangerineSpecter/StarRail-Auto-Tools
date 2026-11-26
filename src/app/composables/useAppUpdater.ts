import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { PROJECT_RELEASES_URL } from "@/shared/app-info";
import {
  checkForAppUpdate,
  formatUpdateError,
  isUpdaterRuntimeSupported,
  type AppUpdate,
  type AppUpdateDownloadProgress,
} from "@/shared/api/updater";
import type { AppUpdaterContext, AppUpdaterStatus } from "@/shared/contracts/updater";
import { frontendDiagnostics } from "@/shared/diagnostics/frontend";
import { openExternalUrl } from "@/shared/utils/open-external-url";

export function useAppUpdater(): AppUpdaterContext {
  const status = ref<AppUpdaterStatus>("idle");
  const update = ref<AppUpdate | null>(null);
  const progress = ref<AppUpdateDownloadProgress | null>(null);
  const errorMessage = ref("");
  const lastCheckedAt = ref<string | null>(null);

  const isChecking = computed(() => status.value === "checking");
  const isInstalling = computed(
    () => status.value === "downloading" || status.value === "installing",
  );

  let checkRequestSeq = 0;
  let disposed = false;

  function replaceUpdate(next: AppUpdate | null) {
    const previous = update.value;
    update.value = next;
    if (previous && previous !== next) {
      void previous.close().catch(() => undefined);
    }
  }

  async function checkForUpdates(options: { silent?: boolean } = {}) {
    const silent = options.silent ?? false;
    if (isInstalling.value) return;

    if (!isUpdaterRuntimeSupported()) {
      if (!silent) {
        status.value = "error";
        errorMessage.value = "当前为浏览器预览环境，无法在应用内检查桌面端更新。";
      }
      return;
    }

    const reqId = ++checkRequestSeq;
    status.value = "checking";
    if (!silent) {
      errorMessage.value = "";
      progress.value = null;
    }

    try {
      const availableUpdate = await checkForAppUpdate();
      if (disposed || reqId !== checkRequestSeq) {
        if (availableUpdate) void availableUpdate.close().catch(() => undefined);
        return;
      }

      lastCheckedAt.value = new Date().toISOString();
      if (availableUpdate) {
        replaceUpdate(availableUpdate);
        status.value = "available";
        errorMessage.value = "";
        frontendDiagnostics.record(
          "info",
          "updater",
          `update available: v${availableUpdate.version}`,
        );
      } else {
        replaceUpdate(null);
        status.value = "up-to-date";
        errorMessage.value = "";
        frontendDiagnostics.record("info", "updater", "application is up to date");
      }
    } catch (cause) {
      if (disposed || reqId !== checkRequestSeq) return;
      frontendDiagnostics.record("warn", "updater", `check failed: ${String(cause)}`);
      if (silent) {
        status.value = update.value ? "available" : "idle";
      } else {
        status.value = "error";
        errorMessage.value = formatUpdateError(cause);
      }
    }
  }

  async function installAvailableUpdate() {
    const target = update.value;
    if (!target || isInstalling.value) return;

    status.value = "downloading";
    errorMessage.value = "";
    progress.value = {
      phase: "started",
      downloadedBytes: 0,
      totalBytes: null,
      percent: null,
    };
    frontendDiagnostics.record("info", "updater", `installing update: v${target.version}`);

    try {
      await target.install((nextProgress) => {
        if (disposed) return;
        progress.value = nextProgress;
        status.value = nextProgress.phase === "installing" ? "installing" : "downloading";
      });
      if (!disposed) {
        status.value = "installing";
      }
    } catch (cause) {
      if (disposed) return;
      frontendDiagnostics.record("error", "updater", `install failed: ${String(cause)}`);
      progress.value = null;
      status.value = "error";
      errorMessage.value = formatUpdateError(cause);
    }
  }

  async function openManualDownload() {
    try {
      await openExternalUrl(PROJECT_RELEASES_URL);
    } catch (cause) {
      frontendDiagnostics.record("error", "updater", `open releases failed: ${String(cause)}`);
    }
  }

  onMounted(() => {
    void checkForUpdates({ silent: true });
  });

  onBeforeUnmount(() => {
    disposed = true;
    replaceUpdate(null);
  });

  return {
    status,
    update,
    progress,
    errorMessage,
    lastCheckedAt,
    isChecking,
    isInstalling,
    checkForUpdates,
    installAvailableUpdate,
    openManualDownload,
  };
}
