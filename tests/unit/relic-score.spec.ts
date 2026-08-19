import { describe, expect, it } from "vitest";
import {
  averageCharacterPotential,
  effectiveWeight,
  enhancementHitsOnLine,
  formatEnhancementHitBadge,
  estimateTbp,
  farmingPriorityRows,
  inferWeightsFromEffectiveSubstats,
  isMainStatAllowed,
  letterGradeFromPotential,
  planQualityCompletion,
  planTargetSetIdsForSlot,
  qualityTagFromScore,
  rankSlotReplacements,
  rerollPotential,
  roleWeights,
  scanUpgradeRecommendations,
  scoreRelic,
  scoreRelicForPlans,
  spdBreakpointHelper,
  totalRollsOnLine,
  usesEnhancementHitCount,
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
    // 5 high rolls into one line (legacy enhancement count=4 + initial; dead lines count=0)
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

  it("treats live inventory count as total rolls including the initial line", () => {
    // Real export: count never 0; sum across lines ≈ 8–9 on +15. count=1 = initial only.
    const live = {
      slot: "Head" as const,
      mainStat: "HP",
      substats: [
        { key: "Break Effect", count: 4, step: 4 },
        { key: "SPD", count: 1, step: 1 },
        { key: "ATK%", count: 2, step: 1 },
        { key: "DEF%", count: 1, step: 0 },
      ],
    };
    expect(usesEnhancementHitCount(live.substats)).toBe(false);
    expect(totalRollsOnLine(live.substats[0]!)).toBe(4);
    expect(enhancementHitsOnLine(live.substats[0]!)).toBe(3);
    expect(totalRollsOnLine(live.substats[1]!)).toBe(1);
    expect(enhancementHitsOnLine(live.substats[1]!)).toBe(0);

    const weights = roleWeights("breakDps");
    const scored = scoreRelic(live, weights);
    // BE 4 rolls + SPD 1 roll + ATK% 2 rolls (no +1 double-count on initials)
    expect(scored.breakdown.find((row) => row.key === "Break Effect")?.rolls).toBe(4);
    expect(scored.breakdown.find((row) => row.key === "SPD")?.rolls).toBe(1);
  });

  it("maps live total-roll counts to enhancement badges in the game 0–5 range", () => {
    // Live: count includes initial. +15 piece has 5 upgrade events; one line can take all 5.
    expect(enhancementHitsOnLine({ count: 1 })).toBe(0);
    expect(formatEnhancementHitBadge(0)).toBeNull();
    expect(enhancementHitsOnLine({ count: 2 })).toBe(1);
    expect(formatEnhancementHitBadge(1)).toBe("+1");
    expect(enhancementHitsOnLine({ count: 4 })).toBe(3);
    expect(formatEnhancementHitBadge(3)).toBe("+3");
    expect(enhancementHitsOnLine({ count: 6 })).toBe(5);
    expect(formatEnhancementHitBadge(5)).toBe("MAX");
    // Over-range storage still clamps to max 5 upgrades on a single line.
    expect(enhancementHitsOnLine({ count: 20 })).toBe(5);
    // Sum of live counts on +15 should be ~8–9 → enhancement hits sum ≤ 5.
    const liveLines = [{ count: 1 }, { count: 1 }, { count: 2 }, { count: 5 }];
    const hitSum = liveLines.reduce((sum, line) => sum + enhancementHitsOnLine(line), 0);
    expect(hitSum).toBe(5);
  });

  it("keeps mono-BE full stack well below 100% vs ideal four openers", () => {
    const weights = roleWeights("breakDps");
    // Live: 4 total rolls on BE (1 initial + 3 upgrades) + dead lines
    const mono = {
      slot: "Head" as const,
      mainStat: "HP",
      substats: [
        { key: "Break Effect", count: 5, step: 6 },
        { key: "CRIT Rate", count: 1, step: 0 },
        { key: "DEF%", count: 1, step: 0 },
        { key: "Effect RES", count: 1, step: 0 },
      ],
    };
    const scored = scoreRelic(mono, weights);
    // Ideal ≈ SPD+BE+ATK%+ATK + 5×best ≈ 8.05; mono BE alone cannot reach ~100%.
    expect(scored.potentialPct).toBeGreaterThan(40);
    expect(scored.potentialPct).toBeLessThan(75);
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

  it("treats Head/Hands main stats as fixed when a plan map is present", () => {
    // Empty or missing Head/Hands keys behave as already configured (HP / ATK).
    expect(isMainStatAllowed("Head", "HP", {})).toBe(true);
    expect(isMainStatAllowed("Head", "HP", { Head: [] })).toBe(true);
    expect(isMainStatAllowed("Hands", "ATK", { Body: ["CRIT Rate"] })).toBe(true);
    expect(isMainStatAllowed("Head", "ATK", { Head: ["HP"] })).toBe(false);
    // Selectable slots still treat empty as unconfigured.
    expect(isMainStatAllowed("Body", "CRIT Rate", { Body: [] })).toBeNull();
    expect(isMainStatAllowed("Body", "CRIT Rate", {})).toBeNull();
    expect(isMainStatAllowed("Body", "CRIT Rate", { Body: ["CRIT Rate"] })).toBe(true);
    expect(isMainStatAllowed("Body", "HP%", { Body: ["CRIT Rate"] })).toBe(false);
    // No plan context at all → null for every slot.
    expect(isMainStatAllowed("Head", "HP", undefined)).toBeNull();

    const headOk = scoreRelic({ slot: "Head", mainStat: "HP", substats: [] }, critWeights, {
      allowedMainStats: { Body: ["CRIT Rate"] },
    });
    expect(headOk.mainStatCorrect).toBe(true);
    expect(headOk.letterGrade).not.toBeNull();
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

  it("scanUpgradeRecommendations only keeps main+set matches that beat equipped score", () => {
    const plan = {
      characterId: 1112,
      planLabel: "托帕",
      substatWeights: critWeights,
      mainStats: { Body: ["CRIT Rate"], PlanarSphere: ["Fire DMG Boost"] },
      cavernMode: "fourPiece" as const,
      cavernSetA: 101,
      cavernSetB: null,
      planarSetId: 301,
      equippedRelics: [
        {
          slot: "Body",
          mainStat: "CRIT Rate",
          setId: 101,
          substats: [
            { key: "ATK%", count: 1, step: 1 },
            { key: "DEF", count: 1, step: 0 },
          ],
        },
        {
          slot: "PlanarSphere",
          mainStat: "Fire DMG Boost",
          setId: 301,
          substats: [{ key: "HP", count: 1, step: 0 }],
        },
      ],
    };

    const betterBody = {
      slot: "Body",
      mainStat: "CRIT Rate",
      setId: 101,
      itemId: 10,
      substats: [
        { key: "CRIT DMG", count: 3, step: 4 },
        { key: "ATK%", count: 2, step: 3 },
        { key: "SPD", count: 1, step: 2 },
      ],
    };
    const worseBody = {
      slot: "Body",
      mainStat: "CRIT Rate",
      setId: 101,
      itemId: 11,
      substats: [{ key: "DEF%", count: 1, step: 0 }],
    };
    const wrongMain = {
      slot: "Body",
      mainStat: "HP%",
      setId: 101,
      itemId: 12,
      substats: [
        { key: "CRIT DMG", count: 4, step: 5 },
        { key: "CRIT Rate", count: 3, step: 4 },
      ],
    };
    const wrongSet = {
      slot: "Body",
      mainStat: "CRIT Rate",
      setId: 999,
      itemId: 13,
      substats: [
        { key: "CRIT DMG", count: 4, step: 5 },
        { key: "ATK%", count: 3, step: 4 },
      ],
    };
    const betterSphere = {
      slot: "PlanarSphere",
      mainStat: "Fire DMG Boost",
      setId: 301,
      itemId: 14,
      substats: [
        { key: "CRIT Rate", count: 2, step: 3 },
        { key: "CRIT DMG", count: 2, step: 2 },
      ],
    };

    const upgrades = scanUpgradeRecommendations(
      [betterBody, worseBody, wrongMain, wrongSet, betterSphere],
      [plan],
    );
    const ids = upgrades.map((row) => row.relic.itemId);
    expect(ids).toContain(10);
    expect(ids).toContain(14);
    expect(ids).not.toContain(11);
    expect(ids).not.toContain(12);
    expect(ids).not.toContain(13);
    expect(upgrades[0]?.deltaWeightedRolls).toBeGreaterThan(0);
    expect(upgrades.every((row) => row.deltaWeightedRolls > 0)).toBe(true);
  });

  it("scanUpgradeRecommendations returns empty when nothing beats equipped", () => {
    const plan = {
      characterId: 1,
      planLabel: "测试",
      substatWeights: critWeights,
      mainStats: { Body: ["CRIT Rate"] },
      cavernMode: "fourPiece" as const,
      cavernSetA: 101,
      planarSetId: 0,
      equippedRelics: [
        {
          slot: "Body",
          mainStat: "CRIT Rate",
          setId: 101,
          substats: [
            { key: "CRIT DMG", count: 4, step: 5 },
            { key: "ATK%", count: 3, step: 4 },
            { key: "SPD", count: 2, step: 3 },
          ],
        },
      ],
    };
    const mediocre = {
      slot: "Body",
      mainStat: "CRIT Rate",
      setId: 101,
      itemId: 20,
      substats: [{ key: "DEF%", count: 1, step: 0 }],
    };
    expect(scanUpgradeRecommendations([mediocre], [plan])).toEqual([]);
  });

  it("scanUpgradeRecommendations uses base=0 for empty slot (no equipped piece)", () => {
    const plan = {
      characterId: 1,
      planLabel: "测试",
      substatWeights: critWeights,
      mainStats: { Feet: ["SPD"] },
      cavernMode: "fourPiece" as const,
      cavernSetA: 101,
      planarSetId: 0,
      equippedRelics: [],
    };
    const candidate = {
      slot: "Feet",
      mainStat: "SPD",
      setId: 101,
      itemId: 30,
      substats: [
        { key: "CRIT Rate", count: 1, step: 1 },
        { key: "ATK%", count: 1, step: 1 },
      ],
    };
    const upgrades = scanUpgradeRecommendations([candidate], [plan]);
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0]?.equippedScore).toBeNull();
    expect(upgrades[0]?.deltaWeightedRolls).toBe(upgrades[0]?.candidateScore.weightedRolls);
  });

  it("scanUpgradeRecommendations passes Head/Hands with fixed main stats", () => {
    const plan = {
      characterId: 1,
      planLabel: "测试",
      substatWeights: critWeights,
      mainStats: { Body: ["CRIT Rate"] },
      cavernSetA: 101,
      cavernMode: "fourPiece" as const,
      equippedRelics: [],
    };
    const head = {
      slot: "Head",
      mainStat: "HP",
      setId: 101,
      itemId: 40,
      substats: [
        { key: "CRIT Rate", count: 2, step: 3 },
        { key: "CRIT DMG", count: 1, step: 2 },
      ],
    };
    const hands = {
      slot: "Hands",
      mainStat: "ATK",
      setId: 101,
      itemId: 41,
      substats: [
        { key: "CRIT DMG", count: 2, step: 3 },
        { key: "SPD", count: 1, step: 1 },
      ],
    };
    const upgrades = scanUpgradeRecommendations([head, hands], [plan]);
    expect(upgrades.map((r) => r.relic.itemId)).toContain(40);
    expect(upgrades.map((r) => r.relic.itemId)).toContain(41);
  });

  it("scanUpgradeRecommendations matches both sets in 2+2 mode", () => {
    const plan = {
      characterId: 1,
      planLabel: "测试",
      substatWeights: critWeights,
      mainStats: { Body: ["CRIT Rate"] },
      cavernMode: "twoPlusTwo" as const,
      cavernSetA: 101,
      cavernSetB: 102,
      equippedRelics: [],
    };
    const setA = {
      slot: "Body",
      mainStat: "CRIT Rate",
      setId: 101,
      itemId: 50,
      substats: [{ key: "CRIT DMG", count: 2, step: 3 }],
    };
    const setB = {
      slot: "Body",
      mainStat: "CRIT Rate",
      setId: 102,
      itemId: 51,
      substats: [{ key: "ATK%", count: 2, step: 3 }],
    };
    const setC = {
      slot: "Body",
      mainStat: "CRIT Rate",
      setId: 999,
      itemId: 52,
      substats: [{ key: "CRIT DMG", count: 3, step: 5 }],
    };
    const upgrades = scanUpgradeRecommendations([setA, setB, setC], [plan]);
    const ids = upgrades.map((r) => r.relic.itemId);
    expect(ids).toContain(50);
    expect(ids).toContain(51);
    expect(ids).not.toContain(52);
  });

  it("scanUpgradeRecommendations allows any set when plan has no set configured", () => {
    const plan = {
      characterId: 1,
      planLabel: "测试",
      substatWeights: critWeights,
      mainStats: { Body: ["CRIT Rate"] },
      cavernSetA: 0,
      planarSetId: 0,
      equippedRelics: [],
    };
    const anySet = {
      slot: "Body",
      mainStat: "CRIT Rate",
      setId: 777,
      itemId: 60,
      substats: [{ key: "CRIT DMG", count: 2, step: 3 }],
    };
    const upgrades = scanUpgradeRecommendations([anySet], [plan]);
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0]?.relic.itemId).toBe(60);
  });

  it("scanUpgradeRecommendations skips candidate with missing setId when plan targets sets", () => {
    const plan = {
      characterId: 1,
      planLabel: "测试",
      substatWeights: critWeights,
      mainStats: { Body: ["CRIT Rate"] },
      cavernMode: "fourPiece" as const,
      cavernSetA: 101,
      equippedRelics: [],
    };
    const noSetId = {
      slot: "Body",
      mainStat: "CRIT Rate",
      itemId: 70,
      substats: [{ key: "CRIT DMG", count: 3, step: 5 }],
    };
    const upgrades = scanUpgradeRecommendations([noSetId], [plan]);
    expect(upgrades).toEqual([]);
  });

  it("scanUpgradeRecommendations picks best delta across multiple plans", () => {
    const weakPlan = {
      characterId: 1,
      planLabel: "弱方案",
      substatWeights: { ...critWeights, "CRIT DMG": 0.3 },
      mainStats: { Body: ["CRIT Rate"] },
      cavernSetA: 101,
      cavernMode: "fourPiece" as const,
      equippedRelics: [
        {
          slot: "Body",
          mainStat: "CRIT Rate",
          setId: 101,
          substats: [{ key: "ATK%", count: 1, step: 1 }],
        },
      ],
    };
    const strongPlan = {
      characterId: 2,
      planLabel: "强方案",
      substatWeights: critWeights,
      mainStats: { Body: ["CRIT Rate"] },
      cavernSetA: 101,
      cavernMode: "fourPiece" as const,
      equippedRelics: [],
    };
    const candidate = {
      slot: "Body",
      mainStat: "CRIT Rate",
      setId: 101,
      itemId: 80,
      substats: [
        { key: "CRIT DMG", count: 3, step: 4 },
        { key: "ATK%", count: 2, step: 3 },
      ],
    };
    const upgrades = scanUpgradeRecommendations([candidate], [weakPlan, strongPlan]);
    expect(upgrades).toHaveLength(1);
    // strongPlan has empty slot (base=0) so delta is the full score → larger delta wins
    expect(upgrades[0]?.characterId).toBe(2);
    expect(upgrades[0]?.planLabel).toBe("强方案");
  });

  it("scoreRelicForPlans returns byPlan in original insertion order (no sort side-effect)", () => {
    const plans = [
      {
        characterId: 1,
        planLabel: "A",
        substatWeights: { ...critWeights, "CRIT DMG": 0.1 },
      },
      {
        characterId: 2,
        planLabel: "B",
        substatWeights: critWeights,
      },
      {
        characterId: 3,
        planLabel: "C",
        substatWeights: { ...critWeights, "CRIT Rate": 0.1 },
      },
    ];
    const relic = {
      slot: "Head" as const,
      mainStat: "HP",
      substats: [
        { key: "CRIT DMG", count: 2, step: 3 },
        { key: "ATK%", count: 1, step: 1 },
      ],
    };
    const result = scoreRelicForPlans(relic, plans);
    expect(result.byPlan.map((p) => p.planLabel)).toEqual(["A", "B", "C"]);
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
