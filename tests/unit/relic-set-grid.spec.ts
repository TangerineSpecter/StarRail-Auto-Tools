import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import RelicSetGrid from "@/features/catalogue/RelicSetGrid.vue";
import type { RelicSetCatalogueEntry } from "@/types";

const { relicSetTargetCounts } = vi.hoisted(() => ({
  relicSetTargetCounts: vi.fn(),
}));

vi.mock("@/shared/api/build-plan", () => ({
  buildPlanApi: { relicSetTargetCounts },
}));

const cavern: RelicSetCatalogueEntry = {
  id: 101,
  name: "云无留迹的过客",
  kind: "cavern",
  effects: { twoPiece: "治疗量提高 10%。", fourPiece: "释放战技或终结技时回复生命。" },
  image: null,
};
const planar: RelicSetCatalogueEntry = {
  id: 301,
  name: "太空封印站",
  kind: "planar",
  effects: { twoPiece: "攻击力提高 12%。", fourPiece: "" },
  image: null,
};

const chartSets: RelicSetCatalogueEntry[] = [
  { ...cavern, id: 101, name: "遗器套装 A" },
  { ...cavern, id: 102, name: "遗器套装 B" },
  { ...cavern, id: 103, name: "遗器套装 C" },
];
const planarChartSets: RelicSetCatalogueEntry[] = [
  { ...planar, id: 301, name: "饰品套装 A" },
  { ...planar, id: 302, name: "饰品套装 B" },
];

describe("RelicSetGrid", () => {
  it("shows owned relic counts and hides set ids", () => {
    const wrapper = mount(RelicSetGrid, {
      props: {
        sets: [cavern, planar],
        ownedCounts: new Map([
          [101, 8],
          [301, 0],
        ]),
      },
    });

    expect(wrapper.text()).toContain("持有 8 件");
    expect(wrapper.text()).toContain("未持有");
    expect(wrapper.text()).toContain("云无留迹的过客");
    expect(wrapper.text()).toContain("太空封印站");
    expect(wrapper.text()).not.toContain("#101");
    expect(wrapper.text()).not.toContain("#301");
    expect(wrapper.text()).not.toMatch(/#\d+/);
    expect(wrapper.findAll(".catalogue-card-media .catalogue-owned")).toHaveLength(2);
    expect(wrapper.get(".catalogue-card-media .catalogue-owned").classes()).not.toContain("empty");
    expect(wrapper.get(".catalogue-card-media .catalogue-owned b").text()).toBe("8");
    expect(wrapper.findAll(".catalogue-owned.empty")).toHaveLength(1);
  });

  it("switches to a descending target-count chart and keeps rows clickable", async () => {
    relicSetTargetCounts.mockResolvedValueOnce([
      { setId: 102, count: 1 },
      { setId: 101, count: 3 },
    ]);
    const wrapper = mount(RelicSetGrid, {
      props: { sets: chartSets, ownedCounts: new Map() },
    });

    await wrapper.get(".relic-view-switch button:last-child").trigger("click");
    await flushPromises();

    const rows = wrapper.findAll(".relic-target-bar-row");
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.find(".relic-target-bar-name").text())).toEqual([
      "遗器套装 A",
      "遗器套装 B",
      "遗器套装 C",
    ]);
    expect(rows[0].find(".relic-target-bar-count").text()).toContain("3");

    await rows[0].trigger("click");
    expect(wrapper.emitted("select")?.[0]?.[0]).toMatchObject({ id: 101 });

    await wrapper.get(".relic-view-switch button:first-child").trigger("click");
    expect(wrapper.find(".catalogue-grid").exists()).toBe(true);
  });

  it("shows a recoverable error when target counts cannot be loaded", async () => {
    relicSetTargetCounts.mockRejectedValueOnce(new Error("统计读取失败"));
    const wrapper = mount(RelicSetGrid, {
      props: { sets: chartSets, ownedCounts: new Map() },
    });

    await wrapper.get(".relic-view-switch button:last-child").trigger("click");
    await flushPromises();

    expect(wrapper.find(".relic-target-chart-state.error").text()).toContain("统计读取失败");
  });

  it("uses the same chart for planar ornaments", async () => {
    relicSetTargetCounts.mockResolvedValueOnce([{ setId: 302, count: 2 }]);
    const wrapper = mount(RelicSetGrid, {
      props: { sets: planarChartSets, ownedCounts: new Map() },
    });

    await wrapper.get(".relic-view-switch button:last-child").trigger("click");
    await flushPromises();

    expect(wrapper.get(".relic-view-switch").attributes("aria-label")).toBe("位面饰品展示方式");
    expect(wrapper.get(".relic-target-chart-heading h3").text()).toContain("位面饰品");
    expect(wrapper.findAll(".relic-target-bar-row")[0].find(".relic-target-bar-name").text()).toBe(
      "饰品套装 B",
    );
  });
});
