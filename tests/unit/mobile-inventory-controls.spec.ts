import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import MobileInventoryControls from "@/features/inventory/MobileInventoryControls.vue";

const create = (search = "") =>
  mount(MobileInventoryControls, {
    props: { kind: "relic", total: 12, activeFilterCount: 0, hasFilters: false, search },
  });
afterEach(() => vi.useRealTimers());
describe("mobile inventory direct search", () => {
  it("moves one persistent indicator to the selected category", async () => {
    const wrapper = create();
    const indicator = wrapper.get(".mobile-inventory-category-indicator").element;
    expect(wrapper.get("nav").attributes("style")).toContain("--inventory-category-index: 0");
    await wrapper.setProps({ kind: "character" });
    expect(wrapper.get("nav").attributes("style")).toContain("--inventory-category-index: 2");
    expect(wrapper.get(".mobile-inventory-category-indicator").element).toBe(indicator);
    await wrapper.setProps({ hideCategories: true });
    expect(wrapper.find("nav").exists()).toBe(false);
    expect(wrapper.find('input[type="search"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("coalesces typing and lets the keyboard submit immediately", async () => {
    vi.useFakeTimers();
    const wrapper = create();
    await wrapper.get("input").setValue("翔");
    await vi.advanceTimersByTimeAsync(150);
    await wrapper.get("input").setValue("翔鹰");
    await vi.advanceTimersByTimeAsync(250);
    expect(wrapper.emitted("search")).toBeUndefined();
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("search")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(400);
    expect(wrapper.emitted("search")).toHaveLength(1);
    wrapper.unmount();
  });
  it("waits for Chinese composition to finish before searching", async () => {
    vi.useFakeTimers();
    const wrapper = create();
    const input = wrapper.get("input");
    await input.trigger("compositionstart");
    await input.setValue("xiang");
    await vi.advanceTimersByTimeAsync(500);
    expect(wrapper.emitted("search")).toBeUndefined();
    await input.setValue("翔鹰");
    await input.trigger("compositionend");
    await vi.advanceTimersByTimeAsync(300);
    expect(wrapper.emitted("search")).toHaveLength(1);
    wrapper.unmount();
  });
  it("clears text immediately without a delayed duplicate request", async () => {
    vi.useFakeTimers();
    const wrapper = create("翔鹰");
    await wrapper.get('[aria-label="清空搜索"]').trigger("click");
    expect(wrapper.emitted("update:search")?.at(-1)).toEqual([""]);
    expect(wrapper.emitted("search")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(wrapper.emitted("search")).toHaveLength(1);
    wrapper.unmount();
  });
  it("cancels pending queries when changing category or unmounting", async () => {
    vi.useFakeTimers();
    const wrapper = create();
    await wrapper.get("input").setValue("翔鹰");
    await wrapper.findAll("nav button")[1]!.trigger("click");
    expect(wrapper.emitted("category")).toEqual([["lightCone"]]);
    await vi.advanceTimersByTimeAsync(500);
    expect(wrapper.emitted("search")).toBeUndefined();
    await wrapper.get("input").setValue("新查询");
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(500);
    expect(wrapper.emitted("search")).toBeUndefined();
  });
  it("shows active filter state and opens the filter panel", async () => {
    const wrapper = create();
    await wrapper.setProps({ activeFilterCount: 3, hasFilters: true });
    const filter = wrapper.get('[aria-label="筛选，已选 3 项条件"]');
    expect(filter.text()).toBe("3");
    await filter.trigger("click");
    expect(wrapper.emitted("filter")).toHaveLength(1);
    expect(wrapper.get('[role="status"]').text()).toContain("12 件遗器 · 筛选结果");
    wrapper.unmount();
  });
});
