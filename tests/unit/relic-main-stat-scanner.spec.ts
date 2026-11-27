import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RelicMainStatScanner from "@/features/relic-scanner/RelicMainStatScanner.vue";
import { mobileViewKey } from "@/shared/contracts/mobile-view";

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

const selectStub = {
  props: ["modelValue", "options", "optionLabel", "optionValue"],
  emits: ["update:modelValue"],
  template: `
    <select
      v-bind="$attrs"
      :value="modelValue"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option
        v-for="opt in options"
        :key="opt[optionValue ?? 'value']"
        :value="opt[optionValue ?? 'value']"
      >
        {{ opt[optionLabel ?? 'label'] }}
      </option>
    </select>
  `,
};

describe("RelicMainStatScanner", () => {
  beforeEach(() => {
    relicMainStatScanPlanCount.mockReset();
    scanRelicsByMainStat.mockReset();
    scanRelicsByMainStatGrouped.mockReset();
    listRelics.mockReset();
    dashboard.mockReset();
    dashboard.mockResolvedValue([]);
    scanRelicsByMainStatGrouped.mockResolvedValue({
      groups: [],
      total: 0,
      planCount: 0,
      allowedMainStats: {},
    });
    listRelics.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 });
  });

  it("directs mobile viewers to sync saved desktop plans when no plans are available", async () => {
    relicMainStatScanPlanCount.mockResolvedValue(0);
    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined },
      global: { provide: { [mobileViewKey as symbol]: true }, stubs: { Button: buttonStub } },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("电脑端保存培养方案");
    expect(wrapper.find(".scanner-desktop-actions").exists()).toBe(false);
    wrapper.unmount();
  });

  it("disables analysis when there are no saved build plans", async () => {
    relicMainStatScanPlanCount.mockResolvedValue(0);
    dashboard.mockResolvedValue([]);
    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined },
      global: { stubs: { Button: buttonStub, Select: selectStub } },
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
      global: { stubs: { Button: buttonStub, Select: selectStub } },
    });
    await flushPromises();

    expect(scanRelicsByMainStatGrouped).toHaveBeenCalledTimes(1);
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
      global: { stubs: { Button: buttonStub, Select: selectStub } },
    });
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
    scanRelicsByMainStatGrouped.mockResolvedValue({
      groups: [],
      total: 0,
      planCount: 1,
      allowedMainStats: {},
    });
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
        character: {
          characterId: 1001,
          name: "三月七",
          level: 80,
          ascension: 6,
          equippedRelics: [],
        },
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
          substats: [
            { key: "CRIT Rate", stat: "CRIT Rate", value: 2.9, count: 1, step: 0 },
            { key: "Effect RES", stat: "Effect RES", value: 4.3, count: 0, step: 0 },
          ],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 200,
    });

    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined },
      global: { stubs: { Button: buttonStub, Select: selectStub } },
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
    expect(wrapper.text()).toContain("效果抵抗");
    expect(wrapper.text()).not.toContain("Effect RES");
    expect(wrapper.text()).toContain("三月七");
    expect(wrapper.text()).toContain("rolls");
    expect(usefulnessBtn!.classes()).toContain("active");
    expect(usefulnessBtn!.attributes("aria-pressed")).toBe("true");

    const chips = wrapper.findAll(".substat-chip");
    expect(chips).toHaveLength(2);
    expect(chips[0].classes()).toContain("is-core");
    expect(chips[0].text()).toContain("暴击率");
    expect(chips[0].attributes("title")).toContain("有效词条");
    expect(chips[1].classes()).toContain("is-none");
    expect(chips[1].text()).toContain("效果抵抗");
    expect(chips[1].attributes("title")).toContain("非目标词条");
  });

  it("syncs active mode state, reuses cached scan results on tab switch, and rescans via action button", async () => {
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
        character: { characterId: 1, name: "测试", level: 80, ascension: 6, equippedRelics: [] },
        displayOrder: 0,
        pinned: false,
      },
    ]);
    scanRelicsByMainStatGrouped.mockResolvedValue({
      groups: [
        {
          setId: 101,
          setName: "密林卧雪的猎人",
          parts: [{ slot: "Body", stats: [{ mainStat: "HP%", count: 2 }] }],
        },
      ],
      total: 2,
      planCount: 1,
      allowedMainStats: {},
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined, desktopToolbarHost: host },
      global: { stubs: { Button: buttonStub, Select: selectStub } },
    });
    await flushPromises();

    const submodeButtons = host.querySelectorAll<HTMLButtonElement>(".submode-btn");
    const mainStatBtn = submodeButtons[0];
    const upgradeBtn = submodeButtons[1];
    const rescanBtn = host.querySelector<HTMLButtonElement>(".scanner-rescan-btn");
    expect(mainStatBtn).toBeDefined();
    expect(upgradeBtn).toBeDefined();
    expect(rescanBtn).toBeDefined();
    expect(mainStatBtn.classList.contains("active")).toBe(true);
    expect(upgradeBtn.classList.contains("active")).toBe(false);
    expect(scanRelicsByMainStatGrouped).toHaveBeenCalledTimes(1);
    expect(rescanBtn!.textContent).toContain("重新扫描");

    upgradeBtn.click();
    await flushPromises();
    expect(upgradeBtn.classList.contains("active")).toBe(true);
    expect(upgradeBtn.getAttribute("aria-pressed")).toBe("true");
    expect(mainStatBtn.classList.contains("active")).toBe(false);
    expect(listRelics).toHaveBeenCalledTimes(1);

    // Switching back to mainStat reuses cached results instead of triggering a redundant scan.
    mainStatBtn.click();
    await flushPromises();
    expect(mainStatBtn.classList.contains("active")).toBe(true);
    expect(scanRelicsByMainStatGrouped).toHaveBeenCalledTimes(1);

    // Explicit rescan button triggers a fresh scan.
    rescanBtn!.click();
    await flushPromises();
    expect(scanRelicsByMainStatGrouped).toHaveBeenCalledTimes(2);

    wrapper.unmount();
    host.remove();
  });

  it("fetches all pages of unequipped relics for upgrade recommendations and batches card rendering", async () => {
    relicMainStatScanPlanCount.mockResolvedValue(1);
    scanRelicsByMainStatGrouped.mockResolvedValue({
      groups: [],
      total: 0,
      planCount: 1,
      allowedMainStats: {},
    });
    dashboard.mockResolvedValue([
      {
        plan: {
          characterId: 1001,
          cavernMode: "fourPiece",
          cavernSetA: 101,
          cavernSetB: null,
          planarSetId: 301,
          mainStats: { Head: ["HP"] },
          targets: [],
          effectiveSubstats: ["CRIT Rate", "CRIT DMG"],
          note: "",
          substatWeights: { "CRIT Rate": 1, "CRIT DMG": 1 },
          minPotentialPct: 40,
          spdTarget: 0,
        },
        character: {
          characterId: 1001,
          name: "三月七",
          level: 80,
          ascension: 6,
          equippedRelics: [],
        },
        displayOrder: 0,
        pinned: false,
      },
    ]);

    const makeRelic = (itemId: number, critRate: number, level = 15) => ({
      itemId,
      setId: 101,
      name: `测试头部-${itemId}`,
      setName: "测试套装",
      slot: "Head",
      rarity: 5,
      level,
      mainStat: "HP",
      mainStatValue: 705,
      location: "",
      equippedCharacterId: null,
      locked: false,
      discard: false,
      source: "test",
      updatedAt: 0,
      substats: [{ key: "CRIT Rate", stat: "CRIT Rate", value: critRate, count: 1, step: 0 }],
    });

    const page1Items = [
      ...Array.from({ length: 40 }, (_, i) => makeRelic(i + 1, 2.9, 15)),
      makeRelic(999, 12.0, 0),
    ];
    const page2Items = Array.from({ length: 30 }, (_, i) => makeRelic(201 + i, 9.7, 15));
    listRelics.mockImplementation(async (filter: { page: number }) => {
      if (filter.page === 1) {
        return { items: page1Items, total: 230, page: 1, pageSize: 200 };
      }
      return { items: page2Items, total: 230, page: 2, pageSize: 200 };
    });

    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined },
      global: { stubs: { Button: buttonStub, Select: selectStub } },
    });
    await flushPromises();

    const upgradeBtn = wrapper.findAll("button").find((b) => b.text().includes("替换推荐扫描"));
    await upgradeBtn!.trigger("click");
    await flushPromises();

    expect(listRelics).toHaveBeenCalledTimes(2);
    expect(listRelics).toHaveBeenNthCalledWith(1, {
      page: 1,
      pageSize: 200,
      equipped: false,
      minLevel: 15,
    });
    expect(listRelics).toHaveBeenNthCalledWith(2, {
      page: 2,
      pageSize: 200,
      equipped: false,
      minLevel: 15,
    });
    expect(wrapper.text()).toContain("70 件可替换推荐");
    expect(wrapper.text()).toContain("已全量分析 70 件 +15 未装备");
    expect(wrapper.findAll(".upgrade-card")).toHaveLength(60);
    expect(wrapper.find(".upgrade-scroll-sentinel").exists()).toBe(true);

    const grid = wrapper.get(".scanner-upgrade-grid");
    Object.defineProperty(grid.element, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(grid.element, "clientHeight", { value: 600, configurable: true });
    Object.defineProperty(grid.element, "scrollTop", { value: 1200, configurable: true });
    await grid.trigger("scroll");
    await flushPromises();
    expect(wrapper.findAll(".upgrade-card")).toHaveLength(70);
    expect(wrapper.find(".upgrade-scroll-sentinel").exists()).toBe(false);
    wrapper.unmount();
  });

  it("filters upgrade recommendations by present characters and sets and toggles grade-first sorting", async () => {
    relicMainStatScanPlanCount.mockResolvedValue(2);
    scanRelicsByMainStatGrouped.mockResolvedValue({
      groups: [],
      total: 0,
      planCount: 2,
      allowedMainStats: {},
    });
    dashboard.mockResolvedValue([
      {
        plan: {
          characterId: 1001,
          cavernMode: "fourPiece",
          cavernSetA: 101,
          cavernSetB: null,
          planarSetId: 301,
          mainStats: { Head: ["HP"] },
          targets: [],
          effectiveSubstats: ["CRIT Rate", "CRIT DMG"],
          note: "",
          substatWeights: { "CRIT Rate": 1, "CRIT DMG": 1 },
          minPotentialPct: 40,
          spdTarget: 0,
        },
        character: {
          characterId: 1001,
          name: "三月七",
          level: 80,
          ascension: 6,
          equippedRelics: [
            {
              itemId: 500,
              setId: 101,
              slot: "Head",
              mainStat: "HP",
              substats: [{ key: "CRIT Rate", value: 17.4, count: 6, step: 0 }],
            },
          ],
        },
        displayOrder: 0,
        pinned: false,
      },
      {
        plan: {
          characterId: 1002,
          cavernMode: "fourPiece",
          cavernSetA: 102,
          cavernSetB: null,
          planarSetId: 301,
          mainStats: { Head: ["HP"] },
          targets: [],
          effectiveSubstats: ["CRIT Rate", "CRIT DMG"],
          note: "",
          substatWeights: { "CRIT Rate": 1, "CRIT DMG": 1 },
          minPotentialPct: 40,
          spdTarget: 0,
        },
        character: {
          characterId: 1002,
          name: "丹恒",
          level: 80,
          ascension: 6,
          equippedRelics: [],
        },
        displayOrder: 1,
        pinned: false,
      },
    ]);

    listRelics.mockResolvedValue({
      items: [
        // High grade (high rolls) for March 7th, but smaller delta (+1.6 vs equipped 3.2)
        {
          itemId: 701,
          setId: 101,
          name: "高评级头",
          setName: "套装甲",
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
          substats: [
            { key: "CRIT Rate", stat: "CRIT Rate", value: 14.5, count: 5, step: 8 },
            { key: "CRIT DMG", stat: "CRIT DMG", value: 12.9, count: 2, step: 2 },
          ],
        },
        // Lower grade for Dan Heng, but larger delta (+2.4 vs empty slot 0)
        {
          itemId: 702,
          setId: 102,
          name: "高增量头",
          setName: "套装乙",
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
          substats: [{ key: "CRIT Rate", stat: "CRIT Rate", value: 8.7, count: 3, step: 0 }],
        },
      ],
      total: 2,
      page: 1,
      pageSize: 200,
    });

    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined },
      global: { stubs: { Button: buttonStub, Select: selectStub } },
    });
    await flushPromises();

    const upgradeBtn = wrapper.findAll("button").find((b) => b.text().includes("替换推荐扫描"));
    await upgradeBtn!.trigger("click");
    await flushPromises();

    // Default sort: delta first -> Dan Heng's piece (套装乙) comes first.
    const cardsByDelta = wrapper.findAll(".upgrade-card");
    expect(cardsByDelta).toHaveLength(2);
    expect(cardsByDelta[0].text()).toContain("套装乙");
    expect(cardsByDelta[1].text()).toContain("套装甲");

    // Switch to grade-first -> March 7th's higher-grade piece (套装甲) comes first.
    const gradeSortBtn = wrapper
      .findAll(".upgrade-sort-btn")
      .find((b) => b.text().includes("评级优先"));
    expect(gradeSortBtn).toBeDefined();
    await gradeSortBtn!.trigger("click");
    await flushPromises();
    expect(gradeSortBtn!.classes()).toContain("active");
    const cardsByGrade = wrapper.findAll(".upgrade-card");
    expect(cardsByGrade[0].text()).toContain("套装甲");
    expect(cardsByGrade[1].text()).toContain("套装乙");

    // Character & set filter dropdowns only list options present in results.
    const charSelect = wrapper.get('select[aria-label="按适配角色筛选"]');
    const setSelect = wrapper.get('select[aria-label="按套装筛选"]');
    expect(charSelect.findAll("option")).toHaveLength(3);
    expect(setSelect.findAll("option")).toHaveLength(3);

    await charSelect.setValue("1001");
    await flushPromises();
    expect(wrapper.findAll(".upgrade-card")).toHaveLength(1);
    expect(wrapper.find(".upgrade-card").text()).toContain("套装甲");

    // Conflicting character + set filter shows empty state with reset button.
    await setSelect.setValue("102");
    await flushPromises();
    expect(wrapper.findAll(".upgrade-card")).toHaveLength(0);
    await wrapper.get(".upgrade-reset-btn").trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".upgrade-card")).toHaveLength(2);

    wrapper.unmount();
  });
});
