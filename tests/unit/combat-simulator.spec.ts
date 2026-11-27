import { describe, expect, it } from "vitest";
import { mechanicCatalogue } from "@/shared/catalogue/mechanics";
import {
  buildCharacterCombatProfile,
  calculateBreakDamage,
  calculateDirectDamage,
  calculateElationDamage,
  calculateSuperBreakDamage,
  DEFAULT_ENEMY_PRESET,
  evaluateCharacterSkillPreviews,
  evaluateSingleCharacterSnapshot,
  formatDamageCompact,
  resolveCombatantFromCharacter,
  runMonteCarloSimulation,
  runSingleBattle,
  type CombatantInput,
} from "@/shared/utils/combat";

function makeCombatant(
  overrides: Partial<CombatantInput> & { characterId: number; name: string },
): CombatantInput {
  return {
    variantKey: `hsr/${overrides.characterId}/destruction/base`,
    element: "fire",
    path: "毁灭",
    level: 80,
    eidolon: 0,
    abilityVersion: 1,
    skills: { basic: 6, skill: 10, ult: 10, talent: 10 },
    traces: {},
    maxEnergy: 120,
    sets: [],
    lightCone: null,
    ...overrides,
    standing: {
      level: 80,
      base: { hp: 2000, atk: 1100, def: 1000, speed: 104 },
      hp: 3200,
      atk: 2550,
      def: 1100,
      speed: 161,
      critRate: 0.5,
      critDamage: 1.0,
      breakEffect: 2.25,
      effectHitRate: 0.1,
      effectRes: 0.2,
      energyRegenRate: 0,
      healingBoost: 0,
      elation: 0,
      genericDamageBoost: 0,
      elementalDamageBoost: {},
      abilityDamageBoost: {},
      breakDamageBoost: 0,
      defensePenetration: 0,
      superBreakDefensePenetration: 0,
      resistancePenetration: 0,
      vulnerability: 0,
      breakVulnerability: 0,
      finalDamageBoost: 0,
      trueDamageModifier: 0,
      breakEfficiencyBoost: 0,
      superBreakModifier: 0,
      ...(overrides.standing ?? {}),
    },
  };
}

describe("combat damage formulas (aligned with docs/伤害计算功能设计.md)", () => {
  it("matches section 10.1 direct damage numerical baseline within 1e-6", () => {
    const result = calculateDirectDamage({
      element: "fire",
      attackerLevel: 80,
      enemyLevel: 95,
      atk: 3000,
      hp: 0,
      def: 0,
      atkScaling: 2.0,
      critRate: 0.7,
      critDamage: 1.4,
      genericDamageBoost: 0.5,
      elementDamageBoost: 0.2,
      defensePenetration: 0.2,
      enemyResistance: 0.2,
      resistancePenetration: 0.1,
      vulnerability: 0.15,
      finalDamageBoost: 0.1,
      weaknessBroken: false,
    });
    expect(result.expectedDamage).toBeCloseTo(10778.0371875, 5);
    expect(result.critDamage).toBeGreaterThan(result.expectedDamage);
    expect(result.expectedDamage).toBeGreaterThan(result.nonCritDamage);
  });

  it("matches section 10.2 physical break & super break baselines", () => {
    const breakRes = calculateBreakDamage({
      element: "physical",
      attackerLevel: 80,
      enemyLevel: 95,
      enemyMaxToughness: 360,
      breakEffect: 1.5,
      defensePenetration: 0,
      enemyResistance: 0.2,
      resistancePenetration: 0,
      vulnerability: 0,
      weaknessBrokenAtResolution: true,
    });
    expect(breakRes.expectedDamage).toBeCloseTo(24532.90520930233, 4);

    const sbRes = calculateSuperBreakDamage({
      element: "fire",
      attackerLevel: 80,
      enemyLevel: 95,
      toughnessDamage: 20,
      fixedToughnessDamage: 0,
      breakEfficiencyBoost: 0.5,
      breakEffect: 1.5,
      superBreakModifier: 1.0,
      defensePenetration: 0,
      enemyResistance: 0.2,
      resistancePenetration: 0,
      vulnerability: 0,
      weaknessBroken: true,
    });
    expect(sbRes.expectedDamage).toBeCloseTo(10514.10223255814, 4);
  });

  it("enforces boundaries for crit, def pen, resistance, vuln, and unbroken super break", () => {
    const unbrokenSb = calculateSuperBreakDamage({
      element: "fire",
      attackerLevel: 80,
      enemyLevel: 95,
      toughnessDamage: 30,
      breakEfficiencyBoost: 0.5,
      breakEffect: 2.0,
      superBreakModifier: 1.0,
      defensePenetration: 0,
      enemyResistance: 0,
      resistancePenetration: 0,
      vulnerability: 0,
      weaknessBroken: false,
    });
    expect(unbrokenSb.actualDamage).toBe(0);
    expect(unbrokenSb.inactiveReason).toBe("enemy-not-broken");

    // Dahlia zone allows Super Break on unbroken targets
    const dahliaZoneSb = calculateSuperBreakDamage({
      element: "fire",
      attackerLevel: 80,
      enemyLevel: 95,
      toughnessDamage: 30,
      breakEfficiencyBoost: 0.5,
      breakEffect: 2.0,
      superBreakModifier: 1.0,
      defensePenetration: 0,
      enemyResistance: 0,
      resistancePenetration: 0,
      vulnerability: 0,
      weaknessBroken: false,
      allowWhileUnbroken: true,
    });
    expect(dahliaZoneSb.actualDamage).toBeGreaterThan(0);

    // Elation damage ignores generic DMG boost and respects punchline formula
    const elation = calculateElationDamage({
      element: "quantum",
      attackerLevel: 80,
      enemyLevel: 80,
      elationScaling: 1.0,
      elation: 0.5,
      punchline: 60,
      critRate: 1.2, // clamped to 1
      critDamage: 1.0,
      defensePenetration: 1.5, // clamped to 1 -> defMulti = 1
      enemyResistance: 0,
      resistancePenetration: 0,
      vulnerability: 5.0, // clamped to 2.5 -> 3.5x
      weaknessBroken: true,
    });
    expect(elation.defenseMultiplier).toBeCloseTo(1.0, 6);
    expect(elation.vulnerabilityMultiplier).toBeCloseTo(3.5, 6);
    expect(elation.critMultiplier).toBeCloseTo(2.0, 6);
  });
});

describe("character variant isolation & lightweight combat simulator", () => {
  it("isolates multi-path Trailblazer & March 7th variants by characterId", () => {
    const hmc = makeCombatant({
      characterId: 8005,
      name: "开拓者·同谐",
      element: "imaginary",
      path: "同谐",
    });
    const dmc = makeCombatant({
      characterId: 8001,
      name: "开拓者·毁灭",
      element: "physical",
      path: "毁灭",
    });
    const p1 = buildCharacterCombatProfile(hmc);
    const p2 = buildCharacterCombatProfile(dmc);
    expect(p1.modelingDepth).toBe("deep");
    expect(p2.modelingDepth).toBe("generic");
    expect(p1.skill.id).not.toBe(p2.skill.id);
    expect(p1.maxEnergy).not.toBe(p2.maxEnergy);
  });

  it("simulates Firefly solo vs full Super Break team (Firefly + Lingsha + Fugue + Dahlia)", () => {
    const firefly = makeCombatant({
      characterId: 1310,
      name: "流萤",
      element: "fire",
      path: "毁灭",
      abilityVersion: 1,
      sets: [
        { setId: 119, name: "荡除蠹灾的铁骑", pieces: 4 },
        { setId: 316, name: "劫火莲灯铸炼宫", pieces: 2 },
      ],
      lightCone: {
        templateId: 24000,
        name: "记一位星神的陨落",
        superimposition: 5,
        level: 80,
        ascension: 6,
      },
    });
    const lingsha = makeCombatant({
      characterId: 1222,
      name: "灵砂",
      element: "fire",
      path: "丰饶",
      standing: { ...firefly.standing, atk: 2400, speed: 152, breakEffect: 1.6 },
    });
    const fugue = makeCombatant({
      characterId: 1225,
      name: "忘归人",
      element: "fire",
      path: "虚无",
      standing: { ...firefly.standing, atk: 2100, speed: 155, breakEffect: 2.3 },
    });
    const dahlia = makeCombatant({
      characterId: 1321,
      name: "大丽花",
      element: "fire",
      path: "虚无",
      standing: { ...firefly.standing, atk: 2600, speed: 150, breakEffect: 2.4 },
    });

    const soloSnapshot = evaluateSingleCharacterSnapshot(firefly, DEFAULT_ENEMY_PRESET);
    expect(soloSnapshot.modelingDepth).toBe("deep");
    expect(soloSnapshot.coreSkillExpected).toBeGreaterThan(50_000);
    expect(soloSnapshot.fiveCycleMean).toBeGreaterThan(soloSnapshot.comboDamage);
    expect(soloSnapshot.fiveCycleP90).toBeGreaterThanOrEqual(soloSnapshot.fiveCycleP10);

    const teamMc = runMonteCarloSimulation(
      [firefly, lingsha, fugue, dahlia],
      { cycles: 5, enemy: DEFAULT_ENEMY_PRESET, seed: 42 },
      16,
      true,
    );
    // Team synergy should vastly outperform solo Firefly
    expect(teamMc.meanDamage).toBeGreaterThan(soloSnapshot.fiveCycleMean * 2);
    expect(teamMc.byKindMean.superBreak).toBeGreaterThan(teamMc.byKindMean.direct);
    expect(teamMc.cycleComparisons.map((c) => c.cycles)).toEqual([1, 3, 5, 10]);
    expect(teamMc.cycleComparisons[3]!.meanDamage).toBeGreaterThan(
      teamMc.cycleComparisons[2]!.meanDamage,
    );
    expect(teamMc.cycleComparisons[2]!.meanDamage).toBeGreaterThan(
      teamMc.cycleComparisons[1]!.meanDamage,
    );
    expect(teamMc.cycleComparisons[1]!.meanDamage).toBeGreaterThan(
      teamMc.cycleComparisons[0]!.meanDamage,
    );

    // Same seed is deterministic and reproducible
    const runA = runSingleBattle([firefly, lingsha, fugue, dahlia], {
      cycles: 5,
      enemy: DEFAULT_ENEMY_PRESET,
      seed: 12345,
    });
    const runB = runSingleBattle([firefly, lingsha, fugue, dahlia], {
      cycles: 5,
      enemy: DEFAULT_ENEMY_PRESET,
      seed: 12345,
    });
    expect(runA.totalDamage).toBeCloseTo(runB.totalDamage, 6);
    expect(runA.logs.length).toBe(runB.logs.length);
    expect(runA.breakCount).toBeGreaterThan(0);
  });

  it("resolves generic characters safely without throwing and formats compact damage", () => {
    const resolved = resolveCombatantFromCharacter({
      characterId: 1003,
      name: "姬子",
      path: "智识",
      level: 80,
      ascension: 6,
      eidolon: 1,
      skills: { basic: 6, skill: 10, ult: 10, talent: 10 },
      equippedLightCone: { templateId: 23000, level: 80, ascension: 6, superimposition: 1 },
      equippedRelics: [
        {
          setId: 115,
          slot: "Head",
          mainStat: "HP",
          mainStatValue: 705.6,
          substats: [{ kind: "normal", key: "CRIT Rate_", value: 12 }],
        },
        {
          setId: 115,
          slot: "Hands",
          mainStat: "ATK",
          mainStatValue: 352.8,
          substats: [{ kind: "normal", key: "CRIT DMG_", value: 24 }],
        },
        { setId: 115, slot: "Body", mainStat: "CRIT Rate_", mainStatValue: 32.4, substats: [] },
        { setId: 115, slot: "Feet", mainStat: "SPD", mainStatValue: 25, substats: [] },
        {
          setId: 306,
          slot: "PlanarSphere",
          mainStat: "Fire DMG Boost",
          mainStatValue: 38.88,
          substats: [],
        },
        { setId: 306, slot: "LinkRope", mainStat: "ATK_", mainStatValue: 43.2, substats: [] },
      ],
    });
    expect(resolved.available).toBe(true);
    const previews = evaluateCharacterSkillPreviews(resolved.combatant!);
    expect(previews.length).toBeGreaterThanOrEqual(3);
    expect(formatDamageCompact(1542000)).toBe("154.2万");
    expect(formatDamageCompact(8540)).toBe("8,540");
  });

  it("sanity-checks Lingsha Fuyuan & Dahlia FUA multipliers stay within realistic bounds", () => {
    const lingsha = makeCombatant({
      characterId: 1222,
      name: "灵砂",
      element: "fire",
      path: "丰饶",
      standing: {
        level: 80,
        base: { hp: 2000, atk: 1100, def: 1000, speed: 98 },
        hp: 3000,
        atk: 2400,
        def: 1000,
        speed: 152,
        critRate: 0.2,
        critDamage: 0.7,
        breakEffect: 1.6,
        effectHitRate: 0,
        effectRes: 0.3,
        energyRegenRate: 0,
        healingBoost: 0,
        elation: 0,
        genericDamageBoost: 0,
        elementalDamageBoost: {},
        abilityDamageBoost: {},
        breakDamageBoost: 0,
        defensePenetration: 0,
        superBreakDefensePenetration: 0,
        resistancePenetration: 0,
        vulnerability: 0,
        breakVulnerability: 0,
        finalDamageBoost: 0,
        trueDamageModifier: 0,
        breakEfficiencyBoost: 0,
        superBreakModifier: 0,
      },
    });
    const dahlia = makeCombatant({
      characterId: 1321,
      name: "大丽花",
      element: "fire",
      path: "虚无",
      standing: { ...lingsha.standing, atk: 2500, breakEffect: 2.4 },
    });
    const lp = buildCharacterCombatProfile(lingsha);
    const dp = buildCharacterCombatProfile(dahlia);
    expect(lp.fua?.mainScaling).toBeCloseTo(0.75, 2);
    expect(dp.fua?.mainScaling).toBeCloseTo(0.3, 2);
    expect(dp.ult.mainScaling).toBeCloseTo(3.0, 2);
  });

  it("smoke-tests all 99 bundled characters without infinite loops or NaN damage", () => {
    const owners = (mechanicCatalogue.owners ?? []).filter((o) => o.sourceKind === "character");
    expect(owners).toHaveLength(99);
    for (const owner of owners) {
      const id = Number(owner.gameId);
      const input = makeCombatant({
        characterId: id,
        name: owner.name,
        variantKey: owner.variantKey ?? `hsr/${id}/unknown/base`,
      });
      const run = runSingleBattle([input], { cycles: 5, enemy: DEFAULT_ENEMY_PRESET, seed: 7 });
      expect(Number.isFinite(run.totalDamage), owner.name).toBe(true);
      expect(run.totalDamage, owner.name).toBeGreaterThanOrEqual(0);
      expect(run.logs.length, owner.name).toBeGreaterThan(0);
    }
  });
});
