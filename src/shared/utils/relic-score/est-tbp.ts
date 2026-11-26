/**
 * Analytical Estimated TBP (approximate, documented).
 * Enumerates initial substat combinations and upgrade multisets without
 * full 0.8/0.9/1.0 convolution for each upgrade (mid quality 0.9 used for upgrades).
 */

import {
  P_FOUR_LINER,
  P_THREE_LINER,
  SUBSTAT_KEYS,
  SUBSTAT_LINE_WEIGHT,
  TBP_PER_DAY,
  TBP_PER_RELIC,
  TOTAL_SUBSTAT_LINE_WEIGHT,
  effectiveWeight,
  probabilityOfMain,
  type SubstatKey,
} from "./tables";
import { maxWeightedRolls, scoreRelic, type RelicScoreResult, type ScoreRelicInput } from "./score";

export interface EstTbpResult {
  pMain: number;
  pSub: number;
  p: number;
  estRelicCount: number;
  estTbp: number;
  days: number;
  scoreToBeat: number;
  perfectionPct: number;
  /** Heuristic farming advice. */
  advice: "优先刷" | "可继续" | "可停刷" | "主属性不符";
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k < 0 || k > items.length) return [];
  if (k === 0) return [[]];
  if (k === items.length) return [items.slice()];
  const result: T[][] = [];
  const walk = (start: number, path: T[]) => {
    if (path.length === k) {
      result.push(path.slice());
      return;
    }
    for (let i = start; i < items.length; i += 1) {
      path.push(items[i]!);
      walk(i + 1, path);
      path.pop();
    }
  };
  walk(0, []);
  return result;
}

function multinomialCoefficient(counts: readonly number[]): number {
  let result = 1;
  let filled = 0;
  for (const count of counts) {
    for (let i = 1; i <= count; i += 1) {
      filled += 1;
      result = (result * filled) / i;
    }
  }
  return result;
}

interface PrecomputedUpgradePattern {
  r0: number;
  r1: number;
  r2: number;
  r3: number;
  weightedProb: number;
}

function buildUpgradePatterns(upgrades: number, pLine: number): PrecomputedUpgradePattern[] {
  const denom = 4 ** upgrades;
  const patterns: PrecomputedUpgradePattern[] = [];
  for (let c0 = 0; c0 <= upgrades; c0 += 1) {
    for (let c1 = 0; c1 <= upgrades - c0; c1 += 1) {
      for (let c2 = 0; c2 <= upgrades - c0 - c1; c2 += 1) {
        const c3 = upgrades - c0 - c1 - c2;
        const prob = (pLine * multinomialCoefficient([c0, c1, c2, c3])) / denom;
        patterns.push({
          r0: (1 + c0) * 0.9,
          r1: (1 + c1) * 0.9,
          r2: (1 + c2) * 0.9,
          r3: (1 + c3) * 0.9,
          weightedProb: prob,
        });
      }
    }
  }
  return patterns;
}

// Combined 4-liner (5 upgrades) + 3-liner (4 upgrades) multiset roll tables, computed once.
const ALL_UPGRADE_PATTERNS: readonly PrecomputedUpgradePattern[] = [
  ...buildUpgradePatterns(5, P_FOUR_LINER),
  ...buildUpgradePatterns(4, P_THREE_LINER),
];

const PERM_INDICES_4: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 2, 3],
  [0, 1, 3, 2],
  [0, 2, 1, 3],
  [0, 2, 3, 1],
  [0, 3, 1, 2],
  [0, 3, 2, 1],
  [1, 0, 2, 3],
  [1, 0, 3, 2],
  [1, 2, 0, 3],
  [1, 2, 3, 0],
  [1, 3, 0, 2],
  [1, 3, 2, 0],
  [2, 0, 1, 3],
  [2, 0, 3, 1],
  [2, 1, 0, 3],
  [2, 1, 3, 0],
  [2, 3, 0, 1],
  [2, 3, 1, 0],
  [3, 0, 1, 2],
  [3, 0, 2, 1],
  [3, 1, 0, 2],
  [3, 1, 2, 0],
  [3, 2, 0, 1],
  [3, 2, 1, 0],
];

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const perm of permutations(rest)) {
      result.push([items[i]!, ...perm]);
    }
  }
  return result;
}

export function probabilityOfInitialSubs(mainStat: string, subs: string[]): number {
  const lineWeight = (key: string) => SUBSTAT_LINE_WEIGHT[key as SubstatKey] ?? 0;
  const startRemaining = TOTAL_SUBSTAT_LINE_WEIGHT - lineWeight(mainStat);
  if (subs.length >= 4) {
    const w0 = lineWeight(subs[0]!);
    const w1 = lineWeight(subs[1]!);
    const w2 = lineWeight(subs[2]!);
    const w3 = lineWeight(subs[3]!);
    if (w0 <= 0 || w1 <= 0 || w2 <= 0 || w3 <= 0) return 0;
    const weights = [w0, w1, w2, w3];
    let total = 0;
    for (const [i0, i1, i2, i3] of PERM_INDICES_4) {
      const a = weights[i0]!;
      const b = weights[i1]!;
      const c = weights[i2]!;
      const d = weights[i3]!;
      const r0 = startRemaining;
      const r1 = r0 - a;
      const r2 = r1 - b;
      const r3 = r2 - c;
      if (r0 <= 0 || r1 <= 0 || r2 <= 0 || r3 <= 0) continue;
      total += (a / r0) * (b / r1) * (c / r2) * (d / r3);
    }
    return total;
  }
  let total = 0;
  for (const perm of permutations(subs)) {
    let remaining = startRemaining;
    let p = 1;
    for (const sub of perm) {
      const weight = lineWeight(sub);
      if (remaining <= 0 || weight <= 0) {
        p = 0;
        break;
      }
      p *= weight / remaining;
      remaining -= weight;
    }
    total += p;
  }
  return total;
}

interface CachedOpener {
  k0: SubstatKey;
  k1: SubstatKey;
  k2: SubstatKey;
  k3: SubstatKey;
  pInitial: number;
}

const openersByMainStatCache = new Map<string, readonly CachedOpener[]>();

function getOpenersForMainStat(mainStat: string): readonly CachedOpener[] {
  const cached = openersByMainStatCache.get(mainStat);
  if (cached) return cached;
  const pool = SUBSTAT_KEYS.filter((key) => key !== mainStat);
  const initialCombos = combinations([...pool], 4);
  const openers: CachedOpener[] = initialCombos.map((opener) => ({
    k0: opener[0]!,
    k1: opener[1]!,
    k2: opener[2]!,
    k3: opener[3]!,
    pInitial: probabilityOfInitialSubs(mainStat, opener),
  }));
  openersByMainStatCache.set(mainStat, openers);
  return openers;
}

/**
 * Probability that a random same-slot/main 5★ relic scores strictly above scoreToBeat.
 */
export function probabilitySubAboveScore(
  mainStat: string,
  weights: Record<string, number>,
  scoreToBeat: number,
): number {
  const openers = getOpenersForMainStat(mainStat);
  const threshold = scoreToBeat + 1e-9;
  const weightByKey: Record<string, number> = {};
  for (const key of SUBSTAT_KEYS) {
    const w = effectiveWeight(key, weights);
    weightByKey[key] = w > 0 ? w : 0;
  }

  let totalP = 0;
  for (const opener of openers) {
    const w0 = weightByKey[opener.k0] ?? 0;
    const w1 = weightByKey[opener.k1] ?? 0;
    const w2 = weightByKey[opener.k2] ?? 0;
    const w3 = weightByKey[opener.k3] ?? 0;

    // Fast upper-bound prune: best possible score puts all 5 upgrades on the max-weighted line.
    const maxW = Math.max(w0, w1, w2, w3);
    if ((w0 + w1 + w2 + w3 + 5 * maxW) * 0.9 <= threshold) continue;

    // Fast lower-bound accept: even 4 upgrades on the min-weighted line beat threshold.
    const minW = Math.min(w0, w1, w2, w3);
    if ((w0 + w1 + w2 + w3 + 4 * minW) * 0.9 > threshold) {
      totalP += opener.pInitial;
      continue;
    }

    let openerProb = 0;
    for (const pattern of ALL_UPGRADE_PATTERNS) {
      const score = w0 * pattern.r0 + w1 * pattern.r1 + w2 * pattern.r2 + w3 * pattern.r3;
      if (score > threshold) {
        openerProb += pattern.weightedProb;
      }
    }
    totalP += opener.pInitial * openerProb;
  }

  return Math.min(1, Math.max(0, totalP));
}

function estimateTbpFromScore(
  relic: ScoreRelicInput,
  weights: Record<string, number>,
  scored: RelicScoreResult,
): EstTbpResult {
  const scoreToBeat = scored.weightedRolls;
  const pMain = probabilityOfMain(relic.slot, relic.mainStat);
  const pSub = probabilitySubAboveScore(relic.mainStat, weights, scoreToBeat);
  const p = pMain * pSub;
  const estRelicCount = p > 0 ? 1 / p : Number.POSITIVE_INFINITY;
  const estTbp = Number.isFinite(estRelicCount)
    ? estRelicCount * TBP_PER_RELIC
    : Number.POSITIVE_INFINITY;
  const days = Number.isFinite(estTbp) ? estTbp / TBP_PER_DAY : Number.POSITIVE_INFINITY;

  let advice: EstTbpResult["advice"] = "可继续";
  if (scored.mainStatCorrect === false) advice = "主属性不符";
  else if (days >= 60 || scored.perfectionPct >= 70) advice = "可停刷";
  else if (days <= 14) advice = "优先刷";

  return {
    pMain,
    pSub,
    p,
    estRelicCount,
    estTbp,
    days,
    scoreToBeat,
    perfectionPct: scored.perfectionPct,
    advice,
  };
}

export function estimateTbp(
  relic: ScoreRelicInput,
  weights: Record<string, number>,
  options?: { allowedMainStats?: Record<string, string[]> },
): EstTbpResult {
  const scored = scoreRelic(relic, weights, options);
  return estimateTbpFromScore(relic, weights, scored);
}

export function characterFarmInvestment(slotEstimates: Array<{ slot: string; days: number }>): {
  bottleneckSlot: string | null;
  bottleneckDays: number;
  sumDays: number;
  estimateDays: number;
} {
  if (slotEstimates.length === 0) {
    return {
      bottleneckSlot: null,
      bottleneckDays: 0,
      sumDays: 0,
      estimateDays: 0,
    };
  }
  let bottleneckSlot: string | null = null;
  let bottleneckDays = Number.NEGATIVE_INFINITY;
  let sumDays = 0;
  let anyInfinite = false;
  for (const entry of slotEstimates) {
    const days = entry.days;
    if (!Number.isFinite(days)) {
      anyInfinite = true;
      sumDays = Number.POSITIVE_INFINITY;
      bottleneckDays = Number.POSITIVE_INFINITY;
      bottleneckSlot = entry.slot;
      continue;
    }
    if (Number.isFinite(sumDays)) sumDays += days;
    if (days > bottleneckDays) {
      bottleneckDays = days;
      bottleneckSlot = entry.slot;
    }
  }
  if (anyInfinite || !Number.isFinite(bottleneckDays) || !Number.isFinite(sumDays)) {
    return {
      bottleneckSlot,
      bottleneckDays: Number.POSITIVE_INFINITY,
      sumDays: Number.POSITIVE_INFINITY,
      estimateDays: Number.POSITIVE_INFINITY,
    };
  }
  // Practical estimate: bottleneck dominates; add a soft fraction of the rest.
  const estimateDays = bottleneckDays + Math.max(0, sumDays - bottleneckDays) * 0.25;
  return { bottleneckSlot, bottleneckDays, sumDays, estimateDays };
}

export function farmingPriorityRows(
  relics: ScoreRelicInput[],
  weights: Record<string, number>,
  options?: { allowedMainStats?: Record<string, string[]> },
): Array<{
  slot: string;
  mainStat: string;
  weightedRolls: number;
  potentialPct: number;
  letterGrade: string | null;
  days: number;
  estTbp: number;
  advice: EstTbpResult["advice"];
  perfectionPct: number;
}> {
  return relics.map((relic) => {
    const score = scoreRelic(relic, weights, options);
    const tbp = estimateTbpFromScore(relic, weights, score);
    return {
      slot: relic.slot,
      mainStat: relic.mainStat,
      weightedRolls: score.weightedRolls,
      potentialPct: score.potentialPct,
      letterGrade: score.letterGrade,
      days: tbp.days,
      estTbp: tbp.estTbp,
      advice: tbp.advice,
      perfectionPct: score.perfectionPct,
    };
  });
}

export { maxWeightedRolls };
