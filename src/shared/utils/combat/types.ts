/**
 * Shared pure combat calculation & lightweight battle simulation contracts.
 * All ratios use decimal representation (e.g. 50% = 0.50).
 */

export type CombatElement =
  "physical" | "fire" | "ice" | "lightning" | "wind" | "quantum" | "imaginary";

export type DamageKind = "direct" | "additional" | "dot" | "break" | "superBreak" | "elation";

export type AbilityKind = "basic" | "skill" | "ult" | "fua" | "talent" | "summon" | "other";

export type TargetPattern = "single" | "blast" | "aoe" | "bounce" | "self" | "ally" | "team";

export type ModelingDepth = "deep" | "generic";

export interface BasePanelStats {
  hp: number;
  atk: number;
  def: number;
  speed: number;
}

export interface CombatantStats {
  level: number;
  base: BasePanelStats;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  critRate: number;
  critDamage: number;
  breakEffect: number;
  effectHitRate: number;
  effectRes: number;
  energyRegenRate: number;
  healingBoost: number;
  elation: number;
  genericDamageBoost: number;
  elementalDamageBoost: Partial<Record<CombatElement, number>>;
  abilityDamageBoost: Partial<Record<AbilityKind, number>>;
  breakDamageBoost: number;
  defensePenetration: number;
  superBreakDefensePenetration: number;
  resistancePenetration: number;
  vulnerability: number;
  breakVulnerability: number;
  finalDamageBoost: number;
  trueDamageModifier: number;
  breakEfficiencyBoost: number;
  superBreakModifier: number;
}

export interface EnemyPreset {
  level: number;
  targetCount: 1 | 3 | 5;
  maxToughness: number;
  baseResistance: number;
  effectResistance: number;
  enemySpeed: number;
  /** When true, targets are assumed weak to every ally's element (weakness matched). */
  weaknessMatched: boolean;
  /** Initial broken state for single-skill / static preview calculations. */
  initiallyBroken: boolean;
}

export interface DamageBreakdown {
  damageKind: DamageKind;
  element: CombatElement;
  baseDamage: number;
  brokenMultiplier: number;
  defenseMultiplier: number;
  resistanceMultiplier: number;
  vulnerabilityMultiplier: number;
  damageBoostMultiplier: number;
  finalDamageMultiplier: number;
  trueDamageMultiplier: number;
  critMultiplier: number;
  nonCritDamage: number;
  critDamage: number;
  expectedDamage: number;
  actualDamage: number;
  didCrit: boolean;
  effectiveToughnessDamage?: number;
  effectiveSuperBreakModifier?: number;
  inactiveReason?: string;
}

export interface EquippedSetCount {
  setId: number;
  name: string;
  pieces: number;
}

export interface EquippedLightConeInfo {
  templateId: number;
  name: string;
  superimposition: number;
  level: number;
  ascension: number;
}

export interface CombatantInput {
  characterId: number;
  variantKey: string;
  name: string;
  element: CombatElement;
  path: string;
  avatar?: string;
  level: number;
  eidolon: number;
  abilityVersion: number;
  skills: {
    basic: number;
    skill: number;
    ult: number;
    talent: number;
  };
  traces: Record<string, boolean>;
  maxEnergy: number;
  standing: CombatantStats;
  sets: EquippedSetCount[];
  lightCone: EquippedLightConeInfo | null;
}

export interface SkillPreviewResult {
  id: string;
  name: string;
  abilityKind: AbilityKind;
  pattern: TargetPattern;
  element: CombatElement;
  nonCritTotal: number;
  critTotal: number;
  expectedTotal: number;
  directExpected: number;
  superBreakExpected: number;
  toughnessMain: number;
  toughnessAdjacent: number;
  hitCount: number;
  primaryBreakdown: DamageBreakdown;
  notes: string[];
}

export interface CombatHitRecord {
  targetIndex: number;
  damageKind: DamageKind;
  element: CombatElement;
  amount: number;
  didCrit: boolean;
  causedBreak?: boolean;
  causedExoBreak?: boolean;
  toughnessDelta?: number;
  breakdown: DamageBreakdown;
}

export interface ActionLogEntry {
  step: number;
  cycle: number;
  actionValue: number;
  actorId: number;
  actorName: string;
  isSummon?: boolean;
  summonName?: string;
  actionName: string;
  abilityKind: AbilityKind;
  spBefore: number;
  spAfter: number;
  energyBefore: number;
  energyAfter: number;
  maxEnergy: number;
  totalDamage: number;
  directDamage: number;
  breakDamage: number;
  superBreakDamage: number;
  additionalDamage: number;
  dotDamage: number;
  hits: CombatHitRecord[];
  tags: string[];
  summary: string;
}

export interface CharacterDamageContribution {
  characterId: number;
  name: string;
  avatar?: string;
  element: CombatElement;
  modelingDepth: ModelingDepth;
  modelingSummary: string;
  totalDamage: number;
  share: number;
  actions: number;
  byKind: Record<DamageKind, number>;
}

export interface SimulationConfig {
  cycles: 1 | 3 | 5 | 10;
  enemy: EnemyPreset;
  seed?: number;
  /** Include technique opener buffs (e.g. Ruan Mei auto-skill, Firefly weakness implant). */
  useTechniques?: boolean;
  /** Deterministic expected crit instead of random crit rolls (used for baseline comparison). */
  deterministic?: boolean;
}

export interface SimulationRunResult {
  seed: number;
  cycles: 1 | 3 | 5 | 10;
  horizonAv: number;
  totalDamage: number;
  comboDamage: number;
  comboLabel: string;
  totalActions: number;
  breakCount: number;
  byKind: Record<DamageKind, number>;
  contributions: CharacterDamageContribution[];
  logs: ActionLogEntry[];
  assumptions: string[];
  activeMechanisms: string[];
  unmodeledWarnings: string[];
}

export interface CycleDamageComparison {
  cycles: 1 | 3 | 5 | 10;
  meanDamage: number;
  minDamage: number;
  maxDamage: number;
  p10Damage: number;
  p90Damage: number;
  actions: number;
}

export interface MonteCarloSummary {
  cycles: 1 | 3 | 5 | 10;
  runs: number;
  meanDamage: number;
  medianDamage: number;
  minDamage: number;
  maxDamage: number;
  p10Damage: number;
  p90Damage: number;
  comboDamage: number;
  comboLabel: string;
  byKindMean: Record<DamageKind, number>;
  contributionsMean: CharacterDamageContribution[];
  sampleRun: SimulationRunResult;
  cycleComparisons: CycleDamageComparison[];
  assumptions: string[];
  activeMechanisms: string[];
  unmodeledWarnings: string[];
}

export interface CharacterDamageSnapshot {
  characterId: number;
  name: string;
  modelingDepth: ModelingDepth;
  modelingBadge: string;
  coreSkillName: string;
  coreSkillExpected: number;
  coreSkillCrit: number;
  comboDamage: number;
  comboLabel: string;
  fiveCycleMean: number;
  fiveCycleP10: number;
  fiveCycleP90: number;
  primaryDamageKind: DamageKind;
  skillPreviews: SkillPreviewResult[];
}
