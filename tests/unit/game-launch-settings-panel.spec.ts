import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GameLaunchSettingsPanel from "@/features/settings/GameLaunchSettingsPanel.vue";

const getSettings = vi.fn(async () => ({ launcherPath: "" }));
const detectLauncher = vi.fn(async () => ({
  launcherPath: "C:\\Program Files\\HoYoPlay\\HoYoPlay.exe",
  source: "常见安装目录",
}));
const pickLauncher = vi.fn(async () => null);
const saveSettings = vi.fn(async (settings: unknown) => settings);

vi.mock("@/shared/api/game-launch", () => ({
  gameLaunchApi: {
    getSettings: () => getSettings(),
    detectLauncher: () => detectLauncher(),
    pickLauncher: () => pickLauncher(),
    saveSettings: (settings: unknown) => saveSettings(settings),
  },
}));

describe("GameLaunchSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses detected launcher path and saves it", async () => {
    const wrapper = mount(GameLaunchSettingsPanel, { props: { busy: false } });
    await vi.waitFor(() => expect(getSettings).toHaveBeenCalled());

    await wrapper.get("button").trigger("click");
    expect((wrapper.get("input").element as HTMLInputElement).value).toContain("HoYoPlay.exe");
    expect(wrapper.emitted("notice")?.[0]?.[0]).toContain("常见安装目录");

    await wrapper.get("button:last-of-type").trigger("click");
    expect(saveSettings).toHaveBeenCalledWith({
      launcherPath: "C:\\Program Files\\HoYoPlay\\HoYoPlay.exe",
    });
  });

  it("requires a launcher before saving", async () => {
    const wrapper = mount(GameLaunchSettingsPanel, { props: { busy: false } });
    await vi.waitFor(() => expect(getSettings).toHaveBeenCalled());

    await wrapper.get("button:last-of-type").trigger("click");
    expect(wrapper.emitted("error")?.[0]?.[0]).toContain("启动器");
    expect(saveSettings).not.toHaveBeenCalled();
  });
});
