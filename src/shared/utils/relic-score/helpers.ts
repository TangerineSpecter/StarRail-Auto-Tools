/**
 * SPD breakpoint helper, slot replacement ranking, plan usefulness, bulk tags.
 */

import {
  GRADE5_SUBSTAT_ROLLS,
  cloneWeights,
  inferWeightsFromEffectiveSubstats,
  roleWeights,
  type WeightRole,
} from "./tables";
import {
  qualityTagFromScore,
  scoreRelic,
  type RelicScoreResult,
  type ScoreRelicInput,
} from "./score";
import { estimateTbp } from "./est-tbp";

export interface SpdBreakpointResult {
  currentSpd: number;
  targetSpd: number;
  gap: number;
  highRollValue: number;
  midRollValue: number;
  rollsNeededHigh: number;
  rollsNeededMid: number;
  note: string;
}

export function spdBreakpointHelper(currentSpd: number, targetSpd: number): SpdBreakpointResult {
  const gap = Math.max(0, targetSpd - currentSpd);
  const high = GRADE5_SUBSTAT_ROLLS.SPD.high;
  const mid = GRADE5_SUBSTAT_ROLLS.SPD.mid;
  const rollsNeededHigh = gap <= 0 ? 0 : Math.ceil(gap / high - 1e-9);
  const rollsNeededMid = gap <= 0 ? 0 : Math.ceil(gap / mid - 1e-9);
  let note = "已达到或超过目标速度。";
  if (gap > 0) {
    note = `还差 ${gap.toFixed(1)} 速：约 ${rollsNeededHigh} 条速度高 roll（或 ${rollsNeededMid} 条中 roll）。脚部主属性速度另计。`;
  }
  return {
    currentSpd,
    targetSpd,
    gap,
    highRollValue: high,
    midRollValue: mid,
    rollsNeededHigh,
    rollsNeededMid,
    note,
  };
}

export interface SlotReplacementCandidate {
  relic: ScoreRelicInput & { itemId?: number; name?: string; setName?: string };
  score: RelicScoreResult;
  deltaWeightedRolls: number;
}

/** Rank inventory pieces for the same slot that beat the equipped piece. */
export function rankSlotReplacements(
  equipped: ScoreRelicInput | null,
  candidates: Array<ScoreRelicInput & { itemId?: number; name?: string; setName?: string }>,
  weights: Record<string, number>,
  options?: {
    allowedMainStats?: Record<string, string[]>;
    requireSameMain?: boolean;
    limit?: number;
  },
): SlotReplacementCandidate[] {
  const base = equipped ? scoreRelic(equipped, weights, options).weightedRolls : 0;
  const slot = equipped?.slot;
  const main = equipped?.mainStat;
  const scored = candidates
    .filter((relic) => {
      if (slot && relic.slot !== slot) return false;
      if (options?.requireSameMain && main && relic.mainStat !== main) return false;
      return true;
    })
    .map((relic) => {
      const score = scoreRelic(relic, weights, options);
      return {
        relic,
        score,
        deltaWeightedRolls: score.weightedRolls - base,
      };
    })
    .filter((entry) => entry.deltaWeightedRolls > 1e-6)
    .sort((a, b) => b.deltaWeightedRolls - a.deltaWeightedRolls);
  return scored.slice(0, options?.limit ?? 5);
}

export interface PlanUsefulness {
  characterId: number;
  planLabel?: string;
  weights: Record<string, number>;
  score: RelicScoreResult;
  tag: "lock" | "farm" | "discard-candidate";
  useful: boolean;
}

export interface ScoredForPlans {
  best: PlanUsefulness | null;
  byPlan: PlanUsefulness[];
  overallTag: "lock" | "farm" | "discard-candidate";
}

export function scoreRelicForPlans(
  relic: ScoreRelicInput,
  plans: Array<{
    characterId: number;
    planLabel?: string;
    substatWeights?: Record<string, number>;
    effectiveSubstats?: string[];
    mainStats?: Record<string, string[]>;
    minPotentialPct?: number;
    minWeightedRolls?: number;
  }>,
): ScoredForPlans {
  const byPlan: PlanUsefulness[] = plans.map((plan) => {
    const weights =
      plan.substatWeights && Object.keys(plan.substatWeights).length > 0
        ? cloneWeights(plan.substatWeights)
        : inferWeightsFromEffectiveSubstats(plan.effectiveSubstats ?? []);
    const score = scoreRelic(relic, weights, { allowedMainStats: plan.mainStats });
    const tag = qualityTagFromScore(score, {
      minPotentialPct: plan.minPotentialPct,
      minWeightedRolls: plan.minWeightedRolls,
    });
    const mainOk = score.mainStatCorrect !== false;
    const useful = mainOk && (tag === "lock" || tag === "farm");
    return {
      characterId: plan.characterId,
      planLabel: plan.planLabel,
      weights,
      score,
      tag,
      useful,
    };
  });

  const usefulPlans = byPlan.filter((entry) => entry.useful);
  usefulPlans.sort((a, b) => b.score.weightedRolls - a.score.weightedRolls);
  const best =
    usefulPlans[0] ??
    byPlan.sort((a, b) => b.score.weightedRolls - a.score.weightedRolls)[0] ??
    null;

  let overallTag: ScoredForPlans["overallTag"] = "discard-candidate";
  if (byPlan.some((entry) => entry.tag === "lock")) overallTag = "lock";
  else if (byPlan.some((entry) => entry.tag === "farm")) overallTag = "farm";

  return { best, byPlan, overallTag };
}

export function resolvePlanWeights(plan: {
  substatWeights?: Record<string, number> | null;
  effectiveSubstats?: string[];
  role?: WeightRole;
}): Record<string, number> {
  if (plan.substatWeights && Object.keys(plan.substatWeights).length > 0) {
    return cloneWeights(plan.substatWeights);
  }
  if (plan.role) return roleWeights(plan.role);
  return inferWeightsFromEffectiveSubstats(plan.effectiveSubstats ?? []);
}

/**
 * Target relic set IDs for a slot from a build plan.
 * - Cavern slots (Head/Hands/Body/Feet): cavernSetA (+ cavernSetB when 2+2)
 * - Planar slots: planarSetId
 * Returns null when no set is configured (caller should not filter by set).
 */
export function planTargetSetIdsForSlot(
  plan:
    | {
        cavernMode?: string;
        cavernSetA?: number | null;
        cavernSetB?: number | null;
        planarSetId?: number | null;
      }
    | null
    | undefined,
  slot: string,
): number[] | null {
  if (!plan) return null;
  const isPlanar = slot === "PlanarSphere" || slot === "LinkRope";
  if (isPlanar) {
    const id = plan.planarSetId ?? 0;
    return id > 0 ? [id] : null;
  }
  const ids: number[] = [];
  if ((plan.cavernSetA ?? 0) > 0) ids.push(plan.cavernSetA as number);
  if (plan.cavernMode === "twoPlusTwo" && (plan.cavernSetB ?? 0) > 0) {
    ids.push(plan.cavernSetB as number);
  }
  return ids.length > 0 ? [...new Set(ids)] : null;
}

export function planQualityCompletion(
  relics: ScoreRelicInput[],
  weights: Record<string, number>,
  options: {
    allowedMainStats?: Record<string, string[]>;
    minPotentialPct?: number;
  },
): {
  mainStatCorrectCount: number;
  mainStatTotal: number;
  qualityPassCount: number;
  qualityTotal: number;
  averagePotentialPct: number;
  mainStatRatio: number;
  qualityRatio: number;
  combinedRatio: number;
} {
  const minPct = options.minPotentialPct ?? 40;
  let mainOk = 0;
  let qualityOk = 0;
  let potentialSum = 0;
  const total = relics.length;
  for (const relic of relics) {
    const score = scoreRelic(relic, weights, {
      allowedMainStats: options.allowedMainStats,
    });
    if (score.mainStatCorrect !== false) mainOk += 1;
    if (score.letterGrade !== null && score.potentialPct >= minPct) qualityOk += 1;
    potentialSum += score.potentialPct;
  }
  const mainStatRatio = total > 0 ? mainOk / total : 0;
  const qualityRatio = total > 0 ? qualityOk / total : 0;
  return {
    mainStatCorrectCount: mainOk,
    mainStatTotal: total,
    qualityPassCount: qualityOk,
    qualityTotal: total,
    averagePotentialPct: total > 0 ? potentialSum / total : 0,
    mainStatRatio,
    qualityRatio,
    combinedRatio: total > 0 ? 0.5 * mainStatRatio + 0.5 * qualityRatio : 0,
  };
}

export function compareRelicEstDays(
  lowerScoreRelic: ScoreRelicInput,
  higherScoreRelic: ScoreRelicInput,
  weights: Record<string, number>,
): { lowerDays: number; higherDays: number } {
  return {
    lowerDays: estimateTbp(lowerScoreRelic, weights).days,
    higherDays: estimateTbp(higherScoreRelic, weights).days,
  };
}
