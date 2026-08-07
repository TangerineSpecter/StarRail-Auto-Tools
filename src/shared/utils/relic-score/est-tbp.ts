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
import { maxWeightedRolls, scoreRelic, type ScoreRelicInput } from "./score";

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

function combinationsWithReplacement(n: number, k: number): number[][] {
  // Multisets of size k from indices 0..n-1
  if (k === 0) return [[]];
  if (n <= 0) return [];
  const result: number[][] = [];
  const walk = (start: number, path: number[]) => {
    if (path.length === k) {
      result.push(path.slice());
      return;
    }
    for (let i = start; i < n; i += 1) {
      path.push(i);
      walk(i, path);
      path.pop();
    }
  };
  walk(0, []);
  return result;
}

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
  let total = 0;
  const lineWeight = (key: string) => SUBSTAT_LINE_WEIGHT[key as SubstatKey] ?? 0;
  for (const perm of permutations(subs.slice(0, Math.min(4, subs.length)))) {
    let remaining = TOTAL_SUBSTAT_LINE_WEIGHT - lineWeight(mainStat);
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

function multinomialCoefficient(counts: number[]): number {
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

function upgradePatternProbability(upgradeCount: number, pattern: number[]): number {
  // pattern: array of upgrade indices length = upgradeCount; uniform among 4 lines
  // P = (upgradeCount)! / (n0! n1! n2! n3!) / 4^upgradeCount
  if (upgradeCount === 0) return 1;
  const counts = [0, 0, 0, 0];
  for (const index of pattern) counts[index] = (counts[index] ?? 0) + 1;
  return multinomialCoefficient(counts) / 4 ** upgradeCount;
}

function scoreFromLines(
  mainStat: string,
  lines: Array<{ key: string; rolls: number }>,
  weights: Record<string, number>,
): number {
  // Mid quality 0.9 for each roll (documented approximation without full convolution).
  let total = 0;
  for (const line of lines) {
    const weight = effectiveWeight(line.key, weights);
    if (weight <= 0) continue;
    total += weight * line.rolls * 0.9;
  }
  // Ensure main is excluded already by generator.
  void mainStat;
  return total;
}

/**
 * Probability that a random same-slot/main 5★ relic scores strictly above scoreToBeat.
 */
export function probabilitySubAboveScore(
  mainStat: string,
  weights: Record<string, number>,
  scoreToBeat: number,
): number {
  const pool = SUBSTAT_KEYS.filter((key) => key !== mainStat);
  // Force 4 initial lines for enumeration (3-liner fills one upgrade into a new line first).
  const initialCombos = combinations([...pool], 4);
  let totalP = 0;

  for (const opener of initialCombos) {
    const pInitial = probabilityOfInitialSubs(mainStat, opener);

    // 4-liner: 5 upgrades; 3-liner: 4 upgrades (after filling 4th line is already in opener model
    // — we approximate both by scoring openers with 4 or 5 upgrade multisets).
    for (const { pLine, upgrades } of [
      { pLine: P_FOUR_LINER, upgrades: 5 },
      { pLine: P_THREE_LINER, upgrades: 4 },
    ]) {
      const patterns = combinationsWithReplacement(4, upgrades);
      for (const pattern of patterns) {
        const rolls = opener.map(() => 1);
        for (const index of pattern) rolls[index] = (rolls[index] ?? 0) + 1;
        const lines = opener.map((key, i) => ({ key, rolls: rolls[i] ?? 1 }));
        const score = scoreFromLines(mainStat, lines, weights);
        if (score > scoreToBeat + 1e-9) {
          totalP += pLine * pInitial * upgradePatternProbability(upgrades, pattern);
        }
      }
    }
  }

  return Math.min(1, Math.max(0, totalP));
}

export function estimateTbp(
  relic: ScoreRelicInput,
  weights: Record<string, number>,
  options?: { allowedMainStats?: Record<string, string[]> },
): EstTbpResult {
  const scored = scoreRelic(relic, weights, options);
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
    const tbp = estimateTbp(relic, weights, options);
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
