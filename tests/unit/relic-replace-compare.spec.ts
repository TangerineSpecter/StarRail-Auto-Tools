import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import CharacterScorePanel from "@/features/inventory/CharacterScorePanel.vue";
import type { CharacterDetailData } from "@/features/inventory/detail-types";
import type { RelicListItem } from "@/types";

const { listRelics } = vi.hoisted(() => ({
  listRelics: vi.fn(),
}));

vi.mock("@/shared/api/inventory", () => ({
  inventoryApi: { listRelics },
}));

const weakSubstats = [
  { kind: "normal" as const, position: 0, key: "HP%", value: 3.4, count: 1, step: 0 },
  { kind: "normal" as const, position: 1, key: "DEF%", value: 4.3, count: 1, step: 0 },
  { kind: "normal" as const, position: 2, key: "Effect Hit Rate", value: 3.8, count: 1, step: 0 },
  { kind: "normal" as const, position: 3, key: "Effect RES", value: 3.8, count: 1, step: 0 },
];

const strongSubstats = [
  { kind: "normal" as const, position: 0, key: "CRIT Rate", value: 12.9, count: 3, step: 3 },
  { kind: "normal" as const, position: 1, key: "CRIT DMG", value: 18.1, count: 2, step: 2 },
  { kind: "normal" as const, position: 2, key: "ATK%", value: 12.9, count: 2, step: 2 },
  { kind: "normal" as const, position: 3, key: "SPD", value: 5.2, count: 2, step: 2 },
];

const detail: CharacterDetailData = {
  characterId: 1005,
  name: "卡芙卡",
  path: "Nihility",
  level: 80,
  ascension: 6,
  eidolon: 0,
  skills: {},
  traces: {},
  abilityVersion: 1,
  updatedAt: 0,
  equippedRelics: [
    {
      itemId: 11,
      setId: 101,
      name: "过客的礼帽",
      setName: "云无留迹的过客",
      slot: "Head",
      rarity: 5,
      level: 15,
      mainStat: "HP",
      mainStatValue: 705,
      location: "卡芙卡",
      locked: true,
      discard: false,
      updatedAt: 0,
      substats: weakSubstats,
    },
  ],
};

const betterCandidate: RelicListItem = {
  itemId: 99,
  setId: 101,
  name: "过客的礼帽",
  setName: "云无留迹的过客",
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
  substats: strongSubstats,
};

const plan = {
  characterId: 1005,
  cavernMode: "fourPiece" as const,
  cavernSetA: 101,
  cavernSetB: null,
  planarSetId: null,
  mainStats: {},
  targets: [],
  effectiveSubstats: ["CRIT Rate", "CRIT DMG", "ATK%", "SPD"],
  note: "",
  substatWeights: {
    "CRIT Rate": 1,
    "CRIT DMG": 1,
    "ATK%": 0.75,
    SPD: 0.75,
  },
  minPotentialPct: 40,
  spdTarget: 0,
};

describe("CharacterScorePanel replace compare", () => {
  beforeEach(() => {
    listRelics.mockReset();
    listRelics.mockResolvedValue({
      items: [betterCandidate],
      total: 1,
      page: 1,
      pageSize: 200,
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens a dual-card compare popover when a replacement candidate is clicked", async () => {
    const wrapper = mount(CharacterScorePanel, {
      attachTo: document.body,
      props: { detail, plan },
      global: {
        stubs: { InputNumber: true },
      },
    });

    await nextTick();
    const loadBtn = wrapper
      .findAll("button.score-action")
      .find((btn) => btn.text().includes("从背包检索可替换遗器"));
    expect(loadBtn).toBeTruthy();
    await loadBtn!.trigger("click");
    await nextTick();
    await nextTick();

    const candidateBtn = wrapper.get("button.score-replace-item");
    expect(candidateBtn.text()).toMatch(/#99/);
    expect(candidateBtn.attributes("aria-label")).toMatch(/对比/);

    await candidateBtn.trigger("click");
    await nextTick();
    await nextTick();

    const root = document.querySelector(".relic-replace-compare-root");
    const popover = document.querySelector(".relic-replace-compare-popover");
    expect(root).not.toBeNull();
    expect(popover).not.toBeNull();
    expect(popover?.textContent).toContain("当前装备");
    expect(popover?.textContent).toContain("推荐替换");
    expect(popover?.textContent).toContain("词条评分对比");
    expect(popover?.textContent).toMatch(/潜力/);
    expect(popover?.textContent).toMatch(/加权/);
    // Name tag keeps the original compact grade · potential look (no weighted there).
    const nameScore = popover?.querySelector(".equipped-relic-peek-score")?.textContent ?? "";
    expect(nameScore).toMatch(/潜力/);
    expect(nameScore).not.toMatch(/加权/);
    // Two equipment cards side by side.
    expect(popover?.querySelectorAll(".equipped-relic-peek").length).toBe(2);
    // Substat contribution scores rendered as tags after the stat name.
    expect(popover?.querySelectorAll(".detail-substat-score-tag").length).toBeGreaterThan(0);
    // Horizontal comparison table.
    expect(popover?.querySelectorAll(".relic-replace-compare-table-row").length).toBeGreaterThan(0);
    expect(candidateBtn.attributes("aria-expanded")).toBe("true");

    await candidateBtn.trigger("click");
    await nextTick();
    expect(document.querySelector(".relic-replace-compare-root")).toBeNull();

    wrapper.unmount();
  });
});
