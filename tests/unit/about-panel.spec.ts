import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AboutPanel from "@/features/about/AboutPanel.vue";
import { PROJECT_URL } from "@/shared/app-info";
import { openExternalUrl } from "@/shared/utils/open-external-url";

vi.mock("@/shared/utils/open-external-url", () => ({ openExternalUrl: vi.fn() }));

describe("AboutPanel", () => {
  it("shows product details and opens the repository in the default browser", async () => {
    const wrapper = mount(AboutPanel);

    expect(wrapper.text()).toContain("星穹铁道工具箱");
    expect(wrapper.text()).toContain("VERSION");
    expect(wrapper.text()).toContain("v1.0.0");
    expect(wrapper.text()).toContain("GitHub");
    expect(wrapper.text()).not.toContain(PROJECT_URL);

    await wrapper.find(".github-tag").trigger("click");
    expect(openExternalUrl).toHaveBeenCalledWith(PROJECT_URL);
  });
});
