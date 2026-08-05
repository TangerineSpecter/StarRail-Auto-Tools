import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RelicMainStatScanner from "@/features/relic-scanner/RelicMainStatScanner.vue";

const { relicMainStatScanPlanCount, scanRelicsByMainStat, listRelics, dashboard } = vi.hoisted(
  () => ({
    relicMainStatScanPlanCount: vi.fn(),
    scanRelicsByMainStat: vi.fn(),
    listRelics: vi.fn(),
    dashboard: vi.fn(),
  }),
);

vi.mock("@/shared/api/inventory", () => ({
  inventoryApi: { relicMainStatScanPlanCount, scanRelicsByMainStat, listRelics },
}));

vi.mock("@/shared/api/build-plan", () => ({
  buildPlanApi: { dashboard },
}));

const buttonStub = {
  emits: ["click"],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
};

describe("RelicMainStatScanner", () => {
  beforeEach(() => {
    relicMainStatScanPlanCount.mockReset();
    scanRelicsByMainStat.mockReset();
    listRelics.mockReset();
    dashboard.mockReset();
    dashboard.mockResolvedValue([]);
    listRelics.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 });
  });

  it("disables analysis when there are no saved build plans", async () => {
    relicMainStatScanPlanCount.mockResolvedValue(0);
    dashboard.mockResolvedValue([]);
    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined },
      global: { stubs: { Button: buttonStub } },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("请先在数据管理");
    expect(wrapper.find("button").attributes("disabled")).toBeDefined();
  });

  it("shows unconfigured-slot context and emits the selected relic", async () => {
    relicMainStatScanPlanCount.mockResolvedValue(1);
    dashboard.mockResolvedValue([
      {
        plan: {
          characterId: 1,
          cavernMode: "fourPiece",
          cavernSetA: 1,
          cavernSetB: null,
          planarSetId: 1,
          mainStats: {},
          targets: [{ statKey: "SPD", target: 134, minimum: 120, priority: 1 }],
          effectiveSubstats: [],
          note: "",
          substatWeights: {},
          minPotentialPct: 40,
          spdTarget: 0,
        },
        character: { characterId: 1, name: "测试", level: 80, ascension: 6 },
        displayOrder: 0,
        pinned: false,
      },
    ]);
    scanRelicsByMainStat.mockResolvedValue({
      items: [
        {
          itemId: 7,
          setId: 101,
          name: "测试遗器",
          setName: "测试套装",
          slot: "Head",
          rarity: 5,
          level: 15,
          mainStat: "HP",
          mainStatValue: 705,
          location: "",
          equippedCharacterId: null,
          locked: false,
          discard: false,
          source: "test",
          updatedAt: 0,
          substats: [],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      planCount: 1,
      allowedMainStats: {},
    });
    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined },
      global: { stubs: { Button: buttonStub } },
    });
    await flushPromises();
    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("尚未设置目标主词条");
    await wrapper.find(".scanner-item").trigger("click");
    expect(wrapper.emitted("open-relic")?.[0][0]).toMatchObject({ itemId: 7 });
  });
});
