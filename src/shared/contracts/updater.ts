import { inject, type ComputedRef, type InjectionKey, type Ref } from "vue";
import {
  formatUpdateBytes,
  type AppUpdate,
  type AppUpdateDownloadProgress,
} from "@/shared/api/updater";

export type AppUpdaterStatus =
  "idle" | "checking" | "available" | "up-to-date" | "downloading" | "installing" | "error";

export interface AppUpdaterContext {
  status: Ref<AppUpdaterStatus>;
  update: Ref<AppUpdate | null>;
  progress: Ref<AppUpdateDownloadProgress | null>;
  errorMessage: Ref<string>;
  lastCheckedAt: Ref<string | null>;
  isChecking: ComputedRef<boolean>;
  isInstalling: ComputedRef<boolean>;
  checkForUpdates: (options?: { silent?: boolean }) => Promise<void>;
  installAvailableUpdate: () => Promise<void>;
  openManualDownload: () => Promise<void>;
}

export const appUpdaterContextKey: InjectionKey<AppUpdaterContext> = Symbol("app-updater-context");

export function useAppUpdaterContext(): AppUpdaterContext | null {
  return inject(appUpdaterContextKey, null);
}

export function describeDownloadProgress(progress: AppUpdateDownloadProgress | null): string {
  if (!progress) return "正在准备下载更新…";
  if (progress.phase === "installing") {
    return "下载完成，正在启动安装程序…";
  }
  if (progress.totalBytes && progress.percent !== null) {
    return `正在下载 ${progress.percent}%（${formatUpdateBytes(progress.downloadedBytes)} / ${formatUpdateBytes(progress.totalBytes)}）`;
  }
  if (progress.downloadedBytes > 0) {
    return `正在下载更新（已下载 ${formatUpdateBytes(progress.downloadedBytes)}）`;
  }
  return "正在连接下载服务器…";
}
