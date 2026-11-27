import type { AbilityKind, CombatElement, DamageBreakdown, DamageKind } from "./types";

/** Level 80 base break damage constant aligned with docs/伤害计算功能设计.md. */
export const BREAK_BASE_CONSTANT_LV80 = 3767.5533;
/** Level 80 base elation damage constant aligned with docs/欢愉与速度公式说明.md. */
export const ELATION_BASE_CONSTANT_LV80 = 7535.107;

export const ELEMENT_BREAK_SCALING: Readonly<Record<CombatElement, number>> = {
  physical: 2.0,
  fire: 2.0,
  ice: 1.0,
  lightning: 1.0,
  wind: 1.5,
  quantum: 0.5,
  imaginary: 0.5,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateDefenseMultiplier(
  attackerLevel: number,
  enemyLevel: number,
  defensePenetration: number,
): number {
  const levelConstant = attackerLevel + 20;
  const effectiveDefRatio = Math.max(0, 1 - defensePenetration);
  return levelConstant / ((enemyLevel + 20) * effectiveDefRatio + levelConstant);
}

export function calculateResistanceMultiplier(
  enemyResistance: number,
  resistancePenetration: number,
): number {
  const effectiveResistance = clamp(enemyResistance - resistancePenetration, -1.0, 0.9);
  return 1 - effectiveResistance;
}

export function calculateVulnerabilityMultiplier(vulnerability: number): number {
  return 1 + clamp(vulnerability, 0, 2.5);
}

export function calculateBrokenMultiplier(weaknessBroken: boolean): number {
  return weaknessBroken ? 1.0 : 0.9;
}

export interface DirectDamageInput {
  element: CombatElement;
  damageKind?: "direct" | "additional";
  abilityKind?: AbilityKind;
  attackerLevel: number;
  enemyLevel: number;
  atk: number;
  hp: number;
  def: number;
  atkScaling: number;
  hpScaling?: number;
  defScaling?: number;
  flatBaseDamage?: number;
  critRate: number;
  critDamage: number;
  genericDamageBoost: number;
  elementDamageBoost: number;
  hitSpecificDamageBoost?: number;
  defensePenetration: number;
  enemyResistance: number;
  resistancePenetration: number;
  vulnerability: number;
  finalDamageBoost?: number;
  trueDamageModifier?: number;
  weaknessBroken: boolean;
  /** Optional random number in [0, 1). When omitted, actualDamage equals expectedDamage. */
  critRoll?: number;
  coefficient?: number;
}

export function calculateDirectDamage(input: DirectDamageInput): DamageBreakdown {
  const baseDamage = Math.max(
    0,
    input.atk * input.atkScaling +
      input.hp * (input.hpScaling ?? 0) +
      input.def * (input.defScaling ?? 0) +
      (input.flatBaseDamage ?? 0),
  );
  const brokenMultiplier = calculateBrokenMultiplier(input.weaknessBroken);
  const defenseMultiplier = calculateDefenseMultiplier(
    input.attackerLevel,
    input.enemyLevel,
    input.defensePenetration,
  );
  const resistanceMultiplier = calculateResistanceMultiplier(
    input.enemyResistance,
    input.resistancePenetration,
  );
  const vulnerabilityMultiplier = calculateVulnerabilityMultiplier(input.vulnerability);
  const damageBoostMultiplier = Math.max(
    0,
    1 + input.genericDamageBoost + input.elementDamageBoost + (input.hitSpecificDamageBoost ?? 0),
  );
  const finalDamageMultiplier = Math.max(0, 1 + (input.finalDamageBoost ?? 0));
  const trueDamageMultiplier = Math.max(0, 1 + (input.trueDamageModifier ?? 0));
  const coefficient = input.coefficient ?? 1;

  const effectiveCritRate = clamp(input.critRate, 0, 1);
  const effectiveCritDamage = Math.max(-1, input.critDamage);
  const expectedCritMultiplier = 1 + effectiveCritRate * effectiveCritDamage;

  const preCrit =
    baseDamage *
    brokenMultiplier *
    defenseMultiplier *
    resistanceMultiplier *
    vulnerabilityMultiplier *
    damageBoostMultiplier *
    finalDamageMultiplier *
    trueDamageMultiplier *
    coefficient;

  const nonCritDamage = preCrit;
  const critDamage = preCrit * (1 + effectiveCritDamage);
  const expectedDamage = preCrit * expectedCritMultiplier;

  let actualDamage = expectedDamage;
  let didCrit = false;
  if (input.critRoll !== undefined) {
    didCrit = input.critRoll < effectiveCritRate;
    actualDamage = didCrit ? critDamage : nonCritDamage;
  }

  return {
    damageKind: input.damageKind ?? "direct",
    element: input.element,
    baseDamage,
    brokenMultiplier,
    defenseMultiplier,
    resistanceMultiplier,
    vulnerabilityMultiplier,
    damageBoostMultiplier,
    finalDamageMultiplier,
    trueDamageMultiplier,
    critMultiplier: expectedCritMultiplier,
    nonCritDamage,
    critDamage,
    expectedDamage,
    actualDamage,
    didCrit,
  };
}

export interface DotDamageInput {
  element: CombatElement;
  attackerLevel: number;
  enemyLevel: number;
  atk: number;
  atkScaling: number;
  genericDamageBoost: number;
  elementDamageBoost: number;
  hitSpecificDamageBoost?: number;
  defensePenetration: number;
  enemyResistance: number;
  resistancePenetration: number;
  vulnerability: number;
  finalDamageBoost?: number;
  trueDamageModifier?: number;
  weaknessBroken: boolean;
  tickCoefficient?: number;
}

export function calculateDotDamage(input: DotDamageInput): DamageBreakdown {
  const baseDamage = Math.max(0, input.atk * input.atkScaling);
  const brokenMultiplier = calculateBrokenMultiplier(input.weaknessBroken);
  const defenseMultiplier = calculateDefenseMultiplier(
    input.attackerLevel,
    input.enemyLevel,
    input.defensePenetration,
  );
  const resistanceMultiplier = calculateResistanceMultiplier(
    input.enemyResistance,
    input.resistancePenetration,
  );
  const vulnerabilityMultiplier = calculateVulnerabilityMultiplier(input.vulnerability);
  const damageBoostMultiplier = Math.max(
    0,
    1 + input.genericDamageBoost + input.elementDamageBoost + (input.hitSpecificDamageBoost ?? 0),
  );
  const finalDamageMultiplier = Math.max(0, 1 + (input.finalDamageBoost ?? 0));
  const trueDamageMultiplier = Math.max(0, 1 + (input.trueDamageModifier ?? 0));
  const tick = input.tickCoefficient ?? 1;

  const amount =
    baseDamage *
    brokenMultiplier *
    defenseMultiplier *
    resistanceMultiplier *
    vulnerabilityMultiplier *
    damageBoostMultiplier *
    finalDamageMultiplier *
    trueDamageMultiplier *
    tick;

  return {
    damageKind: "dot",
    element: input.element,
    baseDamage,
    brokenMultiplier,
    defenseMultiplier,
    resistanceMultiplier,
    vulnerabilityMultiplier,
    damageBoostMultiplier,
    finalDamageMultiplier,
    trueDamageMultiplier,
    critMultiplier: 1,
    nonCritDamage: amount,
    critDamage: amount,
    expectedDamage: amount,
    actualDamage: amount,
    didCrit: false,
  };
}

export interface BreakDamageInput {
  element: CombatElement;
  attackerLevel: number;
  enemyLevel: number;
  enemyMaxToughness: number;
  breakEffect: number;
  specialScaling?: number;
  hitSpecificDamageBoost?: number;
  defensePenetration: number;
  enemyResistance: number;
  resistancePenetration: number;
  vulnerability: number;
  finalDamageBoost?: number;
  trueDamageModifier?: number;
  weaknessBrokenAtResolution?: boolean;
}

export function calculateBreakDamage(input: BreakDamageInput): DamageBreakdown {
  const elementBreakScaling = ELEMENT_BREAK_SCALING[input.element];
  const specialScaling = input.specialScaling ?? 1;
  const breakBase =
    BREAK_BASE_CONSTANT_LV80 *
    elementBreakScaling *
    (0.5 + input.enemyMaxToughness / 120) *
    specialScaling;
  const breakMulti = Math.max(0, 1 + input.breakEffect);
  const brokenMultiplier = calculateBrokenMultiplier(input.weaknessBrokenAtResolution ?? true);
  const defenseMultiplier = calculateDefenseMultiplier(
    input.attackerLevel,
    input.enemyLevel,
    input.defensePenetration,
  );
  const resistanceMultiplier = calculateResistanceMultiplier(
    input.enemyResistance,
    input.resistancePenetration,
  );
  const vulnerabilityMultiplier = calculateVulnerabilityMultiplier(input.vulnerability);
  const damageBoostMultiplier = Math.max(0, 1 + (input.hitSpecificDamageBoost ?? 0));
  const finalDamageMultiplier = Math.max(0, 1 + (input.finalDamageBoost ?? 0));
  const trueDamageMultiplier = Math.max(0, 1 + (input.trueDamageModifier ?? 0));

  const amount =
    breakBase *
    breakMulti *
    brokenMultiplier *
    defenseMultiplier *
    resistanceMultiplier *
    vulnerabilityMultiplier *
    damageBoostMultiplier *
    finalDamageMultiplier *
    trueDamageMultiplier;

  return {
    damageKind: "break",
    element: input.element,
    baseDamage: breakBase,
    brokenMultiplier,
    defenseMultiplier,
    resistanceMultiplier,
    vulnerabilityMultiplier,
    damageBoostMultiplier,
    finalDamageMultiplier,
    trueDamageMultiplier,
    critMultiplier: 1,
    nonCritDamage: amount,
    critDamage: amount,
    expectedDamage: amount,
    actualDamage: amount,
    didCrit: false,
  };
}

export interface SuperBreakDamageInput {
  element: CombatElement;
  attackerLevel: number;
  enemyLevel: number;
  toughnessDamage: number;
  fixedToughnessDamage?: number;
  breakEfficiencyBoost: number;
  breakEffect: number;
  superBreakModifier: number;
  hitSpecificDamageBoost?: number;
  defensePenetration: number;
  enemyResistance: number;
  resistancePenetration: number;
  vulnerability: number;
  finalDamageBoost?: number;
  trueDamageModifier?: number;
  weaknessBroken: boolean;
  /** Dahlia's skill zone allows converting toughness damage to Super Break even before broken. */
  allowWhileUnbroken?: boolean;
}

export function calculateSuperBreakDamage(input: SuperBreakDamageInput): DamageBreakdown {
  const breakEfficiencyMultiplier = Math.max(0, 1 + input.breakEfficiencyBoost);
  const effectiveToughnessDamage =
    breakEfficiencyMultiplier * Math.max(0, input.toughnessDamage) +
    Math.max(0, input.fixedToughnessDamage ?? 0);
  const superBreakBase = (BREAK_BASE_CONSTANT_LV80 / 10) * effectiveToughnessDamage;
  const defenseMultiplier = calculateDefenseMultiplier(
    input.attackerLevel,
    input.enemyLevel,
    input.defensePenetration,
  );
  const resistanceMultiplier = calculateResistanceMultiplier(
    input.enemyResistance,
    input.resistancePenetration,
  );
  const vulnerabilityMultiplier = calculateVulnerabilityMultiplier(input.vulnerability);
  const damageBoostMultiplier = Math.max(0, 1 + (input.hitSpecificDamageBoost ?? 0));
  const finalDamageMultiplier = Math.max(0, 1 + (input.finalDamageBoost ?? 0));
  const trueDamageMultiplier = Math.max(0, 1 + (input.trueDamageModifier ?? 0));
  const brokenMultiplier = calculateBrokenMultiplier(input.weaknessBroken);

  const canTrigger = input.weaknessBroken || Boolean(input.allowWhileUnbroken);
  let inactiveReason: string | undefined;
  if (!canTrigger) inactiveReason = "enemy-not-broken";
  else if (input.superBreakModifier <= 0) inactiveReason = "modifier-is-zero";
  else if (effectiveToughnessDamage <= 0) inactiveReason = "no-toughness-damage";

  const amount = inactiveReason
    ? 0
    : superBreakBase *
      Math.max(0, 1 + input.breakEffect) *
      input.superBreakModifier *
      brokenMultiplier *
      defenseMultiplier *
      resistanceMultiplier *
      vulnerabilityMultiplier *
      damageBoostMultiplier *
      finalDamageMultiplier *
      trueDamageMultiplier;

  return {
    damageKind: "superBreak",
    element: input.element,
    baseDamage: superBreakBase,
    brokenMultiplier,
    defenseMultiplier,
    resistanceMultiplier,
    vulnerabilityMultiplier,
    damageBoostMultiplier,
    finalDamageMultiplier,
    trueDamageMultiplier,
    critMultiplier: 1,
    nonCritDamage: amount,
    critDamage: amount,
    expectedDamage: amount,
    actualDamage: amount,
    didCrit: false,
    effectiveToughnessDamage,
    effectiveSuperBreakModifier: input.superBreakModifier,
    ...(inactiveReason ? { inactiveReason } : {}),
  };
}

export interface ElationDamageInput {
  element: CombatElement;
  attackerLevel: number;
  enemyLevel: number;
  elationScaling: number;
  elation: number;
  minElationOverride?: number;
  merrymaking?: number;
  punchline?: number;
  critRate: number;
  critDamage: number;
  defensePenetration: number;
  enemyResistance: number;
  resistancePenetration: number;
  vulnerability: number;
  finalDamageBoost?: number;
  trueDamageModifier?: number;
  weaknessBroken: boolean;
  critRoll?: number;
}

export function calculateElationDamage(input: ElationDamageInput): DamageBreakdown {
  const effectiveElation = Math.max(input.elation, input.minElationOverride ?? 0);
  const elationMulti = 1 + effectiveElation;
  const merrymakingMulti = 1 + (input.merrymaking ?? 0);
  const punchline = Math.max(0, input.punchline ?? 0);
  const punchlineMulti = 1 + (5 * punchline) / (punchline + 240);
  const baseDamage =
    ELATION_BASE_CONSTANT_LV80 *
    Math.max(0, input.elationScaling) *
    elationMulti *
    merrymakingMulti *
    punchlineMulti;

  const brokenMultiplier = calculateBrokenMultiplier(input.weaknessBroken);
  const defenseMultiplier = calculateDefenseMultiplier(
    input.attackerLevel,
    input.enemyLevel,
    input.defensePenetration,
  );
  const resistanceMultiplier = calculateResistanceMultiplier(
    input.enemyResistance,
    input.resistancePenetration,
  );
  const vulnerabilityMultiplier = calculateVulnerabilityMultiplier(input.vulnerability);
  const finalDamageMultiplier = Math.max(0, 1 + (input.finalDamageBoost ?? 0));
  const trueDamageMultiplier = Math.max(0, 1 + (input.trueDamageModifier ?? 0));
  const effectiveCritRate = clamp(input.critRate, 0, 1);
  const effectiveCritDamage = Math.max(-1, input.critDamage);
  const expectedCritMultiplier = 1 + effectiveCritRate * effectiveCritDamage;

  const preCrit =
    baseDamage *
    brokenMultiplier *
    defenseMultiplier *
    resistanceMultiplier *
    vulnerabilityMultiplier *
    finalDamageMultiplier *
    trueDamageMultiplier;

  const nonCritDamage = preCrit;
  const critDamage = preCrit * (1 + effectiveCritDamage);
  const expectedDamage = preCrit * expectedCritMultiplier;

  let actualDamage = expectedDamage;
  let didCrit = false;
  if (input.critRoll !== undefined) {
    didCrit = input.critRoll < effectiveCritRate;
    actualDamage = didCrit ? critDamage : nonCritDamage;
  }

  return {
    damageKind: "elation",
    element: input.element,
    baseDamage,
    brokenMultiplier,
    defenseMultiplier,
    resistanceMultiplier,
    vulnerabilityMultiplier,
    damageBoostMultiplier: 1,
    finalDamageMultiplier,
    trueDamageMultiplier,
    critMultiplier: expectedCritMultiplier,
    nonCritDamage,
    critDamage,
    expectedDamage,
    actualDamage,
    didCrit,
  };
}

export function emptyDamageByKind(): Record<DamageKind, number> {
  return {
    direct: 0,
    additional: 0,
    dot: 0,
    break: 0,
    superBreak: 0,
    elation: 0,
  };
}
