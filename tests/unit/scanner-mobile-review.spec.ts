import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ScannerFilterButton from "@/features/relic-scanner/ScannerFilterButton.vue";
import MainStatReviewCards from "@/features/relic-scanner/MainStatReviewCards.vue";
import { emptyScanReviewFilters } from "@/features/relic-scanner/scan-review";

const drawer = {
  props: { visible: Boolean, position: String, blockScroll: Boolean },
  template:
    '<div v-if="visible" role="dialog"><slot name="header"/><slot/><slot name="footer"/></div>',
};

describe("mobile scan review", () => {
  it("stages all filters, discards closed drafts, and applies/reset only on view results", async () => {
    const wrapper = mount(ScannerFilterButton, {
      props: {
        filters: emptyScanReviewFilters(),
        total: 8,
        cavernCount: 5,
        planarCount: 3,
        disabled: false,
      },
      global: { stubs: { Drawer: drawer } },
    });
    const open = () => wrapper.get(".scanner-filter-button").trigger("click");
    await open();
    expect(wrapper.getComponent(drawer).props()).toMatchObject({
      position: "bottom",
      blockScroll: true,
    });
    await wrapper.get('input[type="search"]').setValue("猎人");
    await wrapper
      .findAll(".scanner-filter-options button")
      .find((b) => b.text().includes("位面饰品"))!
      .trigger("click");
    expect(wrapper.emitted("apply")).toBeUndefined();
    await wrapper.get(".scanner-filter-heading button").trigger("click");
    await open();
    expect(wrapper.get("input").element.value).toBe("");
    await wrapper.get("input").setValue("  猎人  ");
    await wrapper
      .findAll(".scanner-filter-options button")
      .find((b) => b.text() === "躯干")!
      .trigger("click");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("apply")?.[0]).toEqual([
      { category: "all", slot: "Body", search: "猎人" },
    ]);
    await wrapper.setProps({ filters: { category: "all", slot: "Body", search: "猎人" } });
    expect(wrapper.get(".scanner-filter-button").attributes("aria-label")).toContain("2 项");
    await open();
    await wrapper.get('.scanner-filter-actions button[type="button"]').trigger("click");
    expect(wrapper.emitted("apply")).toHaveLength(1);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("apply")?.[1]).toEqual([emptyScanReviewFilters()]);
  });

  it("preserves every part and stat and supports button/keyboard paging and filter resets", async () => {
    const scrollTo = vi.fn();
    const groups = [
      {
        setId: 101,
        setName: "猎人",
        groupTotal: 3,
        isPlanar: false,
        parts: [
          {
            slot: "Body",
            stats: [
              { mainStat: "DEF%", count: 2 },
              { mainStat: "HP%", count: 1 },
            ],
          },
        ],
      },
      {
        setId: 301,
        setName: "位面套装",
        groupTotal: 1,
        isPlanar: true,
        parts: [{ slot: "LinkRope", stats: [{ mainStat: "ATK%", count: 1 }] }],
      },
    ];
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    let resized: () => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const wrapper = mount(MainStatReviewCards, { props: { groups } });
    const track = wrapper.get(".scanner-review-track");
    let width = 300;
    Object.defineProperty(track.element, "clientWidth", { get: () => width });
    Object.defineProperty(track.element, "scrollTo", { value: scrollTo });
    wrapper.findAll(".scanner-review-slide").forEach((slide, index) => {
      vi.spyOn(slide.element, "getBoundingClientRect").mockImplementation(
        () => ({ left: 300 * index }) as DOMRect,
      );
    });
    expect(wrapper.text()).toContain("防御百分比");
    expect(wrapper.text()).toContain("生命百分比");
    expect(wrapper.text()).toContain("连结绳");
    resized();
    scrollTo.mockClear();
    expect(wrapper.get('[aria-label="上一套遗器"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[aria-label="下一套遗器"]').trigger("click");
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: "instant" });
    await track.trigger("keydown", { key: "ArrowRight" });
    expect(scrollTo).toHaveBeenCalledTimes(2);
    vi.spyOn(track.element, "getBoundingClientRect").mockImplementation(
      () => ({ left: 300 }) as DOMRect,
    );
    await track.trigger("scroll");
    expect(wrapper.text()).toContain("2 / 2");
    expect(wrapper.get('[aria-label="下一套遗器"]').attributes("disabled")).toBeDefined();
    width = 0;
    resized();
    await track.trigger("scroll");
    expect(wrapper.text()).toContain("2 / 2");
    width = 240;
    resized();
    expect(wrapper.text()).toContain("2 / 2");
    await wrapper.setProps({ groups: [groups[0]!] });
    await flushPromises();
    expect(wrapper.text()).toContain("1 / 1");
    expect(wrapper.text()).toContain("按套装查看");
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "instant" });
    wrapper.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
