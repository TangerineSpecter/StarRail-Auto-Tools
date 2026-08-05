import { describe, expect, it } from "vitest";
import {
  averageCharacterPotential,
  effectiveWeight,
  estimateTbp,
  farmingPriorityRows,
  inferWeightsFromEffectiveSubstats,
  letterGradeFromPotential,
  planQualityCompletion,
  planTargetSetIdsForSlot,
  qualityTagFromScore,
  rankSlotReplacements,
  rerollPotential,
  roleWeights,
  scoreRelic,
  scoreRelicForPlans,
  spdBreakpointHelper,
  weightedRollsOfRelic,
} from "@/shared/utils/relic-score";

const critWeights = roleWeights("critDps");

const sampleRelic = {
  slot: "PlanarSphere",
  mainStat: "Fire DMG Boost",
  rarity: 5,
  level: 15,
  substats: [
    { key: "ATK", value: 38.1, count: 1, step: 1 },
    { key: "ATK%", value: 12.0, count: 2, step: 2 },
    { key: "CRIT DMG", value: 12.3, count: 1, step: 2 },
    { key: "DEF%", value: 5.4, count: 0, step: 0 },
  ],
};

describe("relic-score core", () => {
  it("scores a crit DPS relic with non-zero weighted rolls and a letter grade", () => {
    const result = scoreRelic(sampleRelic, critWeights);
    expect(result.weightedRolls).toBeGreaterThan(0);
    expect(result.letterGrade).toBeTruthy();
    expect(result.potentialPct).toBeGreaterThan(0);
    expect(letterGradeFromPotential(result.potentialPct)).toBe(result.letterGrade);
  });

  it("weights flat ATK as 40% of matching ATK% weight (not the flat key)", () => {
    const weights = { ...critWeights, ATK: 0.75, "ATK%": 0.75 };
    expect(effectiveWeight("ATK", weights)).toBeCloseTo(0.75 * 0.4, 5);
    expect(effectiveWeight("ATK%", weights)).toBeCloseTo(0.75, 5);

    // Flat key set to 0 must still use ATK% × 0.4
    const percentOnlyWeights = { "ATK%": 1, ATK: 0 };
    expect(effectiveWeight("ATK", percentOnlyWeights)).toBeCloseTo(0.4, 5);
    expect(effectiveWeight("ATK%", percentOnlyWeights)).toBeCloseTo(1, 5);

    const flatOnly = weightedRollsOfRelic(
      {
        slot: "Head",
        mainStat: "HP",
        substats: [{ key: "ATK", count: 0, step: 0 }],
      },
      weights,
    );
    const percentOnly = weightedRollsOfRelic(
      {
        slot: "Head",
        mainStat: "HP",
        substats: [{ key: "ATK%", count: 0, step: 0 }],
      },
      weights,
    );
    expect(flatOnly.total).toBeLessThan(percentOnly.total);
    expect(flatOnly.total / percentOnly.total).toBeCloseTo(0.4, 5);

    const flatWithZeroFlatKey = weightedRollsOfRelic(
      {
        slot: "Head",
        mainStat: "HP",
        substats: [{ key: "ATK", count: 0, step: 2 }],
      },
      percentOnlyWeights,
    );
    expect(flatWithZeroFlatKey.total).toBeGreaterThan(0);
    expect(flatWithZeroFlatKey.total).toBeCloseTo(0.4 * 1.0, 5); // 1 high-quality initial roll
  });

  it("gives near-equal potentialPct for equal-weight high-roll CR vs CD relics", () => {
    const weights = { "CRIT Rate": 1, "CRIT DMG": 1, SPD: 0, "ATK%": 0 };
    // 5 high rolls into one line (count=4 enhancements + initial, step=8 max)
    const crRelic = {
      slot: "Head" as const,
      mainStat: "HP",
      substats: [
        { key: "CRIT Rate", count: 4, step: 8 },
        { key: "DEF", count: 0, step: 0 },
        { key: "HP%", count: 0, step: 0 },
        { key: "Effect RES", count: 0, step: 0 },
      ],
    };
    const cdRelic = {
      slot: "Head" as const,
      mainStat: "HP",
      substats: [
        { key: "CRIT DMG", count: 4, step: 8 },
        { key: "DEF", count: 0, step: 0 },
        { key: "HP%", count: 0, step: 0 },
        { key: "Effect RES", count: 0, step: 0 },
      ],
    };
    const cr = scoreRelic(crRelic, weights);
    const cd = scoreRelic(cdRelic, weights);
    expect(cr.weightedRolls).toBeCloseTo(cd.weightedRolls, 5);
    expect(cr.potentialPct).toBeCloseTo(cd.potentialPct, 5);
    expect(cr.letterGrade).toBe(cd.letterGrade);
    // Must not be ~2× CR vs CD potential from erroneous potentialScale stacking.
    expect(Math.abs(cr.potentialPct - cd.potentialPct)).toBeLessThan(0.5);
  });

  it("returns larger estTbp/days when the score threshold is higher", () => {
    const low = {
      slot: "Head",
      mainStat: "HP",
      substats: [
        { key: "CRIT Rate", count: 0, step: 0 },
        { key: "CRIT DMG", count: 0, step: 0 },
        { key: "ATK%", count: 0, step: 0 },
        { key: "DEF", count: 0, step: 0 },
      ],
    };
    const high = {
      slot: "Head",
      mainStat: "HP",
      substats: [
        { key: "CRIT Rate", count: 2, step: 4 },
        { key: "CRIT DMG", count: 2, step: 4 },
        { key: "ATK%", count: 1, step: 2 },
        { key: "SPD", count: 0, step: 0 },
      ],
    };
    const lowTbp = estimateTbp(low, critWeights);
    const highTbp = estimateTbp(high, critWeights);
    expect(Number.isFinite(lowTbp.days)).toBe(true);
    expect(Number.isFinite(highTbp.days)).toBe(true);
    expect(highTbp.days).toBeGreaterThan(lowTbp.days);
    expect(highTbp.estTbp).toBeGreaterThan(lowTbp.estTbp);
  });

  it("defines reroll delta for a one-stat-heavy relic", () => {
    const rope = {
      slot: "LinkRope",
      mainStat: "ATK%",
      substats: [
        { key: "CRIT Rate", count: 4, step: 8 },
        { key: "DEF", count: 0, step: 0 },
        { key: "HP", count: 0, step: 0 },
        { key: "Effect RES", count: 0, step: 0 },
      ],
    };
    const result = rerollPotential(rope, critWeights);
    expect(Number.isFinite(result.deltaPct)).toBe(true);
    expect(result.summary.length).toBeGreaterThan(0);
    // All upgrades into CR with three dead lines → reroll expected to drop perfection.
    expect(result.deltaPct).toBeLessThan(0);
  });

  it("averages six pieces and highlights the weak slot", () => {
    const weak = {
      slot: "Feet",
      mainStat: "SPD",
      substats: [
        { key: "HP", count: 0, step: 0 },
        { key: "DEF", count: 0, step: 0 },
        { key: "Effect RES", count: 0, step: 0 },
        { key: "Break Effect", count: 0, step: 0 },
      ],
    };
    const strong = {
      slot: "Body",
      mainStat: "CRIT Rate",
      substats: [
        { key: "CRIT DMG", count: 3, step: 4 },
        { key: "ATK%", count: 1, step: 2 },
        { key: "SPD", count: 0, step: 0 },
        { key: "HP%", count: 0, step: 0 },
      ],
    };
    const summary = averageCharacterPotential(
      [strong, weak, strong, strong, strong, strong],
      critWeights,
    );
    expect(summary.weakSlot).toBe("Feet");
    expect(summary.averagePotentialPct).toBeGreaterThan(0);
  });

  it("tags quality and ranks plan usefulness", () => {
    const score = scoreRelic(sampleRelic, critWeights);
    const tag = qualityTagFromScore(score, { minPotentialPct: 40, minWeightedRolls: 3 });
    expect(["lock", "farm", "discard-candidate"]).toContain(tag);

    const ranked = scoreRelicForPlans(sampleRelic, [
      {
        characterId: 1112,
        planLabel: "托帕",
        substatWeights: critWeights,
        mainStats: { PlanarSphere: ["Fire DMG Boost"] },
      },
      {
        characterId: 1203,
        planLabel: "罗刹",
        substatWeights: roleWeights("sustain"),
        mainStats: { PlanarSphere: ["HP%"] },
      },
    ]);
    expect(ranked.byPlan).toHaveLength(2);
    expect(ranked.best?.characterId).toBeDefined();
  });

  it("computes SPD breakpoint rolls needed", () => {
    const result = spdBreakpointHelper(134, 160);
    expect(result.gap).toBeCloseTo(26, 5);
    expect(result.rollsNeededHigh).toBeGreaterThan(0);
    expect(result.rollsNeededMid).toBeGreaterThanOrEqual(result.rollsNeededHigh);
  });

  it("ranks slot replacements by weighted roll delta", () => {
    const equipped = {
      slot: "Body",
      mainStat: "CRIT Rate",
      itemId: 1,
      substats: [
        { key: "ATK%", count: 0, step: 0 },
        { key: "DEF", count: 0, step: 0 },
      ],
    };
    const better = {
      slot: "Body",
      mainStat: "CRIT Rate",
      itemId: 2,
      substats: [
        { key: "CRIT DMG", count: 3, step: 4 },
        { key: "ATK%", count: 1, step: 2 },
        { key: "SPD", count: 0, step: 0 },
      ],
    };
    const worse = {
      slot: "Body",
      mainStat: "CRIT Rate",
      itemId: 3,
      substats: [{ key: "HP", count: 0, step: 0 }],
    };
    const ranked = rankSlotReplacements(equipped, [better, worse], critWeights, {
      requireSameMain: true,
    });
    expect(ranked[0]?.relic.itemId).toBe(2);
    expect(ranked[0]?.deltaWeightedRolls).toBeGreaterThan(0);
  });

  it("builds farming priority rows and plan quality completion", () => {
    const rows = farmingPriorityRows([sampleRelic], critWeights, {
      allowedMainStats: { PlanarSphere: ["Fire DMG Boost"] },
    });
    expect(rows[0]?.advice).toBeTruthy();
    expect(rows[0]?.days).toBeGreaterThan(0);

    const completion = planQualityCompletion([sampleRelic], critWeights, {
      allowedMainStats: { PlanarSphere: ["Fire DMG Boost"] },
      minPotentialPct: 20,
    });
    expect(completion.mainStatCorrectCount).toBe(1);
    expect(completion.combinedRatio).toBeGreaterThan(0);
  });

  it("keeps Infinity for non-finite farm investment days", async () => {
    const { characterFarmInvestment } = await import("@/shared/utils/relic-score");
    const result = characterFarmInvestment([
      { slot: "Head", days: 3 },
      { slot: "Body", days: Number.POSITIVE_INFINITY },
    ]);
    expect(result.bottleneckDays).toBe(Number.POSITIVE_INFINITY);
    expect(result.estimateDays).toBe(Number.POSITIVE_INFINITY);
    expect(result.sumDays).toBe(Number.POSITIVE_INFINITY);
    expect(result.bottleneckSlot).toBe("Body");
  });

  it("keeps Effect RES at 0 on damage archetypes and provides a DoT template", () => {
    const crit = roleWeights("critDps");
    const brk = roleWeights("breakDps");
    const dot = roleWeights("dot");
    const sustain = roleWeights("sustain");
    expect(crit["Effect RES"]).toBe(0);
    expect(brk["Effect RES"]).toBe(0);
    expect(dot["Effect RES"]).toBe(0);
    expect(dot["Effect Hit Rate"]).toBe(1);
    expect(dot["ATK%"]).toBe(1);
    expect(dot["CRIT Rate"]).toBe(0);
    expect(brk["Break Effect"]).toBe(1);
    expect(brk["CRIT Rate"]).toBe(0);
    expect(sustain["Effect RES"]).toBe(0.5);
  });

  it("infers DoT and break templates from effective substats", () => {
    const dot = inferWeightsFromEffectiveSubstats(["SPD", "ATK%", "Effect Hit Rate"]);
    expect(dot["Effect Hit Rate"]).toBe(1);
    expect(dot["CRIT Rate"]).toBe(0);
    const brk = inferWeightsFromEffectiveSubstats(["SPD", "Break Effect", "ATK%"]);
    expect(brk["Break Effect"]).toBe(1);
    expect(brk["CRIT DMG"]).toBe(0);
  });

  it("gives zero SPD weight on low-speed counter DPS template", () => {
    const slow = roleWeights("critDpsSlow");
    expect(slow.SPD).toBe(0);
    expect(slow["CRIT Rate"]).toBe(1);
    expect(slow["ATK%"]).toBe(1);
  });

  it("resolves plan target set ids by slot", () => {
    const four = {
      cavernMode: "fourPiece",
      cavernSetA: 101,
      cavernSetB: 102,
      planarSetId: 301,
    };
    expect(planTargetSetIdsForSlot(four, "Body")).toEqual([101]);
    expect(planTargetSetIdsForSlot(four, "PlanarSphere")).toEqual([301]);
    const two = { ...four, cavernMode: "twoPlusTwo" };
    expect(planTargetSetIdsForSlot(two, "Feet")?.sort()).toEqual([101, 102]);
    expect(planTargetSetIdsForSlot({ cavernSetA: 0, planarSetId: 0 }, "Head")).toBeNull();
  });
});
