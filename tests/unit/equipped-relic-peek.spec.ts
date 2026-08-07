import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { createPinia } from "pinia";
import { nextTick } from "vue";
import CharacterScorePanel from "@/features/inventory/CharacterScorePanel.vue";
import type { CharacterDetailData } from "@/features/inventory/detail-types";

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
      substats: [
        { kind: "normal", position: 0, key: "CRIT Rate", value: 10.4, count: 2, step: 2 },
        { kind: "normal", position: 1, key: "CRIT DMG", value: 12.9, count: 1, step: 1 },
        { kind: "normal", position: 2, key: "ATK%", value: 8.6, count: 1, step: 1 },
        { kind: "normal", position: 3, key: "SPD", value: 2.6, count: 0, step: 0 },
      ],
    },
  ],
};

describe("CharacterScorePanel equipped relic peek", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens a peek card without item id when a score piece is clicked", async () => {
    const wrapper = mount(CharacterScorePanel, {
      attachTo: document.body,
      props: {
        detail,
        plan: {
          characterId: 1005,
          cavernMode: "fourPiece",
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
        },
      },
      global: {
        plugins: [createPinia()],
        stubs: { InputNumber: true },
      },
    });

    await nextTick();
    const piece = wrapper.get("button.score-piece");
    expect(piece.attributes("aria-label")).toMatch(/^查看头部当前装备/);
    expect(piece.text()).toMatch(/加权/);
    await piece.trigger("click");
    await nextTick();

    const popover = document.querySelector(".equipped-relic-peek-popover");
    expect(popover).not.toBeNull();
    expect(popover?.textContent).toContain("云无留迹的过客");
    expect(popover?.textContent).toContain("过客的礼帽");
    expect(popover?.textContent).toContain("暴击率");
    // Grade + potential under the name; level only on the right (no duplicate +N tag).
    expect(popover?.querySelector(".equipped-relic-peek-score")?.textContent).toMatch(/潜力/);
    expect(popover?.querySelector(".equipped-relic-peek-score")?.textContent).not.toMatch(/加权/);
    expect(popover?.querySelectorAll(".detail-slot-tag").length).toBe(1);
    // Effective substats from the plan get a flowing-border marker class.
    const effectiveRows = popover?.querySelectorAll(".detail-substat-row.is-effective") ?? [];
    expect(effectiveRows.length).toBe(4);
    // Live counts (no zero lines): count=2 → 1 enhancement; count=1 → no badge.
    // This fixture has count:0 on SPD so legacy mode: count=2 shows +2.
    expect(popover?.textContent).toMatch(/\+2/);
    expect(popover?.textContent).not.toMatch(/#\s*11/);
    expect(piece.attributes("aria-expanded")).toBe("true");

    await piece.trigger("click");
    await nextTick();
    expect(document.querySelector(".equipped-relic-peek-popover")).toBeNull();

    wrapper.unmount();
  });
});
