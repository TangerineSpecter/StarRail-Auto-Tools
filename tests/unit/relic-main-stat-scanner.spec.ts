import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RelicMainStatScanner from "@/features/relic-scanner/RelicMainStatScanner.vue";

const {
  relicMainStatScanPlanCount,
  scanRelicsByMainStat,
  scanRelicsByMainStatGrouped,
  listRelics,
  dashboard,
} = vi.hoisted(() => ({
  relicMainStatScanPlanCount: vi.fn(),
  scanRelicsByMainStat: vi.fn(),
  scanRelicsByMainStatGrouped: vi.fn(),
  listRelics: vi.fn(),
  dashboard: vi.fn(),
}));

vi.mock("@/shared/api/inventory", () => ({
  inventoryApi: {
    relicMainStatScanPlanCount,
    scanRelicsByMainStat,
    scanRelicsByMainStatGrouped,
    listRelics,
  },
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
    scanRelicsByMainStatGrouped.mockReset();
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

  it("shows grouped relics dashboard with slot and main stat cards upon scanning", async () => {
    relicMainStatScanPlanCount.mockResolvedValue(1);
    dashboard.mockResolvedValue([
      {
        plan: {
          characterId: 1,
          cavernMode: "fourPiece",
          cavernSetA: 101,
          cavernSetB: null,
          planarSetId: 301,
          mainStats: {},
          targets: [],
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
    scanRelicsByMainStatGrouped.mockResolvedValue({
      groups: [
        {
          setId: 101,
          setName: "密林卧雪的猎人",
          parts: [
            {
              slot: "Body",
              stats: [{ mainStat: "Outgoing Healing Boost", count: 1 }],
            },
          ],
        },
      ],
      total: 1,
      planCount: 1,
      allowedMainStats: { Head: ["HP"], Hands: ["ATK"] },
    });
    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined },
      global: { stubs: { Button: buttonStub } },
    });
    await flushPromises();
    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("件待复核");
    expect(wrapper.text()).toContain("密林卧雪的猎人");
    expect(wrapper.text()).toContain("躯干");
    expect(wrapper.text()).toContain("治疗量加成");
  });

  it("supports filtering set search and slot segments in main stat scan", async () => {
    relicMainStatScanPlanCount.mockResolvedValue(1);
    scanRelicsByMainStatGrouped.mockResolvedValue({
      groups: [
        {
          setId: 101,
          setName: "密林卧雪的猎人",
          parts: [
            {
              slot: "Body",
              stats: [{ mainStat: "Outgoing Healing Boost", count: 1 }],
            },
          ],
        },
        {
          setId: 301,
          setName: "繁星璀璨的天才",
          parts: [
            {
              slot: "Feet",
              stats: [{ mainStat: "HP%", count: 2 }],
            },
          ],
        },
      ],
      total: 3,
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

    expect(wrapper.text()).toContain("密林卧雪的猎人");
    expect(wrapper.text()).toContain("繁星璀璨的天才");

    // Search filter test
    const searchInput = wrapper.find(".search-input");
    await searchInput.setValue("猎人");
    await flushPromises();

    expect(wrapper.text()).toContain("密林卧雪的猎人");
    expect(wrapper.text()).not.toContain("繁星璀璨的天才");
  });

  it("renders redesigned upgrade recommendation cards with main stat, target character and roll increase", async () => {
    relicMainStatScanPlanCount.mockResolvedValue(1);
    dashboard.mockResolvedValue([
      {
        plan: {
          characterId: 1001,
          cavernMode: "fourPiece",
          cavernSetA: 101,
          cavernSetB: null,
          planarSetId: 301,
          mainStats: { Head: ["HP"], LinkRope: ["Energy Regeneration Rate"] },
          targets: [],
          effectiveSubstats: ["CRIT Rate", "CRIT DMG", "SPD"],
          note: "",
          substatWeights: { "CRIT Rate": 1, "CRIT DMG": 1, SPD: 1 },
          minPotentialPct: 40,
          spdTarget: 0,
        },
        character: { characterId: 1001, name: "三月七", level: 80, ascension: 6, equippedRelics: [] },
        displayOrder: 0,
        pinned: false,
      },
    ]);
    listRelics.mockResolvedValue({
      items: [
        {
          itemId: 88,
          setId: 101,
          name: "测试头部",
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
          substats: [{ key: "CRIT Rate", stat: "CRIT Rate", value: 2.9, count: 1, step: 0 }],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 200,
    });

    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined },
      global: { stubs: { Button: buttonStub } },
    });
    await flushPromises();

    const buttons = wrapper.findAll("button");
    const usefulnessBtn = buttons.find((b) => b.text().includes("替换推荐扫描"));
    expect(usefulnessBtn).toBeDefined();
    await usefulnessBtn!.trigger("click");
    await flushPromises();

    expect(wrapper.find(".upgrade-card").exists()).toBe(true);
    expect(wrapper.text()).toContain("替换推荐");
    expect(wrapper.text()).toContain("头部");
    expect(wrapper.text()).toContain("测试套装");
    expect(wrapper.text()).toContain("生命值");
    expect(wrapper.text()).toContain("三月七");
    expect(wrapper.text()).toContain("rolls");
  });
});

