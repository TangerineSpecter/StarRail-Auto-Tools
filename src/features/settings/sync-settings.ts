import type { SyncProtocol, SyncSettings } from "@/types";

export const SYNC_PROTOCOLS: Array<{ id: SyncProtocol; label: string }> = [
  { id: "webdav", label: "WebDAV" },
  { id: "ftp", label: "FTP" },
  { id: "sftp", label: "SFTP" },
];

export function emptySyncSettings(): SyncSettings {
  return {
    protocol: "webdav",
    webdav: { serverUrl: "", remotePath: "", username: "", password: "" },
    ftp: { host: "", port: 21, remotePath: "", username: "", password: "", secure: false },
    sftp: { host: "", port: 22, remotePath: "", username: "", password: "", privateKeyPath: "" },
  };
}

function normalizeProtocol(value?: string | null): SyncProtocol {
  if (value === "ftp" || value === "sftp" || value === "webdav") return value;
  return "webdav";
}

export function mergeSyncSettings(value?: Partial<SyncSettings> | null): SyncSettings {
  const base = emptySyncSettings();
  if (!value) return base;
  return {
    protocol: normalizeProtocol(value.protocol),
    webdav: { ...base.webdav, ...value.webdav },
    ftp: { ...base.ftp, ...value.ftp },
    sftp: { ...base.sftp, ...value.sftp },
  };
}

export function protocolLabel(protocol: SyncProtocol): string {
  return SYNC_PROTOCOLS.find((item) => item.id === protocol)?.label ?? "WebDAV";
}

function isUnsafeRemotePath(path: string): boolean {
  return path.includes("..") || path.includes("\\");
}

function validatePort(port: number): string {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "端口必须在 1 到 65535 之间。";
  return "";
}

export function validateSyncSettings(settings: SyncSettings): string {
  if (settings.protocol === "webdav") {
    const { serverUrl, remotePath, username, password } = settings.webdav;
    if (!serverUrl.trim() || !remotePath.trim() || !username.trim() || !password) {
      return "请完整填写服务器地址、远端同步目录、用户名和密码。";
    }
    if (!remotePath.trim().startsWith("/")) return "远端同步目录必须以 / 开头。";
    if (isUnsafeRemotePath(remotePath.trim())) return "远端同步目录不合法。";
    return "";
  }

  if (settings.protocol === "ftp") {
    const { host, port, remotePath, username, password } = settings.ftp;
    if (!host.trim() || !remotePath.trim() || !username.trim() || !password) {
      return "请完整填写主机、远端同步目录、用户名和密码。";
    }
    const portError = validatePort(port);
    if (portError) return portError;
    if (isUnsafeRemotePath(remotePath.trim())) return "远端同步目录不合法。";
    return "";
  }

  const { host, port, remotePath, username, password, privateKeyPath } = settings.sftp;
  if (!host.trim() || !remotePath.trim() || !username.trim()) {
    return "请完整填写主机、远端同步目录和用户名。";
  }
  if (!password && !privateKeyPath.trim()) return "请填写密码，或提供 SFTP 私钥路径。";
  const portError = validatePort(port);
  if (portError) return portError;
  if (isUnsafeRemotePath(remotePath.trim())) return "远端同步目录不合法。";
  return "";
}
