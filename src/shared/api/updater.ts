import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

export type AppUpdateDownloadPhase = "started" | "downloading" | "installing";

export interface AppUpdateDownloadProgress {
  phase: AppUpdateDownloadPhase;
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

export interface AppUpdate {
  version: string;
  notes: string | null;
  install: (onProgress?: (progress: AppUpdateDownloadProgress) => void) => Promise<void>;
  close: () => Promise<void>;
}

export interface AppUpdateCheckOptions {
  timeout?: number;
}

const DEFAULT_CHECK_TIMEOUT_MS = 15_000;

export function isUpdaterRuntimeSupported(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function formatUpdateBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = unitIndex >= 2 ? 1 : 0;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

export function formatUpdateError(cause: unknown): string {
  const raw =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : String(cause ?? "");
  const normalized = raw.trim();
  const lower = normalized.toLowerCase();

  if (lower.includes("not allowed") || lower.includes("permission") || lower.includes("acl")) {
    return "当前客户端缺少更新权限，请前往 GitHub Release 手动下载最新版覆盖安装。";
  }

  if (
    lower.includes("plugin:updater") ||
    (lower.includes("updater") && lower.includes("not found")) ||
    lower.includes("no endpoints") ||
    lower.includes("pubkey")
  ) {
    return "当前运行的是开发构建或未启用自动更新的本地包，请通过正式安装包使用应用内更新。";
  }

  if (lower.includes("signature") || lower.includes("minisign") || lower.includes("verify")) {
    return "安装包签名校验未通过，为保证安全已中止更新，请前往 GitHub Release 手动下载。";
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("error sending request") ||
    lower.includes("connect") ||
    lower.includes("dns") ||
    lower.includes("network") ||
    lower.includes("404") ||
    lower.includes("502") ||
    lower.includes("503")
  ) {
    return "连接 GitHub 更新服务失败，请检查网络或系统代理后重试，也可前往 GitHub Release 手动下载。";
  }

  if (!normalized) {
    return "更新过程出现未知错误，请重试或前往 GitHub Release 手动下载。";
  }

  const concise = normalized.length > 160 ? `${normalized.slice(0, 160)}…` : normalized;
  return `更新失败：${concise}`;
}

export async function checkForAppUpdate(
  options: AppUpdateCheckOptions = {},
): Promise<AppUpdate | null> {
  if (!isUpdaterRuntimeSupported()) return null;

  const update = await check({
    timeout: options.timeout ?? DEFAULT_CHECK_TIMEOUT_MS,
  });
  if (!update) return null;

  return {
    version: update.version,
    notes: update.body ?? null,
    install: (onProgress) => installUpdate(update, onProgress),
    close: () => (typeof update.close === "function" ? update.close() : Promise.resolve()),
  };
}

async function installUpdate(
  update: Update,
  onProgress?: (progress: AppUpdateDownloadProgress) => void,
) {
  let totalBytes: number | null = null;
  let downloadedBytes = 0;

  await update.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === "Started") {
      totalBytes =
        typeof event.data.contentLength === "number" && event.data.contentLength > 0
          ? event.data.contentLength
          : null;
      downloadedBytes = 0;
      onProgress?.({
        phase: "started",
        downloadedBytes,
        totalBytes,
        percent: totalBytes ? 0 : null,
      });
      return;
    }

    if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
      const percent = totalBytes
        ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
        : null;
      onProgress?.({
        phase: "downloading",
        downloadedBytes,
        totalBytes,
        percent,
      });
      return;
    }

    if (event.event === "Finished") {
      onProgress?.({
        phase: "installing",
        downloadedBytes: totalBytes ?? downloadedBytes,
        totalBytes,
        percent: 100,
      });
    }
  });
}
