import { describe, expect, it } from "vitest";
import { diagnoseBuildPotential } from "@/features/build-planner/potential-diagnosis";
import { averageCharacterPotential, resolvePlanWeights } from "@/shared/utils/relic-score";
import type { ScoreRelicInput } from "@/shared/utils/relic-score";

function makeBreakRelic(
  slot: string,
  mainStat: string,
  substats: Array<{ key: string; count: number; step?: number }>,
): ScoreRelicInput {
  return {
    slot,
    mainStat,
    substats: substats.map((item) => ({ kind: "normal", ...item })),
  };
}

describe("diagnoseBuildPotential", () => {
  it("explains weight source, roll quality loss and secondary-weight impact for a high-grade break build", () => {
    const weights = resolvePlanWeights({
      effectiveSubstats: ["Break Effect", "SPD", "ATK%"],
    });
    const relics: ScoreRelicInput[] = [
      makeBreakRelic("Head", "HP", [
        { key: "Break Effect", count: 2, step: 2 },
        { key: "SPD", count: 1, step: 1 },
        { key: "DEF", count: 3, step: 0 },
        { key: "Effect RES", count: 2, step: 0 },
      ]),
      makeBreakRelic("Hands", "ATK", [
        { key: "Break Effect", count: 4, step: 4 },
        { key: "SPD", count: 2, step: 2 },
        { key: "ATK%", count: 1, step: 1 },
        { key: "HP", count: 1, step: 0 },
      ]),
      makeBreakRelic("Body", "ATK%", [
        { key: "Break Effect", count: 4, step: 4 },
        { key: "SPD", count: 2, step: 2 },
        { key: "DEF%", count: 2, step: 0 },
        { key: "HP%", count: 1, step: 0 },
      ]),
      makeBreakRelic("Feet", "SPD", [
        { key: "Break Effect", count: 3, step: 3 },
        { key: "ATK%", count: 2, step: 2 },
        { key: "CRIT Rate", count: 2, step: 0 },
        { key: "HP", count: 1, step: 0 },
      ]),
      makeBreakRelic("PlanarSphere", "ATK%", [
        { key: "Break Effect", count: 4, step: 4 },
        { key: "SPD", count: 2, step: 2 },
        { key: "DEF", count: 1, step: 0 },
        { key: "HP", count: 1, step: 0 },
      ]),
      makeBreakRelic("LinkRope", "Break Effect", [
        { key: "SPD", count: 3, step: 3 },
        { key: "ATK%", count: 2, step: 2 },
        { key: "HP%", count: 2, step: 0 },
        { key: "DEF%", count: 2, step: 0 },
      ]),
    ];

    const potential = averageCharacterPotential(relics, weights);
    const diag = diagnoseBuildPotential({
      relics,
      pieces: potential.pieces,
      weights,
      usingInferredWeights: true,
      recommendedSets: [
        { set: { name: "荡除蠹灾的铁骑" }, pieces: 4, matched: true },
        { set: { name: "劫火莲灯铸炼宫" }, pieces: 2, matched: true },
      ],
      targets: [
        {
          statKey: "Break Effect",
          target: 200,
          minimum: 180,
          priority: 1,
          current: 235,
          percent: 117.5,
          gap: 0,
        },
      ],
      averagePotentialPct: potential.averagePotentialPct,
      minPotentialPct: 40,
      weakSlot: potential.weakSlot,
    });

    expect(diag.weightSourceLabel).toBe("按有效词条推断");
    expect(diag.weightSummary).toContain("击破特攻 1.0");
    expect(diag.weightSummary).toContain("攻击% 0.75");
    expect(diag.weightSummary).toContain("小攻击 0.3");
    expect(diag.totalEffectiveRolls).toBe(32);
    expect(diag.totalWastedRolls).toBe(18);
    expect(diag.avgRollQuality).toBeCloseTo(0.9, 2);
    expect(diag.qualityLossPct).toBeGreaterThan(5);
    expect(diag.lowWeightLossPct).toBeGreaterThan(1.5);
    expect(diag.lowWeightLossPct).toBeLessThan(4);
    expect(diag.explanationTip).toContain("数值档位");
    expect(diag.explanationTip).toContain("次权词条");
    expect(diag.explanationTip).toContain("60% SS 毕业");
    expect(diag.piecesBySlot.Head?.wastedRolls).toBe(5);

    expect(diag.suggestions).toHaveLength(1);
    expect(diag.suggestions[0]?.tone).toBe("done");
    expect(diag.suggestions[0]?.label).toBe("已毕业");
    expect(diag.suggestions[0]?.text).toContain("头部");
  });

  it("prioritizes missing sets, wrong main stats, and unmet targets before weak-slot tuning", () => {
    const weights = resolvePlanWeights({
      substatWeights: { "CRIT Rate": 1, "CRIT DMG": 1, SPD: 1 },
    });
    const relics: ScoreRelicInput[] = [
      makeBreakRelic("Head", "HP", [{ key: "CRIT Rate", count: 2, step: 2 }]),
      makeBreakRelic("Hands", "ATK", [{ key: "CRIT DMG", count: 2, step: 2 }]),
      makeBreakRelic("Body", "HP%", [{ key: "CRIT Rate", count: 1, step: 1 }]),
      makeBreakRelic("Feet", "SPD", [{ key: "CRIT DMG", count: 2, step: 2 }]),
      makeBreakRelic("PlanarSphere", "Fire DMG Boost", [{ key: "SPD", count: 1, step: 1 }]),
      makeBreakRelic("LinkRope", "ATK%", [{ key: "CRIT Rate", count: 2, step: 2 }]),
    ];

    const potential = averageCharacterPotential(relics, weights, {
      allowedMainStats: { Body: ["CRIT Rate", "CRIT DMG"] },
    });
    const diag = diagnoseBuildPotential({
      relics,
      pieces: potential.pieces,
      weights,
      usingInferredWeights: false,
      recommendedSets: [{ set: { name: "净庭教宗的圣骑士" }, pieces: 4, matched: false }],
      targets: [
        {
          statKey: "CRIT DMG",
          target: 140,
          minimum: 120,
          priority: 1,
          current: 121.2,
          percent: 86.5,
          gap: 18.8,
        },
      ],
      averagePotentialPct: potential.averagePotentialPct,
      minPotentialPct: 40,
      weakSlot: potential.weakSlot,
    });

    expect(diag.weightSourceLabel).toBe("方案自定义权重");
    expect(diag.suggestions).toHaveLength(2);
    expect(diag.suggestions[0]).toMatchObject({
      tone: "critical",
      label: "主词条",
    });
    expect(diag.suggestions[0]?.text).toContain("躯干");
    expect(diag.suggestions[1]).toMatchObject({
      tone: "warn",
      label: "凑套装",
    });
  });

  it("estimates substat roll gap for unmet percentage or SPD targets and flags missing slots", () => {
    const weights = resolvePlanWeights({ effectiveSubstats: ["CRIT Rate", "SPD"] });
    const relics: ScoreRelicInput[] = [
      makeBreakRelic("Head", "HP", [
        { key: "CRIT Rate", count: 2, step: 2 },
        { key: "DEF", count: 4, step: 0 },
      ]),
    ];
    const potential = averageCharacterPotential(relics, weights);
    const diag = diagnoseBuildPotential({
      relics,
      pieces: potential.pieces,
      weights,
      usingInferredWeights: true,
      recommendedSets: [],
      targets: [
        {
          statKey: "SPD",
          target: 140,
          minimum: 134,
          priority: 1,
          current: 133,
          percent: 95,
          gap: 7,
        },
      ],
      averagePotentialPct: potential.averagePotentialPct,
      minPotentialPct: 40,
      weakSlot: potential.weakSlot,
    });

    expect(diag.suggestions[0]).toMatchObject({
      tone: "critical",
      label: "缺部位",
    });
    expect(diag.suggestions[1]).toMatchObject({
      tone: "warn",
      label: "补目标",
    });
    expect(diag.suggestions[1]?.text).toContain("速度还差 7");
    expect(diag.suggestions[1]?.text).toContain("约 4 条副词条");
  });
});
