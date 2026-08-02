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

  it("includes the about page and emits its view id", async () => {
    const wrapper = mount(AppNavigation, {
      props: {
        activeView: "capture",
        summary: {
          relics: 0,
          lightCones: 0,
          characters: 0,
          lastSyncAt: null,
          protocolVersion: "v",
        },
      },
    });

    const aboutButton = wrapper.findAll("button").find((button) => button.text().includes("关于"));
    expect(aboutButton?.text()).toContain("ABOUT PROJECT");
    await aboutButton?.trigger("click");
    expect(wrapper.emitted("update:activeView")?.[0]).toEqual(["about"]);
  });

  it("places software settings immediately before about", () => {
    const wrapper = mount(AppNavigation, {
      props: {
        activeView: "capture",
        summary: {
          relics: 0,
          lightCones: 0,
          characters: 0,
          lastSyncAt: null,
          protocolVersion: "v",
        },
      },
    });
    const labels = wrapper.findAll("button").map((button) => button.text());
    expect(labels.findIndex((label) => label.includes("软件设置"))).toBe(
      labels.findIndex((label) => label.includes("关于")) - 1,
    );
  });
});
