import type {
  BuildDashboardEntry,
  BuildDashboardRelic,
  CharacterBuildPlan,
  CharacterBuildScore,
} from "@/types";
import { planQualityCompletion, resolvePlanWeights } from "./helpers";
import { averageCharacterPotential } from "./score";
import { letterGradeFromPotential } from "./tables";

const DEFAULT_SLOTS = ["Head", "Hands", "Body", "Feet", "PlanarSphere", "LinkRope"] as const;

/** Client-side score summary before persistence (no characterId / computedAt). */
export interface CharacterScoreSummary {
  letterGrade: string;
  potentialPct: number;
  completionPct: number;
  relicCount: number;
  hasPlan: boolean;
}

export interface ScoreRelicLike {
  slot?: string;
  mainStat: string;
  substats?: Array<{
    kind?: string;
    key: string;
    value?: number;
    count?: number;
    step?: number;
  }>;
}

function relicInputs(relics: ScoreRelicLike[]) {
  return relics.map((relic, index) => ({
    slot: relic.slot ?? DEFAULT_SLOTS[index] ?? "Head",
    mainStat: relic.mainStat,
    substats: relic.substats,
  }));
}

/**
 * Score equipped relics with an optional plan — same fallback as CharacterScorePanel:
 * missing plan → resolvePlanWeights({}) → critDps role template.
 */
export function scoreEquippedRelics(
  relics: ScoreRelicLike[] | null | undefined,
  plan?: CharacterBuildPlan | null,
): CharacterScoreSummary | null {
  if (!relics?.length) return null;

  const weights = resolvePlanWeights({
    substatWeights: plan?.substatWeights,
    effectiveSubstats: plan?.effectiveSubstats,
  });
  const inputs = relicInputs(relics);
  const quality = planQualityCompletion(inputs, weights, {
    allowedMainStats: plan?.mainStats,
    minPotentialPct: plan?.minPotentialPct ?? 40,
  });
  const potential = averageCharacterPotential(inputs, weights, {
    allowedMainStats: plan?.mainStats,
  });

  return {
    letterGrade: letterGradeFromPotential(potential.averagePotentialPct),
    potentialPct: potential.averagePotentialPct,
    completionPct: quality.combinedRatio * 100,
    relicCount: relics.length,
    hasPlan: plan != null,
  };
}

export function scoreFromDashboardEntry(entry: BuildDashboardEntry): CharacterScoreSummary | null {
  return scoreEquippedRelics(entry.character.equippedRelics as BuildDashboardRelic[], entry.plan);
}

export function toPersistedCharacterScore(
  characterId: number,
  summary: CharacterScoreSummary,
  computedAt = Date.now(),
): CharacterBuildScore {
  return {
    characterId,
    letterGrade: summary.letterGrade,
    potentialPct: summary.potentialPct,
    completionPct: summary.completionPct,
    relicCount: summary.relicCount,
    hasPlan: summary.hasPlan,
    computedAt,
  };
}

export function formatScorePct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}
