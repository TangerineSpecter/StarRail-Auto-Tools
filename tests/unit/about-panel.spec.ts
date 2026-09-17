import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AboutPanel from "@/features/about/AboutPanel.vue";
import { APP_VERSION, PROJECT_URL } from "@/shared/app-info";
import { openExternalUrl } from "@/shared/utils/open-external-url";

vi.mock("@/shared/utils/open-external-url", () => ({ openExternalUrl: vi.fn() }));

describe("AboutPanel", () => {
  it("shows product details and opens the repository in the default browser", async () => {
    const wrapper = mount(AboutPanel, {
      props: { protocolVersion: "reliquary-v23.0.0 / HSR-4.5" },
    });

    expect(wrapper.text()).toContain("星穹铁道工具箱");
    expect(wrapper.text()).toContain("VERSION");
    expect(wrapper.text()).toContain(`v${APP_VERSION}`);
    expect(wrapper.find(".game-version-label").text()).toContain("星穹铁道 4.5");
    expect(wrapper.find(".game-version-label").text()).toContain("WINDOWS");
    expect(wrapper.text()).toContain("GitHub");
    expect(wrapper.text()).not.toContain(PROJECT_URL);

    await wrapper.find(".github-tag").trigger("click");
    expect(openExternalUrl).toHaveBeenCalledWith(PROJECT_URL);
  });

  it("does not claim support for a game version absent from the runtime protocol", () => {
    const wrapper = mount(AboutPanel, { props: { protocolVersion: "unknown" } });

    expect(wrapper.find(".game-version-label").text()).toContain("未知");
  });
});
