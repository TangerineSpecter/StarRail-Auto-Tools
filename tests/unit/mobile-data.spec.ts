import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileData } from "@/mobile/useMobileData";

const mocks = vi.hoisted(() => ({
  listCharacters: vi.fn(),
  listRelics: vi.fn(),
  listLightCones: vi.fn(),
  listTeams: vi.fn(),
  dashboard: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/shared/api/inventory", () => ({
  inventoryApi: {
    listCharacters: mocks.listCharacters,
    listRelics: mocks.listRelics,
    listLightCones: mocks.listLightCones,
  },
}));
vi.mock("@/shared/api/team", () => ({ teamApi: { list: mocks.listTeams } }));
vi.mock("@/shared/api/build-plan", () => ({ buildPlanApi: { dashboard: mocks.dashboard } }));
vi.mock("@/shared/api/sync", () => ({
  syncApi: {
    getSettings: mocks.getSettings,
    saveSettings: mocks.saveSettings,
    download: mocks.download,
  },
}));

beforeEach(() => vi.resetAllMocks());

describe("mobile read-only data", () => {
  it("does not let an older response overwrite a newly selected category", async () => {
    let finish!: (value: unknown) => void;
    mocks.listCharacters.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    mocks.listRelics.mockResolvedValue({ items: [{ itemId: 1, name: "遗器" }], total: 1 });
    const data = useMobileData();
    const old = data.load("character", "");
    await data.load("relic", "");
    finish({ items: [{ characterId: 2, name: "角色" }], total: 1 });
    await old;
    expect(data.items.value).toEqual([{ itemId: 1, name: "遗器" }]);
  });

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
