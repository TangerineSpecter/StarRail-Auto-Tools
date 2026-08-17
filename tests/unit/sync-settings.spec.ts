import { describe, expect, it } from "vitest";
import {
  emptySyncSettings,
  mergeSyncSettings,
  protocolLabel,
  validateSyncSettings,
} from "@/features/settings/sync-settings";
import type { SyncSettings } from "@/types";

describe("sync-settings", () => {
  it("treats historical webDav tags as webdav", () => {
    const merged = mergeSyncSettings({
      protocol: "webDav" as SyncSettings["protocol"],
      webdav: {
        serverUrl: "https://dav.example.com",
        remotePath: "/StarRailTools/",
        username: "user",
        password: "secret",
      },
    });
    expect(merged.protocol).toBe("webdav");
    expect(merged.webdav.serverUrl).toBe("https://dav.example.com");
  });

  it("keeps other protocol fields when merging a partial payload", () => {
    const merged = mergeSyncSettings({
      protocol: "sftp",
      ftp: {
        host: "nas.local",
        port: 2121,
        remotePath: "",
        username: "",
        password: "",
        secure: true,
      },
    });
    expect(merged.protocol).toBe("sftp");
    expect(merged.ftp.host).toBe("nas.local");
    expect(merged.ftp.port).toBe(2121);
    expect(merged.ftp.secure).toBe(true);
    expect(merged.webdav.serverUrl).toBe("");
    expect(merged.sftp.port).toBe(22);
  });

  it("validates webdav fields without changing the original message", () => {
    const settings = emptySyncSettings();
    expect(validateSyncSettings(settings)).toBe(
      "请完整填写服务器地址、远端同步目录、用户名和密码。",
    );
    settings.webdav = {
      serverUrl: "https://dav.example.com",
      remotePath: "StarRailTools",
      username: "user",
      password: "secret",
    };
    expect(validateSyncSettings(settings)).toBe("远端同步目录必须以 / 开头。");
    settings.webdav.remotePath = "/StarRailTools/";
    expect(validateSyncSettings(settings)).toBe("");
  });

  it("requires ftp credentials and a safe path", () => {
    const settings = emptySyncSettings();
    settings.protocol = "ftp";
    expect(validateSyncSettings(settings)).toBe("请完整填写主机、远端同步目录、用户名和密码。");
    settings.ftp = {
      host: "ftp.example.com",
      port: 0,
      remotePath: "/backups",
      username: "user",
      password: "secret",
      secure: false,
    };
    expect(validateSyncSettings(settings)).toBe("端口必须在 1 到 65535 之间。");
    settings.ftp.port = 21;
    settings.ftp.remotePath = "../etc";
    expect(validateSyncSettings(settings)).toBe("远端同步目录不合法。");
    settings.ftp.remotePath = "/backups";
    expect(validateSyncSettings(settings)).toBe("");
  });

  it("allows sftp private-key auth without a password", () => {
    const settings = emptySyncSettings();
    settings.protocol = "sftp";
    settings.sftp = {
      host: "sftp.example.com",
      port: 22,
      remotePath: "/backups",
      username: "user",
      password: "",
      privateKeyPath: "",
    };
    expect(validateSyncSettings(settings)).toBe("请填写密码，或提供 SFTP 私钥路径。");
    settings.sftp.privateKeyPath = "/tmp/id_ed25519";
    expect(validateSyncSettings(settings)).toBe("");
    expect(protocolLabel("sftp")).toBe("SFTP");
  });
});
