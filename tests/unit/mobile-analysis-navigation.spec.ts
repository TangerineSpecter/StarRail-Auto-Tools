import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import MobileApp from "@/mobile/MobileApp.vue";

vi.mock("@/shared/api/inventory", () => ({
  inventoryApi: { summary: vi.fn().mockResolvedValue({ relics: 0, characters: 0, lightCones: 0 }) },
}));

describe("mobile analysis navigation", () => {
  it("replaces Teams with Analysis and keeps all five destinations reachable", async () => {
    const wrapper = mount(MobileApp, {
      global: {
        plugins: [createPinia()],
        stubs: {
          MobileInventoryPage: {
            template:
              '<div class="inventory-stub"><div class="mobile-inventory-toolbar"><slot name="toolbar-actions" /></div></div>',
          },
          MobileAnalysisPage: {
            template: '<div class="analysis-stub">主属性扫描 · 替换推荐扫描</div>',
          },
          CataloguePage: { template: '<div class="catalogue-stub" />' },
          BuildDashboard: { template: '<div class="build-stub" />' },
          MobileSync: { template: '<div class="sync-stub" />' },
          MobileDevDataSwitch: {
            template: '<button class="mobile-dev-data-switch">示例数据</button>',
          },
        },
      },
    });
    await flushPromises();
    expect(wrapper.find(".mobile-header").exists()).toBe(false);
    expect(wrapper.get(".mobile-page-title").text()).toBe("背包");
    expect(wrapper.get(".mobile-nav-brand img").attributes("alt")).toBe("星穹数据航站");
    expect(wrapper.find(".mobile-inventory-toolbar .mobile-dev-data-switch").exists()).toBe(true);
    const buttons = wrapper.findAll(".mobile-nav button");
    expect(buttons.map((button) => button.text())).toEqual([
      "背包",
      "图鉴",
      "毕业",
      "分析",
      "同步",
    ]);
    for (const [index, selector] of [
      ".inventory-stub",
      ".catalogue-stub",
      ".build-stub",
      ".analysis-stub",
      ".sync-stub",
    ].entries()) {
      await buttons[index]!.trigger("click");
      await flushPromises();
      expect(wrapper.find(selector).exists()).toBe(true);
      expect(buttons[index]!.attributes("aria-current")).toBe("page");
    }
    await buttons[3]!.trigger("click");
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("分析");
    expect(wrapper.text()).not.toContain("搜索配队");
    wrapper.unmount();
  });
});
