import {
  characterDisplayName,
  lightConeById,
  relicCatalogue,
  relicSetById,
  resolveCharacterCatalogue,
} from "@/shared/catalogue";
import {
  calculateStandingStats,
  isMaxStandingEquipment,
  lightConeSkillEffect,
  type StandingStat,
} from "@/shared/utils/standing-stats";
import { reviewedStandingRules, standingEquipment } from "@/shared/utils/standing-rule-catalogue";
import { traceNodeEnabled, type DisabledTraceNodes } from "@/shared/utils/trace-settings";
import { primaryTraceNodes } from "@/shared/utils/trace-stats";
import { getCharacterMaxEnergy } from "./character-profiles";
import { normalizeElement } from "./equipment-rules";
import type {
  CombatantInput,
  CombatantStats,
  CombatElement,
  DamageKind,
  EquippedLightConeInfo,
  EquippedSetCount,
} from "./types";

export * from "./types";
export * from "./formulas";
export * from "./equipment-rules";
export * from "./character-profiles";
export * from "./simulator";

export interface CharacterCombatSource {
  characterId: number;
  name: string;
  path?: string;
  level: number;
  ascension: number;
  eidolon?: number;
  abilityVersion?: number;
  skills?: Record<string, number> | null;
  traces?: Record<string, boolean> | null;
  equippedRelics?: Array<{
    setId: number;
    slot?: string;
    mainStat: string;
    mainStatValue: number;
    substats?: Array<{ kind: string; key: string; value: number }>;
  }>;
  equippedLightCone?: {
    templateId: number;
    name?: string;
    level: number;
    ascension: number;
    superimposition?: number;
  } | null;
}

export interface CombatantResolveResult {
  available: boolean;
  reason: string;
  combatant: CombatantInput | null;
}

function statByKey(stats: StandingStat[], key: string): number {
  const found = stats.find((s) => s.key === key);
  if (!found || !Number.isFinite(found.value)) return 0;
  return found.unit === "percent" ? found.value / 100 : found.value;
}

export function standingStatsToCombatantStats(
  stats: StandingStat[],
  base: { hp: number; attack: number; defense: number; speed: number },
  coneBase: { hp: number; attack: number; defense: number },
  level: number,
): CombatantStats {
  const baseHp = base.hp + coneBase.hp;
  const baseAtk = base.attack + coneBase.attack;
  const baseDef = base.defense + coneBase.defense;

  return {
    level,
    base: { hp: baseHp, atk: baseAtk, def: baseDef, speed: base.speed },
    hp: statByKey(stats, "hp") || baseHp,
    atk: statByKey(stats, "atk") || baseAtk,
    def: statByKey(stats, "def") || baseDef,
    speed: statByKey(stats, "spd") || base.speed,
    critRate: statByKey(stats, "critRate") || 0.05,
    critDamage: statByKey(stats, "critDmg") || 0.5,
    breakEffect: statByKey(stats, "breakEffect"),
    effectHitRate: statByKey(stats, "effectHitRate"),
    effectRes: statByKey(stats, "effectRes"),
    energyRegenRate: statByKey(stats, "energyRegen"),
    healingBoost: statByKey(stats, "healingBoost"),
    elation: 0,
    genericDamageBoost: 0,
    elementalDamageBoost: {
      physical: statByKey(stats, "physicalDmg"),
      fire: statByKey(stats, "fireDmg"),
      ice: statByKey(stats, "iceDmg"),
      lightning: statByKey(stats, "lightningDmg"),
      wind: statByKey(stats, "windDmg"),
      quantum: statByKey(stats, "quantumDmg"),
      imaginary: statByKey(stats, "imaginaryDmg"),
    },
    abilityDamageBoost: {},
    breakDamageBoost: 0,
    defensePenetration: 0,
    superBreakDefensePenetration: 0,
    resistancePenetration: statByKey(stats, "resPen"),
    vulnerability: 0,
    breakVulnerability: 0,
    finalDamageBoost: 0,
    trueDamageModifier: 0,
    breakEfficiencyBoost: 0,
    superBreakModifier: 0,
  };
}

/**
 * Resolve a CharacterCombatSource (from BuildDashboardCharacter or InventoryDetail) into a
 * ready-to-simulate CombatantInput using exact standing stats.
 */
export function resolveCombatantFromCharacter(
  source: CharacterCombatSource,
  disabledTraceNodes: DisabledTraceNodes = {},
): CombatantResolveResult {
  const displayName = characterDisplayName({
    characterId: source.characterId,
    name: source.name,
    path: source.path,
  });
  const catalogue = resolveCharacterCatalogue({
    characterId: source.characterId,
    name: source.name,
    path: source.path,
  });
  if (!catalogue?.baseStats) {
    return { available: false, reason: `${displayName} 缺少满级基础面板数据`, combatant: null };
  }
  const cone = source.equippedLightCone ?? null;
  if (!cone) {
    return { available: false, reason: `${displayName} 未装备光锥`, combatant: null };
  }
  const coneEntry = lightConeById.get(cone.templateId);
  if (!coneEntry?.baseStats) {
    return {
      available: false,
      reason: `${displayName} 已装备光锥缺少满级基础属性`,
      combatant: null,
    };
  }
  if (!isMaxStandingEquipment(source, cone)) {
    return {
      available: false,
      reason: `${displayName} 需角色与光锥均为 Lv.80 满突破`,
      combatant: null,
    };
  }

  const relics = source.equippedRelics ?? [];
  const equipment = standingEquipment(
    { templateId: cone.templateId, superimposition: cone.superimposition ?? 1 },
    relics,
    catalogue.path,
  );
  const maxEnergy = getCharacterMaxEnergy(source.characterId);
  equipment.entityStats = { "Max Energy": maxEnergy };

  const review = reviewedStandingRules(equipment);
  if (review.unreviewedSources.length || review.missingInputs.length) {
    // Fall back gracefully without blocking simulation if a brand-new set has pending standing rules
    // while still computing standard relic/trace/base stats.
  }

  const pieceCounts = new Map<number, number>();
  for (const r of relics) pieceCounts.set(r.setId, (pieceCounts.get(r.setId) ?? 0) + 1);
  const setEffects = relicCatalogue.sets.flatMap((set) => {
    const count = pieceCounts.get(set.id) ?? 0;
    return [count >= 2 ? set.effects.twoPiece : "", count >= 4 ? set.effects.fourPiece : ""].filter(
      (effect): effect is string => Boolean(effect),
    );
  });
  const lcEffect = lightConeSkillEffect(coneEntry.skill, cone.superimposition ?? 1);
  const traces = primaryTraceNodes(catalogue.traceStats ?? [])
    .filter((node) => traceNodeEnabled(disabledTraceNodes, source.characterId, node.id))
    .flatMap((node) => node.stats);

  const standingStats = calculateStandingStats({
    characterBase: catalogue.baseStats,
    lightConeBase: coneEntry.baseStats,
    relics,
    traces,
    setEffects,
    lightConeEffects: lcEffect ? [lcEffect] : [],
    equipment:
      review.unreviewedSources.length || review.missingInputs.length ? undefined : equipment,
  });

  const sets: EquippedSetCount[] = [];
  for (const [setId, count] of pieceCounts) {
    if (count < 2) continue;
    const setEntry = relicSetById.get(setId);
    sets.push({ setId, name: setEntry?.name ?? `套装 ${setId}`, pieces: count >= 4 ? 4 : 2 });
  }

  const lightCone: EquippedLightConeInfo = {
    templateId: cone.templateId,
    name: coneEntry.name || cone.name || `光锥 ${cone.templateId}`,
    superimposition: cone.superimposition ?? 1,
    level: cone.level,
    ascension: cone.ascension,
  };

  const skills = source.skills ?? {};
  const pathKey = (catalogue.path || source.path || "unknown").toLowerCase();

  return {
    available: true,
    reason: "",
    combatant: {
      characterId: source.characterId,
      variantKey: `hsr/${source.characterId}/${pathKey}/base`,
      name: displayName,
      element: normalizeElement(catalogue.element),
      path: catalogue.path || source.path || "",
      avatar: catalogue.image ?? undefined,
      level: source.level || 80,
      eidolon: source.eidolon ?? 0,
      abilityVersion: source.abilityVersion ?? 0,
      skills: {
        basic: Number(skills.basic) || 6,
        skill: Number(skills.skill) || 10,
        ult: Number(skills.ult) || 10,
        talent: Number(skills.talent) || 10,
      },
      traces: source.traces ?? {},
      maxEnergy,
      standing: standingStatsToCombatantStats(
        standingStats,
        catalogue.baseStats,
        coneEntry.baseStats,
        source.level || 80,
      ),
      sets,
      lightCone,
    },
  };
}

export function formatDamageCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return Math.round(value).toLocaleString("zh-CN");
}

export function formatDamageExact(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("zh-CN");
}

const DAMAGE_KIND_LABELS: Readonly<Record<DamageKind, string>> = {
  direct: "直伤",
  additional: "附加伤",
  dot: "持续伤害",
  break: "弱点击破",
  superBreak: "超击破",
  elation: "欢愉伤害",
};

export function damageKindLabel(kind: DamageKind): string {
  return DAMAGE_KIND_LABELS[kind];
}

const ELEMENT_LABELS: Readonly<Record<CombatElement, string>> = {
  physical: "物理",
  fire: "火",
  ice: "冰",
  lightning: "雷",
  wind: "风",
  quantum: "量子",
  imaginary: "虚数",
};

export function elementLabel(element: CombatElement): string {
  return ELEMENT_LABELS[element];
}
