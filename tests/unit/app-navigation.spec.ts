import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppNavigation from "@/app/AppNavigation.vue";

describe("AppNavigation", () => {
  it("emits the selected page and shows inventory counts", async () => {
    const wrapper = mount(AppNavigation, {
      props: {
        activeView: "capture",
        summary: {
          relics: 3,
          lightCones: 2,
          characters: 1,
          lastSyncAt: null,
          protocolVersion: "v",
        },
      },
    });
    await wrapper.findAll("button")[1].trigger("click");
    expect(wrapper.emitted("update:activeView")?.[0]).toEqual(["archive"]);
    expect(wrapper.text()).toContain("遗器 3");
  });
});
