import { describe, expect, it } from "vitest";
import {
  formatScorePct,
  scoreEquippedRelics,
  scoreFromDashboardEntry,
} from "@/features/team/team-member-score";
import type { BuildDashboardEntry, CharacterBuildPlan } from "@/types";

function plan(overrides: Partial<CharacterBuildPlan> = {}): CharacterBuildPlan {
  return {
    characterId: 1001,
    cavernMode: "fourPiece",
    cavernSetA: 101,
    cavernSetB: null,
    planarSetId: 201,
    mainStats: {
      Body: ["CRIT Rate"],
      Feet: ["SPD"],
      PlanarSphere: ["Lightning DMG Boost"],
      LinkRope: ["ATK%"],
    },
    targets: [],
    effectiveSubstats: ["CRIT Rate", "CRIT DMG", "SPD", "ATK%"],
    note: "",
    substatWeights: {
      "CRIT Rate": 1,
      "CRIT DMG": 1,
      SPD: 1,
      "ATK%": 0.75,
    },
    minPotentialPct: 40,
    spdTarget: 0,
    ...overrides,
  };
}

function entry(withRelics: boolean): BuildDashboardEntry {
  return {
    plan: plan(),
    character: {
      characterId: 1001,
      name: "卡芙卡",
      level: 80,
      ascension: 6,
      equippedRelics: withRelics
        ? [
            {
              setId: 101,
              slot: "Head",
              mainStat: "HP",
              mainStatValue: 700,
              substats: [
                { kind: "sub", key: "CRIT Rate", value: 8, count: 2, step: 1 },
                { kind: "sub", key: "CRIT DMG", value: 12, count: 2, step: 1 },
              ],
            },
            {
              setId: 101,
              slot: "Body",
              mainStat: "CRIT Rate",
              mainStatValue: 32,
              substats: [{ kind: "sub", key: "SPD", value: 4, count: 1, step: 1 }],
            },
          ]
        : [],
    },
    displayOrder: 0,
    pinned: false,
  };
}

describe("team-member-score", () => {
  it("returns null when no relics are equipped", () => {
    expect(scoreFromDashboardEntry(entry(false))).toBeNull();
  });

  it("computes letter grade, potential and completion from dashboard entry", () => {
    const score = scoreFromDashboardEntry(entry(true));
    expect(score).not.toBeNull();
    expect(score!.relicCount).toBe(2);
    expect(score!.hasPlan).toBe(true);
    expect(score!.letterGrade).toMatch(/^[SABCDEF][+-]?$/);
    expect(score!.potentialPct).toBeGreaterThanOrEqual(0);
    expect(score!.completionPct).toBeGreaterThanOrEqual(0);
    expect(score!.completionPct).toBeLessThanOrEqual(100);
  });

  it("scores without a plan using default weights like character detail", () => {
    const relics = entry(true).character.equippedRelics ?? [];
    const score = scoreEquippedRelics(relics, null);
    expect(score).not.toBeNull();
    expect(score!.hasPlan).toBe(false);
    expect(score!.relicCount).toBe(2);
    expect(score!.letterGrade).toMatch(/^[SABCDEF][+-]?$/);
  });

  it("formats percents", () => {
    expect(formatScorePct(71.4)).toBe("71%");
    expect(formatScorePct(Number.NaN)).toBe("—");
  });
});
