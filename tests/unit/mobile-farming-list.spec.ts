import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MobileFarmingList from "@/features/catalogue/MobileFarmingList.vue";
import type { RelicSetFarmingItem } from "@/features/catalogue/relic-farming-score";

const unused: RelicSetFarmingItem = {
  set: {
    id: 301,
    name: "太空封印站",
    kind: "planar",
    effects: { twoPiece: "攻击力提高12%。", fourPiece: "" },
    image: null,
  },
  priorityScore: 100,
  targetCount: 0,
  currentQualityPct: 0,
  expectedPieceCount: 0,
  equippedPieceCount: 0,
  opportunityPct: 0,
};
const props = { items: [unused], kindLabel: "位面饰品", loading: false, error: "" };
describe("mobile farming priorities", () => {
  it("distinguishes unassigned sets from real farming recommendations", () => {
    const wrapper = mount(MobileFarmingList, { props });
    expect(wrapper.get(".mobile-farming-item").text()).toContain("未设置培养目标");
    expect(wrapper.get(".mobile-farming-item").text()).not.toContain("0/0");
    expect(wrapper.find(".mobile-farming-track").exists()).toBe(false);
    expect(wrapper.get(".mobile-farming-score").text()).toContain("100.0");
  });
  it("keeps target evidence and opens the correct set", async () => {
    const wrapper = mount(MobileFarmingList, {
      props: {
        ...props,
        items: [
          {
            ...unused,
            targetCount: 3,
            priorityScore: 25,
            currentQualityPct: 35,
            expectedPieceCount: 6,
            equippedPieceCount: 4,
            opportunityPct: 75,
          },
        ],
      },
    });
    const row = wrapper.get(".mobile-farming-item");
    expect(row.text()).toContain("3 名目标");
    expect(row.text()).toContain("质量 35.0%");
    expect(row.text()).toContain("覆盖 4/6 件");
    await row.trigger("click");
    expect(wrapper.emitted("select")).toEqual([[unused.set]]);
  });
  it("shows loading, errors with retry, and empty data distinctly", async () => {
    const wrapper = mount(MobileFarmingList, { props: { ...props, loading: true } });
    expect(wrapper.get('[role="status"]').text()).toContain("正在评估");
    expect(wrapper.find(".mobile-farming-list").exists()).toBe(false);
    await wrapper.setProps({ loading: false, error: "读取失败" });
    await wrapper.get(".mobile-farming-state button").trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
    await wrapper.setProps({ error: "", items: [] });
    expect(wrapper.get(".mobile-farming-state").text()).toContain("暂无套装数据");
  });
});
