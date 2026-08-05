/**
 * Expected perfection change if substats were fully rerolled (analytical average).
 */

import {
  SUBSTAT_KEYS,
  effectiveWeight,
} from "./tables";
import { maxWeightedRolls, scoreRelic, type ScoreRelicInput } from "./score";
import { probabilityOfInitialSubs } from "./est-tbp";

export interface RerollPotentialResult {
  currentPerfectionPct: number;
  expectedPerfectionPct: number;
  deltaPct: number;
  summary: string;
}

/**
 * Approximate expected weighted rolls after a full substat reroll on a 5★ piece:
 * sample all 4-line openers (weighted) with mid-quality (0.9) and average 5 upgrade
 * hits distributed uniformly — closed form via opener weights only.
 */
export function expectedWeightedRollsAfterReroll(
  mainStat: string,
  weights: Record<string, number>,
): number {
  const pool = SUBSTAT_KEYS.filter((key) => key !== mainStat);
  // Enumerate 4-line openers
  const combos: string[][] = [];
  for (let a = 0; a < pool.length; a += 1) {
    for (let b = a + 1; b < pool.length; b += 1) {
      for (let c = b + 1; c < pool.length; c += 1) {
        for (let d = c + 1; d < pool.length; d += 1) {
          combos.push([pool[a]!, pool[b]!, pool[c]!, pool[d]!]);
        }
      }
    }
  }

  let weightedSum = 0;
  let totalP = 0;
  for (const opener of combos) {
    const p = probabilityOfInitialSubs(mainStat, opener);
    if (p <= 0) continue;
    const lineWeights = opener.map((key) => effectiveWeight(key, weights));
    // Initial 4 lines at mid quality 0.9 each
    let score = lineWeights.reduce((sum, w) => sum + w * 0.9, 0);
    // 5 upgrades uniform among 4 lines → expected upgrades per line = 5/4
    // each upgrade mid quality 0.9
    score += lineWeights.reduce((sum, w) => sum + w * (5 / 4) * 0.9, 0);
    weightedSum += p * score;
    totalP += p;
  }
  return totalP > 0 ? weightedSum / totalP : 0;
}

export function rerollPotential(
  relic: ScoreRelicInput,
  weights: Record<string, number>,
): RerollPotentialResult {
  const scored = scoreRelic(relic, weights);
  const maxRolls = maxWeightedRolls(relic.mainStat, weights);
  const expectedRolls = expectedWeightedRollsAfterReroll(relic.mainStat, weights);
  const currentPerfectionPct = scored.perfectionPct;
  const expectedPerfectionPct =
    maxRolls > 0 ? Math.min(100, (expectedRolls / maxRolls) * 100) : 0;
  const deltaPct = expectedPerfectionPct - currentPerfectionPct;
  let summary = "重塑期望接近当前水平。";
  if (deltaPct <= -10) summary = "重塑大概率变差，不建议。";
  else if (deltaPct <= -3) summary = "重塑平均略差，谨慎使用。";
  else if (deltaPct >= 10) summary = "重塑平均明显提升，可考虑。";
  else if (deltaPct >= 3) summary = "重塑平均略有提升。";

  return {
    currentPerfectionPct,
    expectedPerfectionPct,
    deltaPct,
    summary,
  };
}
