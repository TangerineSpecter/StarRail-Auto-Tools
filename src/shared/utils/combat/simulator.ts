import { actionAxisHorizon, actionCycleAt } from "@/shared/utils/action-axis";
import { scenarioRandom } from "@/shared/utils/catalogue-scenario";
import {
  buildCharacterCombatProfile,
  type CharacterCombatProfile,
  type SkillAttackSpec,
} from "./character-profiles";
import { resolveEquipmentCombatProfile, type EquipmentCombatProfile } from "./equipment-rules";
import {
  calculateBreakDamage,
  calculateDirectDamage,
  calculateDotDamage,
  calculateSuperBreakDamage,
  emptyDamageByKind,
} from "./formulas";
import type {
  AbilityKind,
  ActionLogEntry,
  CharacterDamageContribution,
  CharacterDamageSnapshot,
  CombatantInput,
  CombatElement,
  CombatHitRecord,
  CycleDamageComparison,
  DamageBreakdown,
  DamageKind,
  EnemyPreset,
  MonteCarloSummary,
  SimulationConfig,
  SimulationRunResult,
  SkillPreviewResult,
} from "./types";

export const DEFAULT_ENEMY_PRESET: EnemyPreset = {
  level: 95,
  targetCount: 3,
  maxToughness: 120,
  baseResistance: 0.2,
  effectResistance: 0.3,
  enemySpeed: 132,
  weaknessMatched: true,
  initiallyBroken: true,
};

interface EnemyState {
  index: number;
  toughness: number;
  maxToughness: number;
  exoToughness: number;
  exoMaxToughness: number;
  broken: boolean;
  exoBroken: boolean;
  nextAv: number;
  fireWeaknessTurns: number;
  /** Debuffs */
  defDown: number;
  defDownTurns: number;
  /** Dahlia Ult Wilt */
  wiltTurns: number;
  wiltDefDown: number;
  /** Lingsha Befog break vuln */
  befogTurns: number;
  befogBreakVuln: number;
  /** Pela DEF shred */
  pelaDefTurns: number;
  pelaDefDown: number;
  /** Jiaoqiu Ashen Roast */
  ashenVuln: number;
  ashenUltVuln: number;
  /** Gallagher Besotted */
  besottedTurns: number;
  besottedBreakVuln: number;
  /** Aventurine Unnerved */
  unnervedTurns: number;
  /** Light cone debuffs */
  lcVulnTurns: number;
  lcVuln: number;
  lcBreakVulnStacks: number;
  lcBreakVulnPerStack: number;
  /** Firefly LC Routed (per-wearer break vuln) */
  routedTurns: number;
  routedBreakVuln: number;
  /** Dahlia E4 vuln */
  dahliaE4VulnTurns: number;
  /** Himeko Burn DoT */
  burnTurns: number;
  burnAtk: number;
  burnScaling: number;
  burnOwnerId: number;
}

interface AllyRuntime {
  input: CombatantInput;
  profile: CharacterCombatProfile;
  equip: EquipmentCombatProfile;
  energy: number;
  specialStacks: number;
  nextAv: number;
  turnsTaken: number;
  actionsCount: number;
  totalDamage: number;
  byKind: Record<DamageKind, number>;
  /** Firefly Combustion state */
  combustionActive: boolean;
  combustionCountdownAv: number;
  combustionDelayCount: number;
  fireflyE2Cooldown: number;
  /** Lingsha Fuyuan summon */
  fuyuanCount: number;
  fuyuanNextAv: number;
  /** Fugue Torrid Scorch & Foxian Prayer */
  scorchTurns: number;
  foxianTargetId: number | null;
  fugueBreakBuffStacks: number;
  /** Dahlia zone & Dance Partner */
  dahliaZoneTurns: number;
  dahliaPartnerId: number | null;
  dahliaFuaUsedThisTurn: boolean;
  dahliaFuaTotalCount: number;
  dahliaTraceBeShareTurns: number;
  dahliaWeaknessSpdTurns: number;
  /** Ruan Mei Overtone & Ult Field */
  ruanMeiSkillTurns: number;
  ruanMeiUltTurns: number;
  /** HMC Backup Dancer */
  hmcUltTurns: number;
  /** Robin Concerto */
  robinSkillTurns: number;
  robinConcertoActive: boolean;
  robinCountdownAv: number;
  /** Himeko charge & E1 speed */
  himekoCharge: number;
  himekoE1SpdTurns: number;
  /** Gallagher enhanced basic flag */
  gallagherEnhancedReady: boolean;
  /** Feixiao FUA once per turn */
  feixiaoFuaReady: boolean;
  /** Tingyun / Sunday / Bronya / Sparkle / Huohuo / The Herta buffs */
  carryBuffTurns: number;
  ultBuffTurns: number;
  aeonStacks: number;
  aeonBreakDmgTurns: number;
  watchmakerTurns: number;
  lcTeamDmgTurns: number;
}

const MAX_SIM_STEPS = 420;
const ACTION_VALUE_BASE = 10_000;

function pickPrimaryCarryId(allies: AllyRuntime[]): number {
  // Prefer DPS with highest Break Effect or ATK; Firefly/Himeko/Feixiao/Acheron/The Herta prioritized.
  const dps = allies.filter((a) => a.profile.role === "dps");
  const pool = dps.length ? dps : allies;
  return [...pool].sort((a, b) => {
    const scoreA = a.input.standing.atk + a.input.standing.breakEffect * 1200;
    const scoreB = b.input.standing.atk + b.input.standing.breakEffect * 1200;
    return scoreB - scoreA;
  })[0]!.input.characterId;
}

function pickHighestBreakAllyId(allies: AllyRuntime[], excludeId?: number): number {
  const pool = allies.filter((a) => a.input.characterId !== excludeId);
  const target = pool.length ? pool : allies;
  return [...target].sort((a, b) => b.input.standing.breakEffect - a.input.standing.breakEffect)[0]!
    .input.characterId;
}

function effectiveSpeed(ally: AllyRuntime, allies: AllyRuntime[]): number {
  const baseSpd = ally.input.standing.base.speed || 100;
  let spd = ally.input.standing.speed;

  // Ruan Mei talent: +10% base SPD to teammates
  const ruanMei = allies.find((a) => a.input.characterId === 1303);
  if (ruanMei && ruanMei.input.characterId !== ally.input.characterId) {
    spd += baseSpd * 0.1;
  }
  // Firefly Complete Combustion: +60 flat SPD
  if (ally.input.characterId === 1310 && ally.combustionActive) {
    spd += 60;
  }
  // Dahlia trace 3: +30% base SPD when weakness implanted
  if (ally.dahliaWeaknessSpdTurns > 0) {
    spd += baseSpd * 0.3;
  }
  // Himeko E1: +20% base SPD after FUA
  if (ally.input.characterId === 1003 && ally.himekoE1SpdTurns > 0) {
    spd += baseSpd * 0.2;
  }
  return Math.max(20, spd);
}

function effectiveAtk(ally: AllyRuntime, allies: AllyRuntime[], carryId: number): number {
  const baseAtk = ally.input.standing.base.atk || 1000;
  let atkPct = ally.equip.selfAtkPercent + ally.aeonStacks * ally.equip.aeonAtkPerAttack;
  let flatAtk = 0;

  // Lingsha Trace 1: 25% BE -> ATK% (max 50%)
  if (ally.input.characterId === 1222) {
    atkPct += Math.min(0.5, ally.input.standing.breakEffect * 0.25);
  }
  // Team equipment auras (Fleet of the Ageless / Lushaka)
  for (const mate of allies) {
    atkPct += mate.equip.teamAtkPercent;
  }
  // Robin Concerto ATK buff
  const robin = allies.find((a) => a.input.characterId === 1309 && a.robinConcertoActive);
  if (robin) {
    flatAtk += robin.input.standing.atk * 0.228 + 200;
  }
  // Huohuo Ult +40% ATK
  const huohuo = allies.find((a) => a.input.characterId === 1217 && a.ultBuffTurns > 0);
  if (huohuo) atkPct += 0.4;
  // Bronya Ult +55% ATK
  const bronya = allies.find((a) => a.input.characterId === 1101 && a.ultBuffTurns > 0);
  if (bronya) atkPct += 0.55;
  // Tingyun Skill +50% ATK (capped by 25% Tingyun ATK)
  const tingyun = allies.find((a) => a.input.characterId === 1202 && a.carryBuffTurns > 0);
  if (tingyun && ally.input.characterId === carryId) {
    flatAtk += Math.min(baseAtk * 0.5, tingyun.input.standing.atk * 0.25);
  }
  return ally.input.standing.atk + baseAtk * atkPct + flatAtk;
}

function effectiveBreakEffect(
  ally: AllyRuntime,
  allies: AllyRuntime[],
  currentAtk: number,
  carryId: number,
): number {
  let be = ally.input.standing.breakEffect + ally.equip.selfBreakEffect;

  // Firefly Trace γ: ATK > 1800 -> +0.8% BE per 10 ATK
  if (ally.input.characterId === 1310) {
    if (currentAtk > 1800) {
      be += Math.floor((currentAtk - 1800) / 10) * 0.008;
    }
    if (ally.combustionActive && ally.input.abilityVersion >= 1) {
      be += 0.25;
    }
  }
  // Fugue Trace 2: +30% self BE
  if (ally.input.characterId === 1225) {
    be += 0.3;
  }
  // Ruan Mei Trace 1: +20% team BE
  const ruanMei = allies.find((a) => a.input.characterId === 1303);
  if (ruanMei) be += 0.2;
  // HMC Ult +30% team BE & E4 15% BE share
  const hmc = allies.find((a) => a.input.characterId === 8005 || a.input.characterId === 8006);
  if (hmc) {
    if (hmc.hmcUltTurns > 0) be += 0.3;
    if (hmc.input.eidolon >= 4 && hmc.input.characterId !== ally.input.characterId) {
      be += (hmc.input.standing.breakEffect + hmc.equip.selfBreakEffect) * 0.15;
    }
  }
  // Fugue Foxian Prayer +30% BE & Trace 3 break stacks
  const fugue = allies.find((a) => a.input.characterId === 1225);
  if (fugue) {
    const hasFoxian =
      fugue.input.eidolon >= 6 ||
      fugue.foxianTargetId === ally.input.characterId ||
      (allies.length === 1 && ally.input.characterId === 1225);
    if (hasFoxian && fugue.scorchTurns > 0) be += 0.3;
    if (fugue.input.characterId !== ally.input.characterId && fugue.fugueBreakBuffStacks > 0) {
      const fugueBe = fugue.input.standing.breakEffect + fugue.equip.selfBreakEffect + 0.3;
      const perStack = fugueBe >= 2.2 ? 0.18 : 0.06;
      be += perStack * Math.min(2, fugue.fugueBreakBuffStacks);
    }
  }
  // Dahlia Trace 1: + (24% Dahlia BE + 50%) to teammates, E6 +150% to Dance Partners
  const dahlia = allies.find((a) => a.input.characterId === 1321);
  if (dahlia) {
    if (dahlia.dahliaTraceBeShareTurns > 0 && dahlia.input.characterId !== ally.input.characterId) {
      const dahliaBe = dahlia.input.standing.breakEffect + dahlia.equip.selfBreakEffect;
      be += dahliaBe * 0.24 + 0.5;
    }
    if (
      dahlia.input.eidolon >= 6 &&
      (ally.input.characterId === dahlia.input.characterId ||
        ally.input.characterId === dahlia.dahliaPartnerId)
    ) {
      be += 1.5;
    }
  }
  // Lingsha E2: Ult team +40% BE
  const lingsha = allies.find((a) => a.input.characterId === 1222 && a.ultBuffTurns > 0);
  if (lingsha && lingsha.input.eidolon >= 2) be += 0.4;

  // Watchmaker 4pc active on any teammate
  if (allies.some((a) => a.watchmakerTurns > 0)) be += 0.3;
  // Keep unused warning quiet if needed
  void carryId;

  return Math.max(0, be);
}

function collectCombatModifiers(
  ally: AllyRuntime,
  allies: AllyRuntime[],
  enemy: EnemyState,
  abilityKind: AbilityKind,
  carryId: number,
  targetCount: number,
  extraDefPen = 0,
) {
  let atk = effectiveAtk(ally, allies, carryId);
  // Ruan Mei E2: +40% ATK against broken enemies
  const ruanMei = allies.find((a) => a.input.characterId === 1303);
  if (ruanMei && ruanMei.input.eidolon >= 2 && enemy.broken) {
    atk += (ally.input.standing.base.atk || 1000) * 0.4;
  }

  const breakEffect = effectiveBreakEffect(ally, allies, atk, carryId);
  let critRate = ally.input.standing.critRate + ally.equip.selfCritRate;
  let critDamage = ally.input.standing.critDamage + ally.equip.selfCritDamage;
  let genericDmg =
    ally.input.standing.genericDamageBoost +
    ally.equip.selfGenericDmg +
    (ally.aeonBreakDmgTurns > 0 ? ally.equip.aeonBreakDmgBuff : 0);
  let abilityDmg =
    (ally.input.standing.abilityDamageBoost[abilityKind] ?? 0) +
    (ally.equip.selfAbilityDmg[abilityKind] ?? 0);
  const elemDmg = ally.input.standing.elementalDamageBoost[ally.input.element] ?? 0;

  let breakDmgBoost = ally.input.standing.breakDamageBoost + ally.equip.selfBreakDmgBoost;
  let breakEfficiency = ally.input.standing.breakEfficiencyBoost;
  let defPen = ally.input.standing.defensePenetration + ally.equip.selfDefPen + extraDefPen;
  let breakDefPen = 0;
  let superBreakDefPen = 0;
  let resPen = ally.input.standing.resistancePenetration;
  let vuln = ally.input.standing.vulnerability;
  let breakVuln = ally.input.standing.breakVulnerability;
  let finalDmgBoost = ally.input.standing.finalDamageBoost;
  const trueDmgMod = ally.input.standing.trueDamageModifier;
  let superBreakMod = ally.input.standing.superBreakModifier;

  // Iron Cavalry 4pc conditional thresholds
  if (ally.equip.selfBreakDefPen > 0 && breakEffect >= 1.5) {
    breakDefPen += ally.equip.selfBreakDefPen;
    if (breakEffect >= 2.5) {
      superBreakDefPen += ally.equip.selfSuperBreakDefPen;
    }
  }

  // Team equipment auras (Broken Keel, LC Ult DMG, Dahlia LC Break DMG)
  for (const mate of allies) {
    critDamage += mate.equip.teamCritDamage;
    if (mate.lcTeamDmgTurns > 0) genericDmg += mate.equip.teamGenericDmgOnUlt;
    if (mate.equip.teamBreakDmgBoostCarry > 0) {
      const highestBeId = pickHighestBreakAllyId(allies, mate.input.characterId);
      if (
        ally.input.characterId === mate.input.characterId ||
        ally.input.characterId === highestBeId
      ) {
        breakDmgBoost += mate.equip.teamBreakDmgBoostCarry;
      }
    }
  }

  // Firefly own combat buffs
  if (ally.input.characterId === 1310 && ally.combustionActive) {
    breakEfficiency += 0.5;
    breakVuln += 0.2;
    if (ally.input.eidolon >= 6) {
      resPen += 0.2;
      breakEfficiency += 0.5;
    }
    if (ally.input.abilityVersion >= 1) {
      if (breakEffect >= 3.0) superBreakMod += 1.5;
      else if (breakEffect >= 1.5) superBreakMod += 1.0;
    } else {
      if (breakEffect >= 3.6) superBreakMod += 0.5;
      else if (breakEffect >= 2.0) superBreakMod += 0.35;
    }
  }

  // Lingsha E1 / E6
  const lingsha = allies.find((a) => a.input.characterId === 1222);
  if (lingsha) {
    if (lingsha.input.eidolon >= 1) {
      if (ally.input.characterId === 1222) breakEfficiency += 0.5;
      if (enemy.broken) defPen += 0.2;
    }
    if (lingsha.input.eidolon >= 6 && lingsha.fuyuanCount > 0) resPen += 0.2;
  }

  // Fugue team & Foxian buffs
  const fugue = allies.find((a) => a.input.characterId === 1225);
  if (fugue) {
    superBreakMod += 1.0; // Talent: 100% Super Break for all allies
    const hasFoxian =
      fugue.input.eidolon >= 6 ||
      fugue.foxianTargetId === ally.input.characterId ||
      (allies.length === 1 && ally.input.characterId === 1225);
    if (hasFoxian && fugue.scorchTurns > 0) {
      if (fugue.input.eidolon >= 1) breakEfficiency += 0.5;
      if (fugue.input.eidolon >= 4) breakDmgBoost += 0.2;
    }
    if (ally.input.characterId === 1225 && fugue.input.eidolon >= 6) breakEfficiency += 0.5;
  }

  // Dahlia Zone, Dance Partner, E1/E2
  const dahlia = allies.find((a) => a.input.characterId === 1321);
  let allowUnbrokenSuperBreak = false;
  if (dahlia) {
    if (dahlia.dahliaZoneTurns > 0) {
      breakEfficiency += 0.5;
      allowUnbrokenSuperBreak = true;
    }
    const isPartner =
      ally.input.characterId === dahlia.input.characterId ||
      ally.input.characterId === dahlia.dahliaPartnerId;
    if (isPartner) {
      superBreakMod += dahlia.input.eidolon >= 1 ? 1.0 : 0.6;
    } else if (dahlia.input.eidolon >= 1) {
      superBreakMod += 0.6;
    }
    if (dahlia.input.eidolon >= 2) resPen += 0.2;
  }

  // Ruan Mei
  if (ruanMei) {
    if (ruanMei.ruanMeiSkillTurns > 0) {
      const rmBe = ruanMei.input.standing.breakEffect + ruanMei.equip.selfBreakEffect + 0.2;
      const extraDmg = Math.min(0.36, Math.max(0, Math.floor((rmBe - 1.2) / 0.1)) * 0.06);
      genericDmg += 0.32 + extraDmg;
      breakEfficiency += 0.5;
    }
    if (ruanMei.ruanMeiUltTurns > 0) {
      resPen += 0.25;
      if (ruanMei.input.eidolon >= 1) defPen += 0.2;
    }
  }

  // Harmony Trailblazer
  const hmc = allies.find((a) => a.input.characterId === 8005 || a.input.characterId === 8006);
  if (hmc && hmc.hmcUltTurns > 0) {
    const countBonus =
      targetCount >= 5
        ? 1.2
        : targetCount === 4
          ? 1.3
          : targetCount === 3
            ? 1.4
            : targetCount === 2
              ? 1.5
              : 1.6;
    superBreakMod += 1.0 * countBonus;
  }

  // Himeko own traces
  if (ally.input.characterId === 1003) {
    critRate += 0.15;
    if (abilityKind === "skill" && enemy.burnTurns > 0) abilityDmg += 0.2;
  }

  // Robin
  const robin = allies.find((a) => a.input.characterId === 1309);
  if (robin) {
    critDamage += 0.2;
    if (robin.robinSkillTurns > 0) genericDmg += 0.5;
  }

  // Aventurine self trace
  if (ally.input.characterId === 1304 && ally.input.standing.def > 1600) {
    critRate += Math.min(0.48, Math.floor((ally.input.standing.def - 1600) / 100) * 0.02);
  }

  // Acheron
  if (ally.input.characterId === 1308) {
    const otherNihility = allies.filter(
      (a) =>
        a.input.characterId !== 1308 &&
        (a.input.path.includes("虚无") || a.input.path.toLowerCase().includes("nihility")),
    ).length;
    const effectiveCount = otherNihility + (ally.input.eidolon >= 2 ? 1 : 0);
    if (effectiveCount >= 2) finalDmgBoost += 0.6;
    else if (effectiveCount >= 1) finalDmgBoost += 0.15;
    if (abilityKind === "ult") resPen += 0.2;
  }

  // The Herta Erudition synergy
  const theHerta = allies.find((a) => a.input.characterId === 1401);
  if (theHerta) {
    const eruditionCount = allies.filter(
      (a) => a.input.path.includes("智识") || a.input.path.toLowerCase().includes("erudition"),
    ).length;
    if (eruditionCount >= 2) critDamage += 0.8;
  }

  // Feixiao self FUA crit damage
  if (ally.input.characterId === 1220 && (abilityKind === "fua" || abilityKind === "ult")) {
    critDamage += 0.36;
  }

  // Sunday / Bronya / Sparkle / Tingyun single-carry buffs
  if (ally.input.characterId === carryId) {
    const sunday = allies.find((a) => a.input.characterId === 1313);
    if (sunday) {
      if (sunday.carryBuffTurns > 0) {
        genericDmg += 0.3;
        critRate += 0.2;
      }
      if (sunday.ultBuffTurns > 0) {
        critDamage += sunday.input.standing.critDamage * 0.3 + 0.12;
      }
    }
    const bronya = allies.find((a) => a.input.characterId === 1101);
    if (bronya) {
      if (bronya.carryBuffTurns > 0) genericDmg += 0.66;
      if (bronya.ultBuffTurns > 0) critDamage += bronya.input.standing.critDamage * 0.16 + 0.2;
    }
    const sparkle = allies.find((a) => a.input.characterId === 1306);
    if (sparkle) {
      if (sparkle.carryBuffTurns > 0) critDamage += sparkle.input.standing.critDamage * 0.24 + 0.45;
      genericDmg += sparkle.ultBuffTurns > 0 ? 0.48 : 0.18;
    }
    const tingyun = allies.find((a) => a.input.characterId === 1202);
    if (tingyun && tingyun.ultBuffTurns > 0) genericDmg += 0.5;
  }

  // Enemy debuffs
  if (enemy.defDownTurns > 0) defPen += enemy.defDown;
  if (enemy.wiltTurns > 0) defPen += enemy.wiltDefDown;
  if (enemy.pelaDefTurns > 0) defPen += enemy.pelaDefDown;
  if (enemy.befogTurns > 0) breakVuln += enemy.befogBreakVuln;
  if (enemy.besottedTurns > 0) breakVuln += enemy.besottedBreakVuln;
  if (enemy.lcVulnTurns > 0) vuln += enemy.lcVuln;
  if (enemy.dahliaE4VulnTurns > 0) vuln += 0.12;
  if (enemy.lcBreakVulnStacks > 0) breakVuln += enemy.lcBreakVulnStacks * enemy.lcBreakVulnPerStack;
  if (enemy.routedTurns > 0 && ally.equip.selfBreakVulnOnBreak > 0) {
    breakVuln += enemy.routedBreakVuln;
  }
  if (enemy.unnervedTurns > 0) critDamage += 0.15;
  vuln += enemy.ashenVuln;
  if (abilityKind === "ult") vuln += enemy.ashenUltVuln;

  return {
    atk,
    hp: ally.input.standing.hp,
    def: ally.input.standing.def,
    breakEffect,
    critRate,
    critDamage,
    genericDmg,
    elemDmg,
    abilityDmg,
    breakDmgBoost,
    breakEfficiency,
    defPen,
    breakDefPen,
    superBreakDefPen,
    resPen,
    vuln,
    breakVuln,
    finalDmgBoost,
    trueDmgMod,
    superBreakMod,
    allowUnbrokenSuperBreak,
  };
}

function enemyResistanceFor(
  enemy: EnemyState,
  preset: EnemyPreset,
  element: CombatElement,
): number {
  if (preset.weaknessMatched) return 0;
  if (element === "fire" && enemy.fireWeaknessTurns > 0) return 0;
  if (enemy.wiltTurns > 0) return 0;
  return preset.baseResistance;
}

function canReduceToughness(
  enemy: EnemyState,
  preset: EnemyPreset,
  element: CombatElement,
  spec: SkillAttackSpec,
  ally: AllyRuntime,
  allies: AllyRuntime[],
): number {
  if (preset.weaknessMatched) return 1;
  if (spec.ignoreWeaknessFull) return 1;
  if (element === "fire" && enemy.fireWeaknessTurns > 0) return 1;
  if (enemy.wiltTurns > 0) return 1;
  if (spec.ignoreWeaknessRatio) return spec.ignoreWeaknessRatio;
  if (ally.input.characterId === 1310 && ally.combustionActive && ally.input.abilityVersion === 0) {
    return 0.55;
  }
  const fugue = allies.find((a) => a.input.characterId === 1225 && a.scorchTurns > 0);
  if (fugue && (fugue.input.eidolon >= 6 || fugue.foxianTargetId === ally.input.characterId)) {
    return 0.5;
  }
  return 0;
}

function createInitialAllies(inputs: CombatantInput[], config: SimulationConfig): AllyRuntime[] {
  const hasFireAlly = inputs.some((i) => i.element === "fire");
  const allies: AllyRuntime[] = inputs.map((input) => {
    const profile = buildCharacterCombatProfile(input);
    const equip = resolveEquipmentCombatProfile(input, {
      targetHasFireWeakness: config.enemy.weaknessMatched || hasFireAlly,
      targetCount: config.enemy.targetCount,
    });
    let startEnergy = profile.usesSpecialUltResource ? 0 : profile.maxEnergy * 0.5;
    if (input.characterId === 1310) {
      startEnergy = Math.max(startEnergy, profile.maxEnergy * 0.5);
    }
    if (input.characterId === 1321) {
      startEnergy = Math.min(profile.maxEnergy, startEnergy + 35);
    }
    const startSpd = Math.max(20, input.standing.speed);
    const initialAdv = Math.max(
      equip.initialAdvance,
      input.characterId === 1225 && config.useTechniques !== false ? 0.4 : 0,
    );
    return {
      input,
      profile,
      equip,
      energy: startEnergy,
      specialStacks: input.characterId === 1308 ? 4 : input.characterId === 1220 ? 3 : 0,
      nextAv: (ACTION_VALUE_BASE / startSpd) * (1 - initialAdv),
      turnsTaken: 0,
      actionsCount: 0,
      totalDamage: 0,
      byKind: emptyDamageByKind(),
      combustionActive: false,
      combustionCountdownAv: Number.POSITIVE_INFINITY,
      combustionDelayCount: 0,
      fireflyE2Cooldown: 0,
      fuyuanCount: input.characterId === 1222 && config.useTechniques !== false ? 3 : 0,
      fuyuanNextAv:
        input.characterId === 1222 && config.useTechniques !== false
          ? ACTION_VALUE_BASE / 90
          : Number.POSITIVE_INFINITY,
      scorchTurns: 0,
      foxianTargetId: null,
      fugueBreakBuffStacks: 0,
      dahliaZoneTurns: input.characterId === 1321 && config.useTechniques !== false ? 3 : 0,
      dahliaPartnerId: null,
      dahliaFuaUsedThisTurn: false,
      dahliaFuaTotalCount: 0,
      dahliaTraceBeShareTurns: input.characterId === 1321 ? 2 : 0,
      dahliaWeaknessSpdTurns: 0,
      ruanMeiSkillTurns: input.characterId === 1303 && config.useTechniques !== false ? 3 : 0,
      ruanMeiUltTurns: 0,
      hmcUltTurns: 0,
      robinSkillTurns: 0,
      robinConcertoActive: false,
      robinCountdownAv: Number.POSITIVE_INFINITY,
      himekoCharge: input.characterId === 1003 ? 1 : 0,
      himekoE1SpdTurns: 0,
      gallagherEnhancedReady: false,
      feixiaoFuaReady: true,
      carryBuffTurns: 0,
      ultBuffTurns: 0,
      aeonStacks: 0,
      aeonBreakDmgTurns: 0,
      watchmakerTurns: 0,
      lcTeamDmgTurns: 0,
    };
  });

  // Apply team-wide start energy (e.g. Ruan Mei LC Past Self in Mirror)
  const teamStartEnergy = allies.reduce((sum, a) => sum + a.equip.teamStartEnergy, 0);
  if (teamStartEnergy > 0) {
    for (const a of allies) {
      if (!a.profile.usesSpecialUltResource) {
        a.energy = Math.min(a.profile.maxEnergy, a.energy + teamStartEnergy);
      }
    }
  }

  // Assign partners & recompute initial AV with Ruan Mei SPD aura
  const carryId = pickPrimaryCarryId(allies);
  for (const a of allies) {
    if (a.input.characterId === 1321) {
      a.dahliaPartnerId = pickHighestBreakAllyId(allies, 1321);
    }
    if (a.input.characterId === 1225) {
      a.foxianTargetId = carryId;
    }
    const spd = effectiveSpeed(a, allies);
    const initialAdv = Math.max(
      a.equip.initialAdvance,
      a.input.characterId === 1225 && config.useTechniques !== false ? 0.4 : 0,
    );
    a.nextAv = (ACTION_VALUE_BASE / spd) * (1 - initialAdv);
  }
  return allies;
}

function createInitialEnemies(
  preset: EnemyPreset,
  allies: AllyRuntime[],
  useTechniques: boolean,
): EnemyState[] {
  const hasFugue = allies.some((a) => a.input.characterId === 1225);
  const hasLingsha = allies.some((a) => a.input.characterId === 1222);
  const hasFirefly = allies.some((a) => a.input.characterId === 1310);
  const hasDahliaE2 = allies.some((a) => a.input.characterId === 1321 && a.input.eidolon >= 2);
  const exoMax = hasFugue ? preset.maxToughness * 0.4 : 0;

  return Array.from({ length: preset.targetCount }, (_, index) => ({
    index,
    // Firefly technique deals 20 AoE toughness on wave entry
    toughness: Math.max(0, preset.maxToughness - (hasFirefly && useTechniques ? 20 : 0)),
    maxToughness: preset.maxToughness,
    exoToughness: exoMax,
    exoMaxToughness: exoMax,
    broken: false,
    exoBroken: false,
    nextAv: (ACTION_VALUE_BASE / preset.enemySpeed) * (1 + index * 0.08),
    fireWeaknessTurns: hasFirefly && useTechniques ? 2 : 0,
    defDown: hasFugue && useTechniques ? 0.18 : 0,
    defDownTurns: hasFugue && useTechniques ? 2 : 0,
    wiltTurns: hasDahliaE2 ? 3 : 0,
    wiltDefDown: hasDahliaE2 ? 0.18 : 0,
    befogTurns: hasLingsha && useTechniques ? 2 : 0,
    befogBreakVuln: hasLingsha && useTechniques ? 0.25 : 0,
    pelaDefTurns: 0,
    pelaDefDown: 0,
    ashenVuln: 0,
    ashenUltVuln: 0,
    besottedTurns: 0,
    besottedBreakVuln: 0,
    unnervedTurns: 0,
    lcVulnTurns: 0,
    lcVuln: 0,
    lcBreakVulnStacks: 0,
    lcBreakVulnPerStack: 0,
    routedTurns: 0,
    routedBreakVuln: 0,
    dahliaE4VulnTurns: 0,
    burnTurns: 0,
    burnAtk: 0,
    burnScaling: 0,
    burnOwnerId: 0,
  }));
}

function advanceEntityAv(
  currentAv: number,
  targetAv: number,
  speed: number,
  ratio: number,
): number {
  const baseInterval = ACTION_VALUE_BASE / Math.max(20, speed);
  const remaining = Math.max(0, targetAv - currentAv);
  const nextRemaining = Math.max(0, remaining - baseInterval * ratio);
  return currentAv + nextRemaining;
}

function gainEnergy(ally: AllyRuntime, baseAmount: number, ignoreErr = false) {
  if (ally.profile.usesSpecialUltResource || baseAmount <= 0) return;
  const mult = ignoreErr ? 1 : 1 + ally.input.standing.energyRegenRate;
  ally.energy = Math.min(ally.profile.maxEnergy, ally.energy + baseAmount * mult);
}

/**
 * Execute a single seeded lightweight battle simulation for 1/3/5/10 cycles.
 */
export function runSingleBattle(
  inputs: CombatantInput[],
  config: SimulationConfig,
): SimulationRunResult {
  const seed = config.seed ?? 20261127;
  const rng = scenarioRandom(seed);
  const horizonAv = actionAxisHorizon(config.cycles);
  const useTechniques = config.useTechniques !== false;

  const allies = createInitialAllies(inputs, config);
  const enemies = createInitialEnemies(config.enemy, allies, useTechniques);
  const carryId = pickPrimaryCarryId(allies);

  let currentAv = 0;
  let sp = 3;
  const maxSp = allies.some((a) => a.input.characterId === 1306) ? 7 : 5;
  let stepCounter = 0;
  let breakCount = 0;
  const logs: ActionLogEntry[] = [];
  const totalByKind = emptyDamageByKind();

  function addDamage(ally: AllyRuntime, kind: DamageKind, amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    ally.totalDamage += amount;
    ally.byKind[kind] += amount;
    totalByKind[kind] += amount;
  }

  function resolveAttack(
    actor: AllyRuntime,
    spec: SkillAttackSpec,
    options: { isSummon?: boolean; summonName?: string; superBreakOverride?: number } = {},
  ): ActionLogEntry {
    const spBefore = sp;
    const energyBefore = actor.energy;
    const hits: CombatHitRecord[] = [];
    const tags: string[] = [];

    // Apply SP delta
    sp = Math.min(maxSp, Math.max(0, sp + spec.spDelta));

    // Apply Fall of an Aeon ATK stack on attack
    if (actor.equip.aeonAtkPerAttack > 0 && !spec.isBuffOnly) {
      actor.aeonStacks = Math.min(4, actor.aeonStacks + 1);
    }

    // Determine target list and per-target scaling / toughness
    const centerIndex = Math.floor(enemies.length / 2);
    const attackEntries: Array<{
      enemy: EnemyState;
      scaling: number;
      beBonus?: { coefficient: number; cap: number };
      toughness: number;
    }> = [];

    if (!spec.isBuffOnly) {
      if (spec.pattern === "single") {
        attackEntries.push({
          enemy: enemies[centerIndex]!,
          scaling: spec.mainScaling,
          beBonus: spec.beToAtkMain,
          toughness: spec.toughnessMain,
        });
      } else if (spec.pattern === "blast") {
        attackEntries.push({
          enemy: enemies[centerIndex]!,
          scaling: spec.mainScaling,
          beBonus: spec.beToAtkMain,
          toughness: spec.toughnessMain,
        });
        if (centerIndex - 1 >= 0) {
          attackEntries.push({
            enemy: enemies[centerIndex - 1]!,
            scaling: spec.adjacentScaling,
            beBonus: spec.beToAtkAdjacent,
            toughness: spec.toughnessAdjacent,
          });
        }
        if (centerIndex + 1 < enemies.length) {
          attackEntries.push({
            enemy: enemies[centerIndex + 1]!,
            scaling: spec.adjacentScaling,
            beBonus: spec.beToAtkAdjacent,
            toughness: spec.toughnessAdjacent,
          });
        }
      } else if (spec.pattern === "aoe") {
        const div = spec.splitAcrossTargets ? Math.max(1, enemies.length) : 1;
        for (const enemy of enemies) {
          attackEntries.push({
            enemy,
            scaling: spec.mainScaling / div,
            toughness: spec.toughnessMain,
          });
        }
      } else if (spec.pattern === "bounce") {
        const count = spec.bounceHits ?? 5;
        for (let i = 0; i < count; i++) {
          const targetIdx = i === 0 ? centerIndex : Math.floor(rng() * enemies.length);
          attackEntries.push({
            enemy: enemies[targetIdx]!,
            scaling: spec.mainScaling,
            toughness:
              i === 0 ? spec.toughnessMain : (spec.toughnessSubsequent ?? spec.toughnessMain),
          });
        }
      }
    }

    // Lingsha Fuyuan bonus single-target hit (+ E6 4 bounce hits)
    if (options.isSummon && actor.input.characterId === 1222) {
      const unbrokenIdx = enemies.findIndex((e) => !e.broken);
      const bonusIdx = unbrokenIdx >= 0 ? unbrokenIdx : Math.floor(rng() * enemies.length);
      attackEntries.push({
        enemy: enemies[bonusIdx]!,
        scaling: spec.mainScaling,
        toughness: 10,
      });
      if (actor.input.eidolon >= 6) {
        for (let i = 0; i < 4; i++) {
          const idx = Math.floor(rng() * enemies.length);
          attackEntries.push({
            enemy: enemies[idx]!,
            scaling: 0.5,
            toughness: 5,
          });
        }
      }
    }

    // Himeko E6 extra 2 hits on Ult
    if (
      actor.input.characterId === 1003 &&
      spec.abilityKind === "ult" &&
      actor.input.eidolon >= 6
    ) {
      for (let i = 0; i < 2; i++) {
        attackEntries.push({
          enemy: enemies[Math.floor(rng() * enemies.length)]!,
          scaling: spec.mainScaling * 0.4,
          toughness: 0,
        });
      }
    }

    // Firefly enhanced E implants Fire weakness on center target before damage
    let implantedWeakness = false;
    if (actor.input.characterId === 1310 && spec.id === actor.profile.enhancedSkill?.id) {
      enemies[centerIndex]!.fireWeaknessTurns = 2;
      implantedWeakness = true;
      tags.push("挂火弱点");
    }

    // Dahlia trace 3: weakness implant -> +30% SPD & Fire extra 20 fixed toughness + 10% energy
    const dahlia = allies.find((a) => a.input.characterId === 1321);
    let extraFixedToughnessCenter = 0;
    if (implantedWeakness && dahlia) {
      actor.dahliaWeaknessSpdTurns = 2;
      if (actor.input.element === "fire") {
        extraFixedToughnessCenter = 20;
        gainEnergy(actor, actor.profile.maxEnergy * 0.1, true);
        tags.push("大丽花追削韧+20");
      }
    }

    let directSum = 0;
    let breakSum = 0;
    let superBreakSum = 0;
    let additionalSum = 0;
    const dotSum = 0;
    let triggeredBreakThisAction = false;

    for (let idx = 0; idx < attackEntries.length; idx++) {
      const entry = attackEntries[idx]!;
      const enemy = entry.enemy;

      // Fugue Foxian Prayer applies 18% DEF down on attack
      const fugue = allies.find((a) => a.input.characterId === 1225 && a.scorchTurns > 0);
      if (fugue && (fugue.input.eidolon >= 6 || fugue.foxianTargetId === actor.input.characterId)) {
        enemy.defDown = Math.max(enemy.defDown, 0.18);
        enemy.defDownTurns = Math.max(enemy.defDownTurns, 2);
      }
      // Resolution Shines LC DEF shred
      if (actor.equip.enemyDefDown > 0) {
        enemy.defDown = Math.max(enemy.defDown, actor.equip.enemyDefDown);
        enemy.defDownTurns = Math.max(enemy.defDownTurns, 1);
      }

      const mods = collectCombatModifiers(
        actor,
        allies,
        enemy,
        spec.abilityKind,
        carryId,
        enemies.length,
        spec.extraDefPen ?? 0,
      );
      const enemyRes = enemyResistanceFor(enemy, config.enemy, spec.element);

      // 1) Direct damage
      let finalScaling = entry.scaling;
      if (entry.beBonus) {
        finalScaling += entry.beBonus.coefficient * Math.min(mods.breakEffect, entry.beBonus.cap);
      }
      if (finalScaling > 0) {
        const directBd = calculateDirectDamage({
          element: spec.element,
          abilityKind: spec.abilityKind,
          attackerLevel: actor.input.level,
          enemyLevel: config.enemy.level,
          atk: mods.atk,
          hp: mods.hp,
          def: mods.def,
          atkScaling: spec.scalingStat === "atk" ? finalScaling : 0,
          hpScaling: spec.scalingStat === "hp" ? finalScaling : 0,
          defScaling: spec.scalingStat === "def" ? finalScaling : 0,
          critRate: mods.critRate,
          critDamage: mods.critDamage,
          genericDamageBoost: mods.genericDmg,
          elementDamageBoost: mods.elemDmg,
          hitSpecificDamageBoost: mods.abilityDmg,
          defensePenetration: mods.defPen,
          enemyResistance: enemyRes,
          resistancePenetration: mods.resPen,
          vulnerability: mods.vuln,
          finalDamageBoost: mods.finalDmgBoost,
          trueDamageModifier: mods.trueDmgMod,
          weaknessBroken: enemy.broken,
          critRoll: config.deterministic ? undefined : rng(),
        });
        addDamage(actor, "direct", directBd.actualDamage);
        directSum += directBd.actualDamage;
        hits.push({
          targetIndex: enemy.index,
          damageKind: "direct",
          element: spec.element,
          amount: directBd.actualDamage,
          didCrit: directBd.didCrit,
          breakdown: directBd,
        });
      }

      // 2) Toughness reduction, Break & Exo-Break, Super Break
      const ratio = canReduceToughness(enemy, config.enemy, spec.element, spec, actor, allies);
      const fixedExtra = idx === 0 ? extraFixedToughnessCenter : 0;
      const baseTough = entry.toughness * ratio;
      const effTough = baseTough * (1 + mods.breakEfficiency) + fixedExtra;
      let causedBreak = false;
      let causedExoBreak = false;

      if (effTough > 0) {
        if (!enemy.broken) {
          enemy.toughness -= effTough;
          if (enemy.toughness <= 0) {
            const overflow = Math.abs(enemy.toughness);
            enemy.toughness = 0;
            enemy.broken = true;
            causedBreak = true;
            triggeredBreakThisAction = true;
            breakCount += 1;
            tags.push("弱点击破");

            // Enemy delayed by 25% on break (+ Fugue 15% + HMC 30% + Ruan Mei)
            let delayRatio = 0.25;
            if (allies.some((a) => a.input.characterId === 1225)) delayRatio += 0.15;
            if (allies.some((a) => a.input.characterId === 8005 || a.input.characterId === 8006)) {
              delayRatio += 0.3;
            }
            enemy.nextAv += (ACTION_VALUE_BASE / config.enemy.enemySpeed) * delayRatio;

            // Break Damage
            const breakBd = calculateBreakDamage({
              element: spec.element,
              attackerLevel: actor.input.level,
              enemyLevel: config.enemy.level,
              enemyMaxToughness: enemy.maxToughness,
              breakEffect: mods.breakEffect,
              hitSpecificDamageBoost: mods.breakDmgBoost,
              defensePenetration: mods.defPen + mods.breakDefPen,
              enemyResistance: enemyRes,
              resistancePenetration: mods.resPen,
              vulnerability: mods.vuln + mods.breakVuln,
              finalDamageBoost: mods.finalDmgBoost,
              trueDamageModifier: mods.trueDmgMod,
              weaknessBrokenAtResolution: true,
            });
            addDamage(actor, "break", breakBd.actualDamage);
            breakSum += breakBd.actualDamage;
            hits.push({
              targetIndex: enemy.index,
              damageKind: "break",
              element: spec.element,
              amount: breakBd.actualDamage,
              didCrit: false,
              causedBreak: true,
              toughnessDelta: effTough,
              breakdown: breakBd,
            });

            // On-break triggers: Fall of an Aeon DMG, Thief 4pc, Fugue E2 & Trace, Ruan Mei Talent, Himeko charge
            if (actor.equip.aeonBreakDmgBuff > 0) actor.aeonBreakDmgTurns = 2;
            if (actor.equip.extraEnergyOnBreak > 0)
              gainEnergy(actor, actor.equip.extraEnergyOnBreak);
            if (actor.equip.selfBreakVulnOnBreak > 0) {
              enemy.routedTurns = 2;
              enemy.routedBreakVuln = actor.equip.selfBreakVulnOnBreak;
            }
            for (const mate of allies) {
              if (mate.equip.enemyBreakVulnOnBreak > 0) {
                enemy.lcBreakVulnStacks = Math.min(2, enemy.lcBreakVulnStacks + 1);
                enemy.lcBreakVulnPerStack = Math.max(
                  enemy.lcBreakVulnPerStack,
                  mate.equip.enemyBreakVulnOnBreak,
                );
              }
              if (mate.input.characterId === 1225) {
                mate.fugueBreakBuffStacks = Math.min(2, mate.fugueBreakBuffStacks + 1);
                if (mate.input.eidolon >= 2) gainEnergy(mate, 3);
              }
              if (mate.input.characterId === 8005 || mate.input.characterId === 8006) {
                gainEnergy(mate, 10);
              }
              if (mate.input.characterId === 1003) {
                mate.himekoCharge = Math.min(3, mate.himekoCharge + 1);
              }
              if (mate.input.characterId === 1303) {
                // Ruan Mei talent bonus ice break damage (120%)
                const rmBe = effectiveBreakEffect(mate, allies, mate.input.standing.atk, carryId);
                const rmBreak = calculateBreakDamage({
                  element: "ice",
                  attackerLevel: mate.input.level,
                  enemyLevel: config.enemy.level,
                  enemyMaxToughness: enemy.maxToughness,
                  breakEffect: rmBe,
                  specialScaling: mate.input.eidolon >= 6 ? 3.2 : 1.2,
                  defensePenetration: mods.defPen,
                  enemyResistance: enemyResistanceFor(enemy, config.enemy, "ice"),
                  resistancePenetration: mods.resPen,
                  vulnerability: mods.vuln + mods.breakVuln,
                });
                addDamage(mate, "break", rmBreak.actualDamage);
                breakSum += rmBreak.actualDamage;
              }
            }
            // Apply overflow to Exo-Toughness if present
            if (enemy.exoToughness > 0 && overflow > 0) {
              enemy.exoToughness = Math.max(0, enemy.exoToughness - overflow);
            }
          }
        } else if (enemy.exoToughness > 0 && !enemy.exoBroken) {
          // Exo-Toughness reduction (Fugue Cloudflame Luster)
          enemy.exoToughness -= effTough;
          if (enemy.exoToughness <= 0) {
            enemy.exoToughness = 0;
            enemy.exoBroken = true;
            causedExoBreak = true;
            triggeredBreakThisAction = true;
            breakCount += 1;
            tags.push("虚韧性二次击破");

            const exoBreakBd = calculateBreakDamage({
              element: spec.element,
              attackerLevel: actor.input.level,
              enemyLevel: config.enemy.level,
              enemyMaxToughness: enemy.maxToughness,
              breakEffect: mods.breakEffect,
              hitSpecificDamageBoost: mods.breakDmgBoost,
              defensePenetration: mods.defPen + mods.breakDefPen,
              enemyResistance: enemyRes,
              resistancePenetration: mods.resPen,
              vulnerability: mods.vuln + mods.breakVuln,
              finalDamageBoost: mods.finalDmgBoost,
              trueDamageModifier: mods.trueDmgMod,
              weaknessBrokenAtResolution: true,
            });
            addDamage(actor, "break", exoBreakBd.actualDamage);
            breakSum += exoBreakBd.actualDamage;
            hits.push({
              targetIndex: enemy.index,
              damageKind: "break",
              element: spec.element,
              amount: exoBreakBd.actualDamage,
              didCrit: false,
              causedExoBreak: true,
              toughnessDelta: effTough,
              breakdown: exoBreakBd,
            });
            for (const mate of allies) {
              if (mate.input.characterId === 1003)
                mate.himekoCharge = Math.min(3, mate.himekoCharge + 1);
              if (mate.input.characterId === 1225 && mate.input.eidolon >= 2) gainEnergy(mate, 3);
              if (mate.input.characterId === 8005 || mate.input.characterId === 8006)
                gainEnergy(mate, 10);
            }
          }
        }

        // Super Break settlement (either already broken or Dahlia Zone allows unbroken Super Break)
        const activeSuperBreakMod =
          options.superBreakOverride !== undefined
            ? options.superBreakOverride
            : mods.superBreakMod;
        if (activeSuperBreakMod > 0 && (enemy.broken || mods.allowUnbrokenSuperBreak)) {
          // Re-apply Routed if Firefly broke/dealt break dmg
          if (actor.equip.selfBreakVulnOnBreak > 0 && enemy.routedTurns <= 0) {
            enemy.routedTurns = 2;
            enemy.routedBreakVuln = actor.equip.selfBreakVulnOnBreak;
          }
          const sbBd = calculateSuperBreakDamage({
            element: spec.element,
            attackerLevel: actor.input.level,
            enemyLevel: config.enemy.level,
            toughnessDamage: baseTough,
            fixedToughnessDamage: fixedExtra,
            breakEfficiencyBoost: mods.breakEfficiency,
            breakEffect: mods.breakEffect,
            superBreakModifier: activeSuperBreakMod,
            hitSpecificDamageBoost: mods.breakDmgBoost,
            defensePenetration: mods.defPen + mods.breakDefPen + mods.superBreakDefPen,
            enemyResistance: enemyRes,
            resistancePenetration: mods.resPen,
            vulnerability: mods.vuln + mods.breakVuln,
            finalDamageBoost: mods.finalDmgBoost,
            trueDamageModifier: mods.trueDmgMod,
            weaknessBroken: enemy.broken,
            allowWhileUnbroken: mods.allowUnbrokenSuperBreak,
          });
          if (sbBd.actualDamage > 0) {
            addDamage(actor, "superBreak", sbBd.actualDamage);
            superBreakSum += sbBd.actualDamage;
            hits.push({
              targetIndex: enemy.index,
              damageKind: "superBreak",
              element: spec.element,
              amount: sbBd.actualDamage,
              didCrit: false,
              toughnessDelta: causedBreak || causedExoBreak ? undefined : effTough,
              breakdown: sbBd,
            });
          }
        }
      }

      // Apply Burn DoT (Himeko)
      if (spec.isDotApplier) {
        const effChance =
          spec.isDotApplier.chance *
          (1 + actor.input.standing.effectHitRate) *
          (1 - config.enemy.effectResistance);
        if (config.deterministic || rng() < effChance) {
          enemy.burnTurns = spec.isDotApplier.turns;
          enemy.burnAtk = mods.atk;
          enemy.burnScaling = spec.isDotApplier.atkScaling;
          enemy.burnOwnerId = actor.input.characterId;
        }
      }
    }

    // Robin Concerto additional physical damage (guaranteed crit with 150% CD) on ally attacks
    const robin = allies.find((a) => a.input.characterId === 1309 && a.robinConcertoActive);
    if (robin && !spec.isBuffOnly && attackEntries.length > 0 && actor.input.characterId !== 1309) {
      const targetEnemy = enemies[centerIndex]!;
      const robinAtk = effectiveAtk(robin, allies, carryId);
      const addBd = calculateDirectDamage({
        element: "physical",
        damageKind: "additional",
        attackerLevel: robin.input.level,
        enemyLevel: config.enemy.level,
        atk: robinAtk,
        hp: robin.input.standing.hp,
        def: robin.input.standing.def,
        atkScaling: 1.2,
        critRate: 1.0,
        critDamage: 1.5,
        genericDamageBoost: robin.input.standing.genericDamageBoost + 0.5,
        elementDamageBoost: robin.input.standing.elementalDamageBoost.physical ?? 0,
        defensePenetration: targetEnemy.defDown + targetEnemy.wiltDefDown + targetEnemy.pelaDefDown,
        enemyResistance: enemyResistanceFor(targetEnemy, config.enemy, "physical"),
        resistancePenetration: robin.input.standing.resistancePenetration,
        vulnerability: targetEnemy.lcVuln + targetEnemy.ashenVuln,
        weaknessBroken: targetEnemy.broken,
      });
      addDamage(robin, "additional", addBd.actualDamage);
      additionalSum += addBd.actualDamage;
      hits.push({
        targetIndex: targetEnemy.index,
        damageKind: "additional",
        element: "physical",
        amount: addBd.actualDamage,
        didCrit: true,
        breakdown: addBd,
      });
      gainEnergy(robin, 2);
    }

    // Firefly v1 Trace α: Breaking slows combustion countdown by 10% (max 3 times)
    if (
      triggeredBreakThisAction &&
      actor.input.characterId === 1310 &&
      actor.combustionActive &&
      actor.input.abilityVersion >= 1 &&
      actor.combustionDelayCount < 3
    ) {
      actor.combustionDelayCount += 1;
      actor.combustionCountdownAv += (ACTION_VALUE_BASE / 70) * 0.1;
      tags.push("燃烧倒计时延后");
    }

    // Energy gain from skill & attack LC
    if (!options.isSummon) {
      gainEnergy(actor, spec.energyGain);
      if (!spec.isBuffOnly && actor.equip.extraEnergyOnAttack > 0) {
        gainEnergy(actor, actor.equip.extraEnergyOnAttack);
      }
      // Firefly normal Skill fixed 60% energy
      if (actor.input.characterId === 1310 && spec.id === actor.profile.skill.id) {
        gainEnergy(actor, actor.profile.maxEnergy * 0.6, true);
      }
    }

    // Special Ult stack gains (Feixiao / Acheron)
    for (const mate of allies) {
      if (mate.input.characterId === 1220 && !spec.isBuffOnly) {
        mate.specialStacks = Math.min(12, mate.specialStacks + 0.5);
      }
      if (
        mate.input.characterId === 1308 &&
        !spec.isBuffOnly &&
        enemyHasDebuffTrigger(actor, spec)
      ) {
        mate.specialStacks = Math.min(9, mate.specialStacks + 1);
      }
    }

    // Firefly E2 extra turn on break
    if (
      triggeredBreakThisAction &&
      actor.input.characterId === 1310 &&
      actor.combustionActive &&
      actor.input.eidolon >= 2 &&
      actor.fireflyE2Cooldown <= 0
    ) {
      actor.fireflyE2Cooldown = 2;
      actor.nextAv = currentAv;
      tags.push("2魂额外回合");
    }

    // Count actions & log
    if (!options.isSummon) actor.actionsCount += 1;
    const totalDamage = directSum + breakSum + superBreakSum + additionalSum + dotSum;
    stepCounter += 1;
    const summaryParts: string[] = [];
    if (directSum > 0) summaryParts.push(`直伤 ${Math.round(directSum).toLocaleString()}`);
    if (breakSum > 0) summaryParts.push(`击破 ${Math.round(breakSum).toLocaleString()}`);
    if (superBreakSum > 0)
      summaryParts.push(`超击破 ${Math.round(superBreakSum).toLocaleString()}`);
    if (additionalSum > 0) summaryParts.push(`附加 ${Math.round(additionalSum).toLocaleString()}`);
    if (dotSum > 0) summaryParts.push(`DoT ${Math.round(dotSum).toLocaleString()}`);
    if (!summaryParts.length) summaryParts.push("增益 / 状态生效");

    const entry: ActionLogEntry = {
      step: stepCounter,
      cycle: actionCycleAt(currentAv),
      actionValue: Number(currentAv.toFixed(1)),
      actorId: actor.input.characterId,
      actorName: actor.input.name,
      ...(options.isSummon ? { isSummon: true, summonName: options.summonName } : {}),
      actionName: spec.name,
      abilityKind: spec.abilityKind,
      spBefore,
      spAfter: sp,
      energyBefore: Math.round(energyBefore),
      energyAfter: Math.round(actor.energy),
      maxEnergy: actor.profile.maxEnergy,
      totalDamage,
      directDamage: directSum,
      breakDamage: breakSum,
      superBreakDamage: superBreakSum,
      additionalDamage: additionalSum,
      dotDamage: dotSum,
      hits,
      tags: [...new Set(tags)],
      summary: summaryParts.join(" · "),
    };
    logs.push(entry);
    return entry;
  }

  function enemyHasDebuffTrigger(actor: AllyRuntime, spec: SkillAttackSpec): boolean {
    return (
      actor.input.characterId === 1308 ||
      actor.input.characterId === 1106 ||
      actor.input.characterId === 1218 ||
      actor.input.characterId === 1225 ||
      actor.input.characterId === 1321 ||
      actor.equip.enemyDefDown > 0 ||
      Boolean(spec.isDotApplier)
    );
  }

  function triggerFollowUps(triggerActor: AllyRuntime, wasAttack: boolean) {
    if (!wasAttack) return;

    // Dahlia Talent FUA when Dance Partner attacks (once per Dahlia turn)
    const dahlia = allies.find((a) => a.input.characterId === 1321);
    if (
      dahlia &&
      !dahlia.dahliaFuaUsedThisTurn &&
      dahlia.profile.fua &&
      triggerActor.input.characterId === dahlia.dahliaPartnerId &&
      triggerActor.input.characterId !== 1321
    ) {
      dahlia.dahliaFuaUsedThisTurn = true;
      dahlia.dahliaFuaTotalCount += 1;
      if (dahlia.dahliaFuaTotalCount % 2 === 0) {
        sp = Math.min(maxSp, sp + 1);
      }
      if (dahlia.input.eidolon >= 4) {
        for (const e of enemies) e.dahliaE4VulnTurns = 2;
      }
      if (dahlia.input.eidolon >= 6) {
        for (const a of allies) {
          if (a.input.characterId === 1321 || a.input.characterId === dahlia.dahliaPartnerId) {
            a.nextAv = advanceEntityAv(currentAv, a.nextAv, effectiveSpeed(a, allies), 0.2);
          }
        }
      }
      resolveAttack(dahlia, dahlia.profile.fua, { superBreakOverride: 2.0 });
    }

    // Himeko Talent FUA when charge hits 3
    const himeko = allies.find((a) => a.input.characterId === 1003);
    if (himeko && himeko.himekoCharge >= 3 && himeko.profile.fua) {
      himeko.himekoCharge = 0;
      if (himeko.input.eidolon >= 1) himeko.himekoE1SpdTurns = 2;
      resolveAttack(himeko, himeko.profile.fua);
    }

    // Feixiao Talent FUA when teammate attacks (once per Feixiao turn)
    const feixiao = allies.find((a) => a.input.characterId === 1220);
    if (
      feixiao &&
      feixiao.feixiaoFuaReady &&
      feixiao.profile.fua &&
      triggerActor.input.characterId !== 1220
    ) {
      feixiao.feixiaoFuaReady = false;
      resolveAttack(feixiao, feixiao.profile.fua);
    }
  }

  function tryCastReadyUlts() {
    for (const ally of allies) {
      if (stepCounter >= MAX_SIM_STEPS) return;
      const canUlt = ally.profile.usesSpecialUltResource
        ? (ally.input.characterId === 1220 && ally.specialStacks >= 6) ||
          (ally.input.characterId === 1308 && ally.specialStacks >= 9)
        : ally.energy >= ally.profile.maxEnergy;
      if (!canUlt) continue;
      // Firefly cannot Ult while in Combustion
      if (ally.input.characterId === 1310 && ally.combustionActive) continue;
      // Robin does not re-Ult while Concerto active
      if (ally.input.characterId === 1309 && ally.robinConcertoActive) continue;

      if (ally.profile.usesSpecialUltResource) {
        ally.specialStacks = Math.max(
          0,
          ally.specialStacks - (ally.input.characterId === 1220 ? 6 : 9),
        );
      } else {
        ally.energy = 0;
      }

      // Apply character-specific Ult effects
      switch (ally.input.characterId) {
        case 1310: {
          // Firefly Complete Combustion
          ally.combustionActive = true;
          ally.combustionDelayCount = 0;
          ally.combustionCountdownAv = currentAv + ACTION_VALUE_BASE / 70;
          ally.nextAv = currentAv; // 100% self advance
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1222: {
          // Lingsha Ult: Befog 25% break vuln + Fuyuan 100% advance + Dahlia trace refresh
          for (const e of enemies) {
            e.befogTurns = 2;
            e.befogBreakVuln = 0.25;
          }
          ally.ultBuffTurns = 3;
          if (ally.fuyuanCount > 0) ally.fuyuanNextAv = currentAv;
          const dahlia = allies.find((a) => a.input.characterId === 1321);
          if (dahlia) dahlia.dahliaTraceBeShareTurns = 3;
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1225: {
          // Fugue Ult: AoE fire + ignore weakness; E2 team 24% advance
          resolveAttack(ally, ally.profile.ult);
          if (ally.input.eidolon >= 2) {
            for (const mate of allies) {
              mate.nextAv = advanceEntityAv(
                currentAv,
                mate.nextAv,
                effectiveSpeed(mate, allies),
                0.24,
              );
            }
          }
          break;
        }
        case 1321: {
          // Dahlia Ult: Wilt 18% DEF down + weakness implant (4 turns)
          for (const e of enemies) {
            e.wiltTurns = 4;
            e.wiltDefDown = 0.18;
          }
          for (const mate of allies) mate.dahliaWeaknessSpdTurns = 2;
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1303: {
          // Ruan Mei Ult: 2-turn field (+1 at E6)
          ally.ruanMeiUltTurns = ally.input.eidolon >= 6 ? 3 : 2;
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 8005:
        case 8006: {
          // HMC Ult: 3-turn Backup Dancer
          ally.hmcUltTurns = 3;
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1301: {
          // Gallagher Ult: Besotted + 100% self advance + enhanced basic
          for (const e of enemies) {
            e.besottedTurns = 2;
            e.besottedBreakVuln = 0.12;
          }
          ally.gallagherEnhancedReady = true;
          ally.nextAv = currentAv;
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1309: {
          // Robin Ult: Concerto + team 100% advance; Robin leaves timeline until Concerto ends
          ally.robinConcertoActive = true;
          ally.robinCountdownAv = currentAv + ACTION_VALUE_BASE / 90;
          ally.nextAv = Number.POSITIVE_INFINITY;
          for (const mate of allies) {
            if (mate.input.characterId !== 1309) mate.nextAv = currentAv;
          }
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1106: {
          // Pela Ult: AoE 40% DEF down
          for (const e of enemies) {
            e.pelaDefTurns = 2;
            e.pelaDefDown = 0.4;
          }
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1218: {
          // Jiaoqiu Ult: Ashen Roast max 5 stacks + Ult vuln
          for (const e of enemies) {
            e.ashenVuln = 0.35;
            e.ashenUltVuln = 0.15;
          }
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1304: {
          for (const e of enemies) e.unnervedTurns = 3;
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1202: {
          // Tingyun Ult: +50 energy & +50% DMG to carry
          ally.ultBuffTurns = 2;
          const carry = allies.find((a) => a.input.characterId === carryId);
          if (carry) gainEnergy(carry, 50, true);
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1313: {
          // Sunday Ult: +20% energy & CD to carry
          ally.ultBuffTurns = 3;
          const carry = allies.find((a) => a.input.characterId === carryId);
          if (carry) gainEnergy(carry, carry.profile.maxEnergy * 0.2, true);
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1101: {
          ally.ultBuffTurns = 2;
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1306: {
          ally.ultBuffTurns = 2;
          sp = Math.min(maxSp, sp + 4);
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1217: {
          ally.ultBuffTurns = 2;
          for (const mate of allies) {
            if (mate.input.characterId !== 1217) {
              gainEnergy(mate, mate.profile.maxEnergy * 0.2, true);
            }
          }
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        case 1401: {
          ally.nextAv = currentAv;
          resolveAttack(ally, ally.profile.ult);
          break;
        }
        default: {
          resolveAttack(ally, ally.profile.ult);
          break;
        }
      }

      // Equipment Ult triggers (Watchmaker, Past Self, DDD, Eagle, Scent Alone Stays True)
      if (ally.equip.teamBreakEffectOnUlt > 0) ally.watchmakerTurns = 2;
      if (ally.equip.teamGenericDmgOnUlt > 0) ally.lcTeamDmgTurns = 3;
      if (ally.equip.extraSpOnUlt) sp = Math.min(maxSp, sp + 1);
      if (ally.equip.enemyVulnOnUlt > 0) {
        for (const e of enemies) {
          e.lcVulnTurns = 2;
          e.lcVuln = Math.max(e.lcVuln, ally.equip.enemyVulnOnUlt);
        }
      }
      if (ally.equip.eagleUltAdvance > 0 && ally.nextAv > currentAv) {
        ally.nextAv = advanceEntityAv(
          currentAv,
          ally.nextAv,
          effectiveSpeed(ally, allies),
          ally.equip.eagleUltAdvance,
        );
      }
      if (ally.equip.dddTeamAdvanceOnUlt > 0) {
        for (const mate of allies) {
          mate.nextAv = advanceEntityAv(
            currentAv,
            mate.nextAv,
            effectiveSpeed(mate, allies),
            ally.equip.dddTeamAdvanceOnUlt,
          );
        }
      }

      triggerFollowUps(ally, !ally.profile.ult.isBuffOnly);
    }
  }

  function tickAllyStartOfTurn(ally: AllyRuntime) {
    ally.turnsTaken += 1;
    if (ally.fireflyE2Cooldown > 0) ally.fireflyE2Cooldown -= 1;
    if (ally.scorchTurns > 0) ally.scorchTurns -= 1;
    if (ally.dahliaZoneTurns > 0) ally.dahliaZoneTurns -= 1;
    if (ally.dahliaTraceBeShareTurns > 0) ally.dahliaTraceBeShareTurns -= 1;
    if (ally.dahliaWeaknessSpdTurns > 0) ally.dahliaWeaknessSpdTurns -= 1;
    if (ally.ruanMeiSkillTurns > 0) ally.ruanMeiSkillTurns -= 1;
    if (ally.ruanMeiUltTurns > 0) ally.ruanMeiUltTurns -= 1;
    if (ally.hmcUltTurns > 0) ally.hmcUltTurns -= 1;
    if (ally.robinSkillTurns > 0) ally.robinSkillTurns -= 1;
    if (ally.himekoE1SpdTurns > 0) ally.himekoE1SpdTurns -= 1;
    if (ally.carryBuffTurns > 0) ally.carryBuffTurns -= 1;
    if (ally.ultBuffTurns > 0) ally.ultBuffTurns -= 1;
    if (ally.aeonBreakDmgTurns > 0) ally.aeonBreakDmgTurns -= 1;
    if (ally.watchmakerTurns > 0) ally.watchmakerTurns -= 1;
    if (ally.lcTeamDmgTurns > 0) ally.lcTeamDmgTurns -= 1;

    ally.dahliaFuaUsedThisTurn = false;
    ally.feixiaoFuaReady = true;

    // Ruan Mei trace: +5 energy at start of turn
    if (ally.input.characterId === 1303) gainEnergy(ally, 5);
  }

  function chooseAndExecuteAllyTurn(ally: AllyRuntime) {
    // Robin waits in Concerto
    if (ally.input.characterId === 1309 && ally.robinConcertoActive) {
      ally.nextAv = Number.POSITIVE_INFINITY;
      return;
    }

    tickAllyStartOfTurn(ally);
    let chosen: SkillAttackSpec;

    switch (ally.input.characterId) {
      case 1310: {
        // Firefly
        if (ally.combustionActive && ally.profile.enhancedSkill) {
          chosen =
            sp > 0 || ally.input.eidolon >= 1
              ? ally.profile.enhancedSkill
              : (ally.profile.enhancedBasic ?? ally.profile.basic);
        } else {
          chosen = sp > 0 ? ally.profile.skill : ally.profile.basic;
        }
        break;
      }
      case 1222: {
        // Lingsha: use Skill when Fuyuan low or SP healthy
        if ((ally.fuyuanCount <= 1 || sp >= 3) && sp > 0) {
          chosen = ally.profile.skill;
          ally.fuyuanCount = Math.min(5, ally.fuyuanCount + 3);
          if (!Number.isFinite(ally.fuyuanNextAv)) {
            ally.fuyuanNextAv = currentAv + ACTION_VALUE_BASE / 90;
          } else {
            ally.fuyuanNextAv = advanceEntityAv(currentAv, ally.fuyuanNextAv, 90, 0.2);
          }
          const dahlia = allies.find((a) => a.input.characterId === 1321);
          if (dahlia) dahlia.dahliaTraceBeShareTurns = 3;
        } else {
          chosen = ally.profile.basic;
        }
        break;
      }
      case 1225: {
        // Fugue: cast Skill when Scorch expired, else Enhanced Basic
        if (ally.scorchTurns <= 0 && sp > 0) {
          chosen = ally.profile.skill;
          ally.scorchTurns = 3;
          ally.foxianTargetId = carryId;
          // Trace 2: first skill restores 1 SP
          if (ally.turnsTaken === 1) sp = Math.min(maxSp, sp + 1);
        } else {
          chosen = ally.profile.enhancedBasic ?? ally.profile.basic;
        }
        break;
      }
      case 1321: {
        // Dahlia: refresh Zone when expired, otherwise Basic to generate SP
        if (ally.dahliaZoneTurns <= 0 && sp > 0) {
          chosen = ally.profile.skill;
          ally.dahliaZoneTurns = 3;
        } else {
          chosen = ally.profile.basic;
        }
        break;
      }
      case 1303: {
        // Ruan Mei: E-A-A
        if (ally.ruanMeiSkillTurns <= 0 && sp > 0) {
          chosen = ally.profile.skill;
          ally.ruanMeiSkillTurns = 3;
        } else {
          chosen = ally.profile.basic;
        }
        break;
      }
      case 1301: {
        // Gallagher: Enhanced Basic after Ult, otherwise Basic (SP printer)
        if (ally.gallagherEnhancedReady && ally.profile.enhancedBasic) {
          chosen = ally.profile.enhancedBasic;
          ally.gallagherEnhancedReady = false;
        } else {
          chosen = ally.profile.basic;
        }
        break;
      }
      case 1309: {
        // Robin: E when skill buff expired
        if (ally.robinSkillTurns <= 0 && sp > 0) {
          chosen = ally.profile.skill;
          ally.robinSkillTurns = 3;
        } else {
          chosen = ally.profile.basic;
        }
        break;
      }
      case 1313:
      case 1101:
      case 1306: {
        // Action advancers (Sunday / Bronya / Sparkle)
        if (sp > 0) {
          chosen = ally.profile.skill;
          ally.carryBuffTurns = ally.input.characterId === 1313 ? 2 : 1;
          const carry = allies.find((a) => a.input.characterId === carryId);
          if (carry && carry.input.characterId !== ally.input.characterId) {
            const adv = ally.input.characterId === 1306 ? 0.5 : 1.0;
            carry.nextAv = advanceEntityAv(
              currentAv,
              carry.nextAv,
              effectiveSpeed(carry, allies),
              adv,
            );
          }
        } else {
          chosen = ally.profile.basic;
        }
        break;
      }
      case 1202: {
        if (ally.carryBuffTurns <= 0 && sp > 0) {
          chosen = ally.profile.skill;
          ally.carryBuffTurns = 3;
        } else {
          chosen = ally.profile.basic;
        }
        break;
      }
      default: {
        // Generic AI: DPS uses Skill whenever SP > 0; Support/Sustain uses Skill when SP >= 3
        const wantsSkill =
          ally.profile.role === "dps" ? sp > 0 : ally.profile.role === "subdps" ? sp >= 2 : sp >= 3;
        chosen = wantsSkill ? ally.profile.skill : ally.profile.basic;
        break;
      }
    }

    // Schedule next turn before self-advance
    const spd = effectiveSpeed(ally, allies);
    ally.nextAv = currentAv + ACTION_VALUE_BASE / spd;

    resolveAttack(ally, chosen);

    // Self-advance (e.g. Firefly normal E +25%)
    if (chosen.selfAdvance && chosen.selfAdvance > 0) {
      ally.nextAv = advanceEntityAv(currentAv, ally.nextAv, spd, chosen.selfAdvance);
    }

    triggerFollowUps(ally, !chosen.isBuffOnly);
    tryCastReadyUlts();
  }

  function processEnemyTurn(enemy: EnemyState) {
    // Burn DoT tick at start of enemy turn
    if (enemy.burnTurns > 0) {
      const owner = allies.find((a) => a.input.characterId === enemy.burnOwnerId);
      if (owner) {
        const dotBd = calculateDotDamage({
          element: "fire",
          attackerLevel: owner.input.level,
          enemyLevel: config.enemy.level,
          atk: enemy.burnAtk,
          atkScaling: enemy.burnScaling,
          genericDamageBoost: owner.input.standing.genericDamageBoost,
          elementDamageBoost: owner.input.standing.elementalDamageBoost.fire ?? 0,
          defensePenetration: enemy.defDown + enemy.wiltDefDown + enemy.pelaDefDown,
          enemyResistance: enemyResistanceFor(enemy, config.enemy, "fire"),
          resistancePenetration: owner.input.standing.resistancePenetration,
          vulnerability: enemy.lcVuln + enemy.ashenVuln,
          weaknessBroken: enemy.broken,
        });
        addDamage(owner, "dot", dotBd.actualDamage);
      }
      enemy.burnTurns -= 1;
    }

    // Recover from Weakness Break
    if (enemy.broken) {
      enemy.broken = false;
      enemy.exoBroken = false;
      enemy.toughness = enemy.maxToughness;
      enemy.exoToughness = enemy.exoMaxToughness;
    } else {
      // Enemy attacks a random ally -> grants 10 energy (hit energy)
      const hitTarget = allies[Math.floor(rng() * allies.length)]!;
      gainEnergy(hitTarget, 10);
      if (hitTarget.input.characterId === 1304 && hitTarget.profile.fua) {
        // Aventurine periodic FUA on team getting hit
        if (stepCounter % 3 === 0) resolveAttack(hitTarget, hitTarget.profile.fua);
      }
    }

    // Tick enemy debuff durations
    if (enemy.fireWeaknessTurns > 0) enemy.fireWeaknessTurns -= 1;
    if (enemy.defDownTurns > 0) enemy.defDownTurns -= 1;
    if (enemy.wiltTurns > 0) enemy.wiltTurns -= 1;
    if (enemy.befogTurns > 0) enemy.befogTurns -= 1;
    if (enemy.pelaDefTurns > 0) enemy.pelaDefTurns -= 1;
    if (enemy.besottedTurns > 0) enemy.besottedTurns -= 1;
    if (enemy.unnervedTurns > 0) enemy.unnervedTurns -= 1;
    if (enemy.lcVulnTurns > 0) enemy.lcVulnTurns -= 1;
    if (enemy.routedTurns > 0) enemy.routedTurns -= 1;
    if (enemy.dahliaE4VulnTurns > 0) enemy.dahliaE4VulnTurns -= 1;

    enemy.nextAv = currentAv + ACTION_VALUE_BASE / config.enemy.enemySpeed;
    tryCastReadyUlts();
  }

  // Check if anyone starts with full Ult
  tryCastReadyUlts();

  // Main timeline loop
  let loopGuard = 0;
  while (stepCounter < MAX_SIM_STEPS && loopGuard++ < MAX_SIM_STEPS * 4) {
    type EventKind =
      | { type: "ally"; ally: AllyRuntime; av: number }
      | { type: "fuyuan"; ally: AllyRuntime; av: number }
      | { type: "combustionEnd"; ally: AllyRuntime; av: number }
      | { type: "concertoEnd"; ally: AllyRuntime; av: number }
      | { type: "enemy"; enemy: EnemyState; av: number };

    const candidates: EventKind[] = [];
    const consider = (ev: EventKind) => {
      if (ev.av <= horizonAv + 1e-6) candidates.push(ev);
    };

    for (const ally of allies) {
      consider({ type: "ally", ally, av: ally.nextAv });
      if (ally.fuyuanCount > 0 && Number.isFinite(ally.fuyuanNextAv)) {
        consider({ type: "fuyuan", ally, av: ally.fuyuanNextAv });
      }
      if (ally.combustionActive && Number.isFinite(ally.combustionCountdownAv)) {
        consider({ type: "combustionEnd", ally, av: ally.combustionCountdownAv });
      }
      if (ally.robinConcertoActive && Number.isFinite(ally.robinCountdownAv)) {
        consider({ type: "concertoEnd", ally, av: ally.robinCountdownAv });
      }
    }
    for (const enemy of enemies) {
      consider({ type: "enemy", enemy, av: enemy.nextAv });
    }

    let ev: EventKind | null = null;
    for (const candidate of candidates) {
      if (!ev || candidate.av < ev.av - 1e-6) ev = candidate;
    }
    if (!ev) break;
    currentAv = ev.av;

    if (ev.type === "ally") {
      chooseAndExecuteAllyTurn(ev.ally);
    } else if (ev.type === "fuyuan") {
      ev.ally.fuyuanCount -= 1;
      ev.ally.fuyuanNextAv =
        ev.ally.fuyuanCount > 0 ? currentAv + ACTION_VALUE_BASE / 90 : Number.POSITIVE_INFINITY;
      if (ev.ally.profile.fua) {
        resolveAttack(ev.ally, ev.ally.profile.fua, { isSummon: true, summonName: "浮元" });
        const dahlia = allies.find((a) => a.input.characterId === 1321);
        if (dahlia) dahlia.dahliaTraceBeShareTurns = 3;
        tryCastReadyUlts();
      }
    } else if (ev.type === "combustionEnd") {
      ev.ally.combustionActive = false;
      ev.ally.combustionCountdownAv = Number.POSITIVE_INFINITY;
    } else if (ev.type === "concertoEnd") {
      ev.ally.robinConcertoActive = false;
      ev.ally.robinCountdownAv = Number.POSITIVE_INFINITY;
      ev.ally.nextAv = currentAv;
    } else {
      processEnemyTurn(ev.enemy);
    }
  }

  const totalDamage = allies.reduce((sum, a) => sum + a.totalDamage, 0);
  const contributions: CharacterDamageContribution[] = allies
    .map((a) => ({
      characterId: a.input.characterId,
      name: a.input.name,
      avatar: a.input.avatar,
      element: a.input.element,
      modelingDepth: a.profile.modelingDepth,
      modelingSummary: a.profile.modelingSummary,
      totalDamage: a.totalDamage,
      share: totalDamage > 0 ? a.totalDamage / totalDamage : 0,
      actions: a.actionsCount,
      byKind: { ...a.byKind },
    }))
    .sort((a, b) => b.totalDamage - a.totalDamage);

  // Compute "Standard 1-Combo / 1st-Cycle Rotation" damage from Cycle 1 (150 AV)
  const cycle1Damage = logs.filter((l) => l.cycle === 1).reduce((sum, l) => sum + l.totalDamage, 0);
  const comboLabel =
    allies.length > 1 ? "首轮标准一套爆发（150 AV）" : "单人首轮循环预期（150 AV）";

  const activeMechanisms = [
    ...allies.flatMap((a) => a.profile.mechanismNotes.map((n) => `${a.input.name}：${n}`)),
    ...allies.flatMap((a) => a.equip.notes.map((n) => `${a.input.name}·${n}`)),
  ];
  const unmodeledWarnings = [
    ...allies.flatMap((a) => a.profile.unmodeledNotes),
    "轻量模拟使用默认木桩敌人与自动战斗 AI，受击回能按敌方回合随机单体+10点估算，结果用于趋势参考而非游戏逐位精确值。",
  ];

  return {
    seed,
    cycles: config.cycles,
    horizonAv,
    totalDamage,
    comboDamage: cycle1Damage,
    comboLabel,
    totalActions: allies.reduce((sum, a) => sum + a.actionsCount, 0),
    breakCount,
    byKind: totalByKind,
    contributions,
    logs,
    assumptions: [
      `敌方木桩：Lv.${config.enemy.level} · ${config.enemy.targetCount} 目标 · 韧性 ${config.enemy.maxToughness} · ${config.enemy.weaknessMatched ? "弱点匹配(0%抗性)" : `常规抗性 ${Math.round(config.enemy.baseResistance * 100)}%`}`,
      `轮次刻度：首轮 150 AV，后续每轮 100 AV（${config.cycles} 轮 = ${horizonAv} AV）`,
    ],
    activeMechanisms,
    unmodeledWarnings,
  };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx]!;
}

/**
 * Run Monte Carlo random sampling across N seeds plus 1/3/5/10 cycle comparison.
 */
export function runMonteCarloSimulation(
  inputs: CombatantInput[],
  config: SimulationConfig,
  runs = 24,
  includeAllCycleComparisons = true,
): MonteCarloSummary {
  const safeRuns = Math.max(4, Math.min(100, Math.round(runs)));
  const baseSeed = config.seed ?? 20261127;
  const results: SimulationRunResult[] = [];

  for (let i = 0; i < safeRuns; i++) {
    results.push(
      runSingleBattle(inputs, {
        ...config,
        seed: (baseSeed + i * 7919) >>> 0,
        deterministic: false,
      }),
    );
  }

  const totals = results.map((r) => r.totalDamage).sort((a, b) => a - b);
  const meanDamage = totals.reduce((s, v) => s + v, 0) / totals.length;
  const comboDamage = results.reduce((s, r) => s + r.comboDamage, 0) / results.length;

  const byKindMean = emptyDamageByKind();
  for (const r of results) {
    for (const key of Object.keys(byKindMean) as DamageKind[]) {
      byKindMean[key] += r.byKind[key] / results.length;
    }
  }

  const contribMap = new Map<number, CharacterDamageContribution>();
  for (const r of results) {
    for (const c of r.contributions) {
      const existing = contribMap.get(c.characterId);
      if (!existing) {
        contribMap.set(c.characterId, {
          ...c,
          totalDamage: c.totalDamage / results.length,
          actions: c.actions / results.length,
          byKind: Object.fromEntries(
            (Object.keys(c.byKind) as DamageKind[]).map((k) => [k, c.byKind[k] / results.length]),
          ) as Record<DamageKind, number>,
        });
      } else {
        existing.totalDamage += c.totalDamage / results.length;
        existing.actions += c.actions / results.length;
        for (const k of Object.keys(existing.byKind) as DamageKind[]) {
          existing.byKind[k] += c.byKind[k] / results.length;
        }
      }
    }
  }
  const contributionsMean = [...contribMap.values()]
    .map((c) => ({
      ...c,
      actions: Number(c.actions.toFixed(1)),
      share: meanDamage > 0 ? c.totalDamage / meanDamage : 0,
    }))
    .sort((a, b) => b.totalDamage - a.totalDamage);

  // Pick median-closest run as representative demo log
  const medianDamage = percentile(totals, 0.5);
  let sampleRun = results[0]!;
  let minDiff = Math.abs(sampleRun.totalDamage - medianDamage);
  for (const r of results) {
    const diff = Math.abs(r.totalDamage - medianDamage);
    if (diff < minDiff) {
      minDiff = diff;
      sampleRun = r;
    }
  }

  // 1 / 3 / 5 / 10 cycle comparison
  const cycleComparisons: CycleDamageComparison[] = [];
  if (includeAllCycleComparisons) {
    const presets: Array<1 | 3 | 5 | 10> = [1, 3, 5, 10];
    for (const c of presets) {
      if (c === config.cycles) {
        cycleComparisons.push({
          cycles: c,
          meanDamage,
          minDamage: totals[0] ?? 0,
          maxDamage: totals[totals.length - 1] ?? 0,
          p10Damage: percentile(totals, 0.1),
          p90Damage: percentile(totals, 0.9),
          actions: Number(
            (results.reduce((s, r) => s + r.totalActions, 0) / results.length).toFixed(1),
          ),
        });
      } else {
        const subRuns = 12;
        const subTotals: number[] = [];
        let subActions = 0;
        for (let i = 0; i < subRuns; i++) {
          const r = runSingleBattle(inputs, {
            ...config,
            cycles: c,
            seed: (baseSeed + c * 997 + i * 7919) >>> 0,
            deterministic: false,
          });
          subTotals.push(r.totalDamage);
          subActions += r.totalActions;
        }
        subTotals.sort((a, b) => a - b);
        cycleComparisons.push({
          cycles: c,
          meanDamage: subTotals.reduce((s, v) => s + v, 0) / subTotals.length,
          minDamage: subTotals[0] ?? 0,
          maxDamage: subTotals[subTotals.length - 1] ?? 0,
          p10Damage: percentile(subTotals, 0.1),
          p90Damage: percentile(subTotals, 0.9),
          actions: Number((subActions / subRuns).toFixed(1)),
        });
      }
    }
  }

  return {
    cycles: config.cycles,
    runs: safeRuns,
    meanDamage,
    medianDamage,
    minDamage: totals[0] ?? 0,
    maxDamage: totals[totals.length - 1] ?? 0,
    p10Damage: percentile(totals, 0.1),
    p90Damage: percentile(totals, 0.9),
    comboDamage,
    comboLabel: sampleRun.comboLabel,
    byKindMean,
    contributionsMean,
    sampleRun,
    cycleComparisons,
    assumptions: sampleRun.assumptions,
    activeMechanisms: sampleRun.activeMechanisms,
    unmodeledWarnings: sampleRun.unmodeledWarnings,
  };
}

/**
 * Compute per-skill single-cast breakdown (non-crit / crit / expected + Super Break if self-enabled)
 * for a single character against the given enemy preset.
 */
export function evaluateCharacterSkillPreviews(
  input: CombatantInput,
  enemyPreset: EnemyPreset = DEFAULT_ENEMY_PRESET,
): SkillPreviewResult[] {
  const allies = createInitialAllies([input], { cycles: 5, enemy: enemyPreset });
  const ally = allies[0]!;
  // Preview Firefly in her core Complete Combustion state
  if (ally.input.characterId === 1310) {
    ally.combustionActive = true;
    ally.aeonStacks = 4;
  } else if (ally.equip.aeonAtkPerAttack > 0) {
    ally.aeonStacks = 4;
  }
  const dummyEnemy = createInitialEnemies(enemyPreset, allies, true)[0]!;
  dummyEnemy.broken = enemyPreset.initiallyBroken;

  const specs: SkillAttackSpec[] = [
    ally.profile.basic,
    ...(ally.profile.enhancedBasic ? [ally.profile.enhancedBasic] : []),
    ally.profile.skill,
    ...(ally.profile.enhancedSkill ? [ally.profile.enhancedSkill] : []),
    ally.profile.ult,
    ...(ally.profile.fua ? [ally.profile.fua] : []),
  ].filter((s) => !s.isBuffOnly);

  return specs.map((spec) => {
    const mods = collectCombatModifiers(
      ally,
      allies,
      dummyEnemy,
      spec.abilityKind,
      ally.input.characterId,
      enemyPreset.targetCount,
      spec.extraDefPen ?? 0,
    );
    const enemyRes = enemyResistanceFor(dummyEnemy, enemyPreset, spec.element);
    const targetCount = enemyPreset.targetCount;
    const hitSlots: Array<{ scaling: number; toughness: number }> = [];

    if (spec.pattern === "single") {
      const mainScale =
        spec.mainScaling +
        (spec.beToAtkMain
          ? spec.beToAtkMain.coefficient * Math.min(mods.breakEffect, spec.beToAtkMain.cap)
          : 0);
      hitSlots.push({ scaling: mainScale, toughness: spec.toughnessMain });
    } else if (spec.pattern === "blast") {
      const mainScale =
        spec.mainScaling +
        (spec.beToAtkMain
          ? spec.beToAtkMain.coefficient * Math.min(mods.breakEffect, spec.beToAtkMain.cap)
          : 0);
      const adjScale =
        spec.adjacentScaling +
        (spec.beToAtkAdjacent
          ? spec.beToAtkAdjacent.coefficient * Math.min(mods.breakEffect, spec.beToAtkAdjacent.cap)
          : 0);
      hitSlots.push({ scaling: mainScale, toughness: spec.toughnessMain });
      const adjCount = Math.min(2, Math.max(0, targetCount - 1));
      for (let i = 0; i < adjCount; i++) {
        hitSlots.push({ scaling: adjScale, toughness: spec.toughnessAdjacent });
      }
    } else if (spec.pattern === "aoe") {
      const div = spec.splitAcrossTargets ? Math.max(1, targetCount) : 1;
      for (let i = 0; i < targetCount; i++) {
        hitSlots.push({ scaling: spec.mainScaling / div, toughness: spec.toughnessMain });
      }
    } else if (spec.pattern === "bounce") {
      const hits = spec.bounceHits ?? 5;
      for (let i = 0; i < hits; i++) {
        hitSlots.push({
          scaling: spec.mainScaling,
          toughness:
            i === 0 ? spec.toughnessMain : (spec.toughnessSubsequent ?? spec.toughnessMain),
        });
      }
    }

    let nonCritTotal = 0;
    let critTotal = 0;
    let directExpected = 0;
    let superBreakExpected = 0;
    let primaryBreakdown: DamageBreakdown | null = null;

    for (const slot of hitSlots) {
      const directBd = calculateDirectDamage({
        element: spec.element,
        abilityKind: spec.abilityKind,
        attackerLevel: ally.input.level,
        enemyLevel: enemyPreset.level,
        atk: mods.atk,
        hp: mods.hp,
        def: mods.def,
        atkScaling: spec.scalingStat === "atk" ? slot.scaling : 0,
        hpScaling: spec.scalingStat === "hp" ? slot.scaling : 0,
        defScaling: spec.scalingStat === "def" ? slot.scaling : 0,
        critRate: mods.critRate,
        critDamage: mods.critDamage,
        genericDamageBoost: mods.genericDmg,
        elementDamageBoost: mods.elemDmg,
        hitSpecificDamageBoost: mods.abilityDmg,
        defensePenetration: mods.defPen,
        enemyResistance: enemyRes,
        resistancePenetration: mods.resPen,
        vulnerability: mods.vuln,
        finalDamageBoost: mods.finalDmgBoost,
        trueDamageModifier: mods.trueDmgMod,
        weaknessBroken: dummyEnemy.broken,
      });
      if (!primaryBreakdown) primaryBreakdown = directBd;
      nonCritTotal += directBd.nonCritDamage;
      critTotal += directBd.critDamage;
      directExpected += directBd.expectedDamage;

      if (mods.superBreakMod > 0 && slot.toughness > 0) {
        const sbBd = calculateSuperBreakDamage({
          element: spec.element,
          attackerLevel: ally.input.level,
          enemyLevel: enemyPreset.level,
          toughnessDamage: slot.toughness,
          breakEfficiencyBoost: mods.breakEfficiency,
          breakEffect: mods.breakEffect,
          superBreakModifier: mods.superBreakMod,
          hitSpecificDamageBoost: mods.breakDmgBoost,
          defensePenetration: mods.defPen + mods.breakDefPen + mods.superBreakDefPen,
          enemyResistance: enemyRes,
          resistancePenetration: mods.resPen,
          vulnerability: mods.vuln + mods.breakVuln,
          finalDamageBoost: mods.finalDmgBoost,
          trueDamageModifier: mods.trueDmgMod,
          weaknessBroken: dummyEnemy.broken,
          allowWhileUnbroken: mods.allowUnbrokenSuperBreak,
        });
        superBreakExpected += sbBd.expectedDamage;
        nonCritTotal += sbBd.expectedDamage;
        critTotal += sbBd.expectedDamage;
        if (sbBd.expectedDamage > directBd.expectedDamage) {
          primaryBreakdown = sbBd;
        }
      }
    }

    const fallbackBreakdown =
      primaryBreakdown ??
      calculateDirectDamage({
        element: spec.element,
        attackerLevel: ally.input.level,
        enemyLevel: enemyPreset.level,
        atk: mods.atk,
        hp: mods.hp,
        def: mods.def,
        atkScaling: 0,
        critRate: mods.critRate,
        critDamage: mods.critDamage,
        genericDamageBoost: 0,
        elementDamageBoost: 0,
        defensePenetration: 0,
        enemyResistance: enemyRes,
        resistancePenetration: 0,
        vulnerability: 0,
        weaknessBroken: dummyEnemy.broken,
      });

    const notes: string[] = [];
    if (superBreakExpected > 0) {
      notes.push(`含自拐超击破期望 ${Math.round(superBreakExpected).toLocaleString()}`);
    }
    if (spec.pattern === "blast" || spec.pattern === "aoe") {
      notes.push(`按 ${targetCount} 目标总计`);
    }

    return {
      id: spec.id,
      name: spec.name,
      abilityKind: spec.abilityKind,
      pattern: spec.pattern,
      element: spec.element,
      nonCritTotal,
      critTotal,
      expectedTotal: directExpected + superBreakExpected,
      directExpected,
      superBreakExpected,
      toughnessMain: spec.toughnessMain,
      toughnessAdjacent: spec.toughnessAdjacent,
      hitCount: hitSlots.length,
      primaryBreakdown: fallbackBreakdown,
      notes,
    };
  });
}

/**
 * Fast summary snapshot for graduation dashboard cards.
 */
export function evaluateSingleCharacterSnapshot(
  input: CombatantInput,
  enemyPreset: EnemyPreset = DEFAULT_ENEMY_PRESET,
): CharacterDamageSnapshot {
  const profile = buildCharacterCombatProfile(input);
  const skillPreviews = evaluateCharacterSkillPreviews(input, enemyPreset);
  const coreSkill = [...skillPreviews].sort((a, b) => b.expectedTotal - a.expectedTotal)[0];
  const mc = runMonteCarloSimulation(
    [input],
    { cycles: 5, enemy: enemyPreset, seed: input.characterId * 31 + 17 },
    12,
    false,
  );
  const byKind = mc.byKindMean;
  let primaryDamageKind: DamageKind = "direct";
  let bestVal = -1;
  for (const key of Object.keys(byKind) as DamageKind[]) {
    if (byKind[key] > bestVal) {
      bestVal = byKind[key];
      primaryDamageKind = key;
    }
  }

  return {
    characterId: input.characterId,
    name: input.name,
    modelingDepth: profile.modelingDepth,
    modelingBadge: profile.modelingBadge,
    coreSkillName: coreSkill?.name ?? profile.skill.name,
    coreSkillExpected: coreSkill?.expectedTotal ?? 0,
    coreSkillCrit: coreSkill?.critTotal ?? 0,
    comboDamage: mc.comboDamage,
    comboLabel: mc.comboLabel,
    fiveCycleMean: mc.meanDamage,
    fiveCycleP10: mc.p10Damage,
    fiveCycleP90: mc.p90Damage,
    primaryDamageKind,
    skillPreviews,
  };
}
