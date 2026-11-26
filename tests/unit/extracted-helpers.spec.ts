import { describe, expect, it } from "vitest";
import {
  adviceClass,
  buildSpdHelp,
  candidateToDetail,
  equippedRelicSpdBonus,
  formatDays,
  gradeBadgeClass,
} from "@/features/inventory/score-panel-helpers";
import {
  filterMainStatGroups,
  getStatThemeClass,
  gradeClass,
  groupFilteredSetsBySlot,
  isPlanarSet,
  summarizeMainStatGroups,
} from "@/features/relic-scanner/scanner-grouping";
import {
  characterInitial,
  getCompletionClass,
  getProgressClass,
  orderedEntryIdsForDrag,
  planNote,
} from "@/features/build-planner/dashboard-evaluation";
import type { BuildDashboardEntry, RelicMainStatGroupedResult } from "@/types";

describe("score-panel-helpers", () => {
  it("maps grades, advice badges, and formatted days", () => {
    expect(gradeBadgeClass(null)).toBe("grade-none");
    expect(gradeBadgeClass("SSS+")).toBe("grade-sss");
    expect(gradeBadgeClass("SS")).toBe("grade-ss");
    expect(gradeBadgeClass("S+")).toBe("grade-sp");
    expect(gradeBadgeClass("S")).toBe("grade-s");
    expect(gradeBadgeClass("A")).toBe("grade-a");
    expect(gradeBadgeClass("B")).toBe("grade-b");
    expect(gradeBadgeClass("C")).toBe("grade-c");

    expect(adviceClass("可停刷")).toBe("is-stop");
    expect(adviceClass("主属性不符")).toBe("is-mismatch");
    expect(adviceClass("优先刷")).toBe("is-priority");
    expect(adviceClass("继续刷")).toBe("is-continue");

    expect(formatDays(Infinity)).toBe("∞");
    expect(formatDays(12.34)).toBe("12.3 天");
  });

  it("computes relic SPD bonus and builds total vs gap-only SPD help", () => {
    const spd = equippedRelicSpdBonus([
      {
        itemId: 1,
        setId: 101,
        name: "脚部",
        setName: "套装",
        slot: "Feet",
        rarity: 5,
        level: 15,
        mainStat: "SPD",
        mainStatValue: 25,
        location: "",
        equippedCharacterId: 1001,
        locked: true,
        discard: false,
        updatedAt: 0,
        substats: [
          { kind: "normal", position: 0, key: "SPD", value: 4.6, count: 2, step: 1 },
          { kind: "preview", position: 1, key: "SPD", value: 2.3, count: 1, step: 0 },
        ],
      },
    ]);
    expect(spd).toBeCloseTo(29.6);

    expect(buildSpdHelp(134, 0)).toBeNull();
    expect(buildSpdHelp(134, 134)?.mode).toBe("total");
    expect(buildSpdHelp(null, 134)).toMatchObject({
      mode: "gap-only",
      note: expect.stringContaining("站街速度不可用"),
    });

    expect(
      candidateToDetail({ slot: "Body", mainStat: "CRIT Rate", substats: [{ key: "SPD" }] }),
    ).toMatchObject({
      name: "未知遗器",
      rarity: 5,
      substats: [{ kind: "normal", position: 0, key: "SPD", value: 0, count: 0, step: 0 }],
    });
  });
});

describe("scanner-grouping", () => {
  const sample: RelicMainStatGroupedResult = {
    total: 5,
    planCount: 2,
    groups: [
      {
        setId: 114,
        setName: "骇域漫游的信使",
        parts: [
          { slot: "Body", stats: [{ mainStat: "CRIT Rate", count: 2 }] },
          { slot: "Feet", stats: [{ mainStat: "SPD", count: 1 }] },
        ],
      },
      {
        setId: 309,
        setName: "繁星竞技场",
        parts: [{ slot: "PlanarSphere", stats: [{ mainStat: "Quantum DMG Boost", count: 2 }] }],
      },
    ],
  };

  it("summarizes, filters, and groups main-stat scan results by slot", () => {
    expect(isPlanarSet(sample.groups[0])).toBe(false);
    expect(isPlanarSet(sample.groups[1])).toBe(true);
    expect(summarizeMainStatGroups(sample)).toEqual({
      cavernCount: 3,
      planarCount: 2,
      cavernSets: 1,
      planarSets: 1,
      slotCounts: { Body: 2, Feet: 1, PlanarSphere: 2, LinkRope: 0, Head: 0, Hands: 0 },
    });

    const filtered = filterMainStatGroups(sample, {
      searchQuery: "信使",
      slotFilter: "Body",
      categoryFilter: "cavern",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].groupTotal).toBe(2);

    const bySlot = groupFilteredSetsBySlot(filtered, "all");
    expect(bySlot).toHaveLength(1);
    expect(bySlot[0]).toMatchObject({ slot: "Body", total: 2 });

    expect(gradeClass("S+")).toBe("grade-s-plus");
    expect(gradeClass(null)).toBe("grade-none");
    expect(getStatThemeClass("Quantum DMG Boost")).toBe("stat-element");
    expect(getStatThemeClass("SPD")).toBe("stat-speed");
  });
});

describe("dashboard-evaluation helpers", () => {
  it("formats basic progress classes and preserves drag ordering with hidden entries", () => {
    expect(characterInitial("丹恒•饮月")).toBe("丹");
    expect(planNote({ note: "  高速流  " } as BuildDashboardEntry["plan"])).toBe("高速流");
    expect(getProgressClass(null)).toBe("progress-unknown");
    expect(getProgressClass(100)).toBe("progress-complete");
    expect(getCompletionClass(0.85)).toBe("progress-high");
    expect(getProgressClass(60)).toBe("progress-medium");
    expect(getProgressClass(20)).toBe("progress-low");

    const entries = [
      { character: { characterId: 1 }, pinned: true, displayOrder: 0 },
      { character: { characterId: 2 }, pinned: false, displayOrder: 1 },
      { character: { characterId: 3 }, pinned: false, displayOrder: 0 },
    ] as BuildDashboardEntry[];
    expect(orderedEntryIdsForDrag(entries, [2])).toEqual([2, 1, 3]);
  });
});
