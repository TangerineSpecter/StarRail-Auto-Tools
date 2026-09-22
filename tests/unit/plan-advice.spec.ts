import { describe, expect, it } from "vitest";
import {
  applyAdviceField,
  applyAdviceSelections,
  buildAdviceCompareRows,
  defaultAdviceSelections,
  sanitizeAdvicePlan,
  snapWeight,
} from "@/features/build-planner/plan-advice";
import type { CharacterBuildPlan } from "@/types";

function plan(overrides: Partial<CharacterBuildPlan> = {}): CharacterBuildPlan {
  return {
    characterId: 1220,
    cavernMode: "fourPiece",
    cavernSetA: 101,
    cavernSetB: null,
    planarSetId: 301,
    mainStats: { Body: ["CRIT Rate"], Feet: ["SPD"], PlanarSphere: [], LinkRope: [] },
    targets: [{ statKey: "SPD", target: 134, minimum: 120, priority: 1 }],
    effectiveSubstats: ["SPD"],
    note: "",
    substatWeights: { SPD: 1, "CRIT Rate": 0.5 },
    minPotentialPct: 40,
    spdTarget: 134,
    ...overrides,
  };
}

describe("plan advice sanitization", () => {
  it("snaps illegal weights onto the 0.25 form step and keeps at most five", () => {
    expect(snapWeight(0.3)).toBe(0.25);
    expect(snapWeight(0.4)).toBe(0.5);
    const sanitized = sanitizeAdvicePlan({
      cavernMode: "fourPiece",
      cavern: "云无留迹的过客",
      planar: "不存在的套装",
      mainStats: { 躯干: "暴击率", Feet: ["SPD", "not-a-stat"] },
      substatWeights: {
        暴击率: 0.3,
        暴击伤害: 0.4,
        SPD: 1,
        ATK: 1,
        HP: 1,
        DEF: 1,
        "ATK%": 1,
      },
      targets: [{ statKey: "速度", target: 134, minimum: 200 }],
      effectiveSubstats: ["SPD", "暴击率", "ATK%", "HP", "DEF", "CRIT DMG"],
    });
    expect(sanitized.cavernSetA).toBe(101);
    expect(sanitized.planarSetId).toBe(0);
    expect(sanitized.mainStats.Body).toEqual(["CRIT Rate"]);
    expect(sanitized.mainStats.Feet).toEqual(["SPD"]);
    expect(sanitized.substatWeights.SPD).toBe(1);
    expect(Object.keys(sanitized.substatWeights)).toHaveLength(5);
    expect(
      sanitizeAdvicePlan({ substatWeights: { 暴击率: 0.3, 暴击伤害: 0.4 } }).substatWeights,
    ).toEqual({
      "CRIT Rate": 0.25,
      "CRIT DMG": 0.5,
    });
    expect(sanitized.targets[0]).toMatchObject({ statKey: "SPD", target: 134, minimum: 134 });
    expect(sanitized.effectiveSubstats).toHaveLength(5);
  });
});

describe("plan advice comparison", () => {
  it("lets the user keep the current cavern set while taking AI weights one by one", () => {
    const current = plan();
    const recommended = sanitizeAdvicePlan({
      cavernMode: "fourPiece",
      cavernSetA: 102,
      planarSetId: 301,
      mainStats: { Body: ["CRIT DMG"], Feet: ["SPD"] },
      substatWeights: { SPD: 0.75, "CRIT Rate": 1 },
      targets: [{ statKey: "CRIT DMG", target: 160, minimum: 140 }],
    });
    const rows = buildAdviceCompareRows(current, recommended);
    const cavern = rows.find((row) => row.key === "cavernSetA");
    const spdWeight = rows.find((row) => row.key === "weight.SPD");
    expect(cavern?.equal).toBe(false);
    expect(spdWeight?.aiLabel).toBe("0.75");
    const selections = defaultAdviceSelections(rows);
    expect(selections.cavernSetA).toBe("current");
    expect(selections["weight.SPD"]).toBe("current");
    const applied = applyAdviceSelections(current, recommended, {
      ...selections,
      cavernSetA: "current",
      "weight.SPD": "ai",
      "weight.CRIT Rate": "ai",
    });
    expect(applied.cavernSetA).toBe(101);
    expect(applied.substatWeights.SPD).toBe(0.75);
    expect(applied.substatWeights["CRIT Rate"]).toBe(1);
  });

  it("treats main stats with the same keys in a different order as equal", () => {
    const current = plan({
      mainStats: {
        Body: ["ATK%", "Effect Hit Rate"],
        Feet: ["SPD"],
        PlanarSphere: [],
        LinkRope: [],
      },
    });
    const recommended = sanitizeAdvicePlan({
      mainStats: { Body: ["Effect Hit Rate", "ATK%"], Feet: ["SPD"] },
    });
    const body = buildAdviceCompareRows(current, recommended).find(
      (row) => row.key === "mainStats.Body",
    );
    expect(body?.equal).toBe(true);
    expect(body?.currentLabel).toBe(body?.aiLabel);
  });

  it("reads inferred form weights and writes spdTarget immediately", () => {
    const current = plan({
      substatWeights: {},
      effectiveSubstats: ["SPD", "ATK%", "Effect Hit Rate"],
    });
    const recommended = sanitizeAdvicePlan({
      substatWeights: { SPD: 1, "ATK%": 1, "Effect Hit Rate": 1 },
      spdTarget: 136,
    });
    const spdWeight = buildAdviceCompareRows(current, recommended).find(
      (row) => row.key === "weight.SPD",
    );
    expect(spdWeight?.currentLabel).not.toBe("未设置");
    applyAdviceField(current, recommended, "spdTarget");
    expect(current.spdTarget).toBe(136);
  });

  it("corrects Kafka DoT weights away from crit and break", () => {
    const planDraft = sanitizeAdvicePlan(
      {
        substatWeights: { "CRIT DMG": 1, "Break Effect": 0.75, SPD: 0.5 },
        effectiveSubstats: ["CRIT DMG", "Break Effect", "SPD"],
      },
      { name: "卡芙卡" },
    );
    expect(planDraft.substatWeights["Effect Hit Rate"]).toBe(1);
    expect(planDraft.substatWeights["ATK%"]).toBe(1);
    expect(planDraft.effectiveSubstats).toEqual(["ATK%", "Effect Hit Rate", "SPD"]);
    expect(planDraft.effectiveSubstats).not.toContain("CRIT DMG");
    expect(planDraft.effectiveSubstats).not.toContain("Break Effect");
  });
});
