/**
 * Pure Stat Score / weighted-roll / potential helpers.
 * No Tauri dependency — unit-testable from vitest.
 */

import {
  FLAT_SUBSTATS,
  GRADE5_SUBSTAT_ROLLS,
  SUBSTAT_KEYS,
  effectiveWeight,
  letterGradeFromPotential,
  type SubstatKey,
} from "./tables";

export interface ScoreSubstat {
  key: string;
  value?: number;
  /**
   * Roll count on this line. Live/export inventory uses **total rolls including the
   * initial line** (typically ≥ 1; sum across four lines ≈ 8–9 on a +15 piece).
   * Legacy demo JSON sometimes stores **enhancement hits only** (0 = initial only;
   * sum ≈ 5 on +15). Detection: any line with `count === 0` ⇒ enhancement-hit mode.
   */
  count?: number;
  /** Extra quality steps above low rolls (each step ≈ +0.1 quality unit). */
  step?: number;
  kind?: string;
}

export interface ScoreRelicInput {
  slot: string;
  mainStat: string;
  rarity?: number;
  level?: number;
  substats?: ScoreSubstat[];
  setId?: number;
}

export interface WeightedRollBreakdown {
  key: string;
  rolls: number;
  qualityUnits: number;
  weight: number;
  contribution: number;
}

export interface RelicScoreResult {
  weightedRolls: number;
  breakdown: WeightedRollBreakdown[];
  potentialPct: number;
  letterGrade: string | null;
  mainStatCorrect: boolean | null;
  idealPotential: number;
  currentPotential: number;
  /** Max weighted high-roll units for a 5★ perfect piece (4 wanted lines + 5 max upgrades). */
  maxWeightedRolls: number;
  perfectionPct: number;
}

function normalSubstats(substats: ScoreSubstat[] | undefined): ScoreSubstat[] {
  return (substats ?? []).filter((stat) => !stat.kind || stat.kind === "normal");
}

/**
 * True when `count` is enhancement hits after the initial line (legacy/demo).
 * Live data never uses 0; presence of any 0 selects enhancement-hit mode.
 */
export function usesEnhancementHitCount(substats: ScoreSubstat[] | undefined): boolean {
  return normalSubstats(substats).some(
    (stat) => typeof stat.count === "number" && Number.isFinite(stat.count) && stat.count === 0,
  );
}

/**
 * Total rolls on a line (initial + upgrades).
 * - Live/export: `count` already includes the initial line.
 * - Legacy/demo (`usesEnhancementHitCount`): `count` is upgrades only → rolls = count + 1.
 * When count is missing, infer from value / mid-roll.
 */
export function totalRollsOnLine(
  stat: ScoreSubstat,
  options?: { enhancementHits?: boolean },
): number {
  if (typeof stat.count === "number" && Number.isFinite(stat.count)) {
    const count = Math.floor(stat.count);
    if (options?.enhancementHits) {
      return Math.max(1, count + 1);
    }
    // Total-rolls convention; treat non-positive as a single initial roll.
    return Math.max(1, count);
  }
  const rolls = GRADE5_SUBSTAT_ROLLS[stat.key as SubstatKey];
  if (rolls && typeof stat.value === "number" && stat.value > 0) {
    return Math.max(1, Math.round(stat.value / rolls.mid));
  }
  return 1;
}

/**
 * Upgrade hits after the initial line (what the UI “+N” badge should show).
 *
 * Game range (5★ +15): the piece gets 5 substat events; a single line can receive
 * at most those 5 upgrades → enhancement hits ∈ [0, 5] (MAX at 5).
 * Live inventory `count` is total rolls including the initial line, so hits = count − 1.
 */
export function enhancementHitsOnLine(
  stat: Pick<ScoreSubstat, "count">,
  options?: { enhancementHits?: boolean },
): number {
  if (typeof stat.count === "number" && Number.isFinite(stat.count)) {
    const count = Math.floor(stat.count);
    const hits = options?.enhancementHits ? Math.max(0, count) : Math.max(0, count - 1);
    // Clamp to game max upgrades on one line (+15 / every +3).
    return Math.min(5, hits);
  }
  return 0;
}

/** Badge text for enhancement hits: null when none, "+N" for 1–4, "MAX" for 5. */
export function formatEnhancementHitBadge(hits: number): string | null {
  if (!Number.isFinite(hits) || hits <= 0) return null;
  if (hits >= 5) return "MAX";
  return `+${Math.floor(hits)}`;
}

/**
 * Quality-adjusted roll units: low=0.8, mid=0.9, high=1.0.
 * Uses `step` as sum of quality steps above low across all rolls on the line.
 */
export function qualityUnitsOnLine(
  stat: ScoreSubstat,
  options?: { enhancementHits?: boolean },
): number {
  const rolls = totalRollsOnLine(stat, options);
  const maxStep = rolls * 2;
  let step = typeof stat.step === "number" && Number.isFinite(stat.step) ? stat.step : 0;
  step = Math.max(0, Math.min(maxStep, step));
  // Base every roll at low (0.8); each step adds 0.1 (low→mid or mid→high).
  return rolls * 0.8 + step * 0.1;
}

export function weightedRollsOfRelic(
  relic: ScoreRelicInput,
  weights: Record<string, number>,
): { total: number; breakdown: WeightedRollBreakdown[] } {
  const enhancementHits = usesEnhancementHitCount(relic.substats);
  const rollOpts = { enhancementHits };
  const breakdown: WeightedRollBreakdown[] = [];
  let total = 0;
  for (const stat of normalSubstats(relic.substats)) {
    const weight = effectiveWeight(stat.key, weights);
    if (weight <= 0) continue;
    const qualityUnits = qualityUnitsOnLine(stat, rollOpts);
    const contribution = weight * qualityUnits;
    total += contribution;
    breakdown.push({
      key: stat.key,
      rolls: totalRollsOnLine(stat, rollOpts),
      qualityUnits,
      weight,
      contribution,
    });
  }
  return { total, breakdown };
}

/**
 * Ideal potential in the same units as weighted rolls: weight × qualityUnits.
 * One high roll contributes `weight * 1.0` (qualityUnits already normalize low/mid/high).
 * Do NOT multiply by potentialScale here — that path is for raw value×scale scoring;
 * applying both double-counts CR vs CD display magnitudes.
 */
export function idealPotentialUnits(
  mainStat: string,
  weights: Record<string, number>,
): number {
  const candidates = SUBSTAT_KEYS.filter((key) => key !== mainStat)
    .map((key) => ({
      key,
      unit: effectiveWeight(key, weights),
    }))
    .filter((item) => item.unit > 0)
    .sort((a, b) => b.unit - a.unit);

  if (candidates.length === 0) return 0;

  const openers = candidates.slice(0, 4);
  let total = openers.reduce((sum, item) => sum + item.unit, 0);
  const bestUnit = openers[0]?.unit ?? 0;
  // 5 upgrade rolls at high quality into the best weighted line among openers.
  total += 5 * bestUnit;
  return total;
}

export function currentPotentialUnits(
  relic: ScoreRelicInput,
  weights: Record<string, number>,
): number {
  const rollOpts = { enhancementHits: usesEnhancementHitCount(relic.substats) };
  let total = 0;
  for (const stat of normalSubstats(relic.substats)) {
    const weight = effectiveWeight(stat.key, weights);
    if (weight <= 0) continue;
    // qualityUnits already encode 0.8/0.9/1.0 per roll; match weighted-roll units.
    total += weight * qualityUnitsOnLine(stat, rollOpts);
  }
  return total;
}

/** Maximum weighted rolls for perfection: 4 openers + 5 upgrades, all high (1.0), best weights. */
export function maxWeightedRolls(
  mainStat: string,
  weights: Record<string, number>,
): number {
  const candidates = SUBSTAT_KEYS.filter((key) => key !== mainStat)
    .map((key) => ({ key, w: effectiveWeight(key, weights) }))
    .filter((item) => item.w > 0)
    .sort((a, b) => b.w - a.w);
  if (candidates.length === 0) return 0;
  const openers = candidates.slice(0, 4);
  const best = openers[0]?.w ?? 0;
  return openers.reduce((sum, item) => sum + item.w, 0) + 5 * best;
}

export function isMainStatAllowed(
  slot: string,
  mainStat: string,
  allowedMainStats?: Record<string, string[]>,
): boolean | null {
  if (!allowedMainStats) return null;
  const allowed = allowedMainStats[slot];
  if (!allowed || allowed.length === 0) return null;
  return allowed.includes(mainStat);
}

export function scoreRelic(
  relic: ScoreRelicInput,
  weights: Record<string, number>,
  options?: { allowedMainStats?: Record<string, string[]> },
): RelicScoreResult {
  const { total, breakdown } = weightedRollsOfRelic(relic, weights);
  const ideal = idealPotentialUnits(relic.mainStat, weights);
  const current = currentPotentialUnits(relic, weights);
  const mainStatCorrect = isMainStatAllowed(
    relic.slot,
    relic.mainStat,
    options?.allowedMainStats,
  );
  // Wrong selectable main stats do not receive a letter grade (Stat Score guide).
  const selectableWrong =
    mainStatCorrect === false &&
    relic.slot !== "Head" &&
    relic.slot !== "Hands";
  const potentialPct = ideal > 0 ? (current / ideal) * 100 : 0;
  const maxRolls = maxWeightedRolls(relic.mainStat, weights);
  const perfectionPct = maxRolls > 0 ? Math.min(100, (total / maxRolls) * 100) : 0;

  return {
    weightedRolls: total,
    breakdown,
    potentialPct,
    letterGrade: selectableWrong ? null : letterGradeFromPotential(potentialPct),
    mainStatCorrect,
    idealPotential: ideal,
    currentPotential: current,
    maxWeightedRolls: maxRolls,
    perfectionPct,
  };
}

export function averageCharacterPotential(
  relics: ScoreRelicInput[],
  weights: Record<string, number>,
  options?: { allowedMainStats?: Record<string, string[]> },
): {
  averagePotentialPct: number;
  pieces: Array<RelicScoreResult & { slot: string; mainStat: string }>;
  weakSlot: string | null;
} {
  const pieces = relics.map((relic) => ({
    ...scoreRelic(relic, weights, options),
    slot: relic.slot,
    mainStat: relic.mainStat,
  }));
  if (pieces.length === 0) {
    return { averagePotentialPct: 0, pieces, weakSlot: null };
  }
  const graded = pieces.filter((piece) => piece.letterGrade !== null);
  const averagePotentialPct =
    graded.length > 0
      ? graded.reduce((sum, piece) => sum + piece.potentialPct, 0) / graded.length
      : pieces.reduce((sum, piece) => sum + piece.potentialPct, 0) / pieces.length;
  let weakSlot: string | null = null;
  let weakPct = Infinity;
  for (const piece of pieces) {
    if (piece.potentialPct < weakPct) {
      weakPct = piece.potentialPct;
      weakSlot = piece.slot;
    }
  }
  return { averagePotentialPct, pieces, weakSlot };
}

export function qualityTagFromScore(
  score: RelicScoreResult,
  options?: { minPotentialPct?: number; minWeightedRolls?: number },
): "lock" | "farm" | "discard-candidate" {
  const minPct = options?.minPotentialPct ?? 50;
  const minRolls = options?.minWeightedRolls ?? 4;
  if (score.mainStatCorrect === false) return "discard-candidate";
  if (score.potentialPct >= minPct || score.weightedRolls >= minRolls) return "lock";
  if (score.potentialPct >= 25 || score.weightedRolls >= 2) return "farm";
  return "discard-candidate";
}

export function isFlatStat(stat: string): boolean {
  return FLAT_SUBSTATS.has(stat);
}
