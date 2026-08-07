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

  it("shows unconfigured-slot context for selectable slots and emits the selected relic", async () => {
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
    // Backend always injects fixed Head/Hands targets when plans exist; Body still unconfigured.
    scanRelicsByMainStat.mockResolvedValue({
      items: [
        {
          itemId: 7,
          setId: 101,
          name: "测试遗器",
          setName: "测试套装",
          slot: "Body",
          rarity: 5,
          level: 15,
          mainStat: "DEF%",
          mainStatValue: 50,
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
      allowedMainStats: { Head: ["HP"], Hands: ["ATK"] },
    });
    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined },
      global: { stubs: { Button: buttonStub } },
    });
    await flushPromises();
    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("尚未设置目标主词条");
    expect(wrapper.text()).toContain("躯干");
    await wrapper.find(".scanner-item").trigger("click");
    expect(wrapper.emitted("open-relic")?.[0][0]).toMatchObject({ itemId: 7 });
  });

  it("shows fixed Head target labels when scan includes fixed allowed mains", async () => {
    relicMainStatScanPlanCount.mockResolvedValue(1);
    scanRelicsByMainStat.mockResolvedValue({
      items: [
        {
          itemId: 9,
          setId: 101,
          name: "错误头",
          setName: "测试套装",
          // Synthetic mismatch display path (backend would not return normal HP heads).
          slot: "Head",
          rarity: 5,
          level: 0,
          mainStat: "ATK",
          mainStatValue: 1,
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
      allowedMainStats: { Head: ["HP"], Hands: ["ATK"] },
    });
    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined },
      global: { stubs: { Button: buttonStub } },
    });
    await flushPromises();
    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("尚未设置目标主词条");
    expect(wrapper.text()).toContain("生命值");
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

