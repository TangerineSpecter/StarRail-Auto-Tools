import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileData } from "@/mobile/useMobileData";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/shared/api/sync", () => ({
  syncApi: {
    getSettings: mocks.getSettings,
    saveSettings: mocks.saveSettings,
    download: mocks.download,
  },
}));

beforeEach(() => vi.resetAllMocks());

describe("mobile sync data", () => {
  it("downloads only using WebDAV and stops on a conflict", async () => {
    mocks.getSettings.mockResolvedValue({
      protocol: "ftp",
      webdav: {
        serverUrl: "https://example.com",
        remotePath: "/data",
        username: "user",
        password: "pass",
      },
      ftp: {},
      sftp: {},
    });
    mocks.download.mockResolvedValue({
      status: "conflict",
      localGeneratedAt: 1,
      remoteGeneratedAt: 2,
      remoteRevision: "rev",
    });
    const data = useMobileData();
    await data.loadSettings();
    expect(await data.download()).toBe(false);
    expect(mocks.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: "webdav" }),
    );
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(data.error.value).toContain("停止下载");
  });
});
