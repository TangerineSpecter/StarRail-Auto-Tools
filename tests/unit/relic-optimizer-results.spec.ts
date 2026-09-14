import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RelicOptimizerResults from "@/features/build-planner/RelicOptimizerResults.vue";
import type { OptimizedRelicBuild, RelicOptimizerResult } from "@/types";

function build(setId: number, score: number): OptimizedRelicBuild {
  return {
    relics: [
      {
        itemId: setId,
        setId,
        name: "测试遗器",
        setName: `套装 ${setId}`,
        slot: "Head",
        rarity: 5,
        level: 15,
        mainStat: "HP",
        mainStatValue: 705.6,
        location: "",
        equippedCharacterId: null,
        locked: false,
        discard: false,
        substats: [],
        borrowed: false,
        unfinished: false,
        changed: true,
      },
    ],
    weightedRolls: score,
    averagePotentialPct: 60,
    standingStats: [],
    targetProgress: [
      {
        statKey: "SPD",
        target: 134,
        minimum: 120,
        priority: 1,
        current: 135,
        gap: 0,
        satisfied: true,
      },
    ],
    activeSets: [{ setId, name: `套装 ${setId}`, pieces: 4 }],
    borrowedCount: 0,
    unfinishedCount: 0,
    discardedCount: 0,
    changedCount: 1,
  };
}

describe("RelicOptimizerResults", () => {
  it("separates strict and relaxed rankings and exposes search diagnostics", async () => {
    const diagnostics = {
      searchMode: "bounded" as const,
      originalCandidates: 2000,
      retainedCandidates: 300,
      evaluatedBuilds: 20000,
      durationMs: 850,
      truncated: true,
    };
    const result: RelicOptimizerResult = {
      current: null,
      strict: { builds: [build(10, 12)], nearest: null, diagnostics },
      relaxed: { builds: [build(11, 15)], nearest: null, diagnostics },
    };
    const wrapper = mount(RelicOptimizerResults, {
      props: { calculating: false, phase: "", result },
      global: { stubs: { Button: true } },
    });

    expect(wrapper.text()).toContain("有界搜索");
    expect(wrapper.text()).toContain("高质量近似结果");
    expect(wrapper.text()).toContain("12 rolls");
    await wrapper.get(".optimizer-modes button:nth-child(2)").trigger("click");
    expect(wrapper.text()).toContain("15 rolls");
    expect(wrapper.text()).toContain("散件对照");
  });
});
