import { relicMainStats, relicSubStats } from "@/shared/catalogue/relic-options";
import type { RelicSetKind, RelicSetRecommendedCharacter } from "@/types";

export interface SetTargetSummary {
  substats: string[];
  mainStats: Array<{ slot: string; stats: string[] }>;
}

const slotsForSetKind: Record<RelicSetKind, string[]> = {
  cavern: ["Body", "Feet"],
  planar: ["PlanarSphere", "LinkRope"],
};

const orderedUnique = (stats: Iterable<string>, options: string[]) => {
  const selected = new Set(stats);
  return options.filter((stat) => selected.has(stat));
};

/** Combines all saved target settings for one relic or planar ornament set. */
export function summarizeSetTargets(
  kind: RelicSetKind,
  plans: Array<Pick<RelicSetRecommendedCharacter, "mainStats" | "effectiveSubstats">>,
): SetTargetSummary {
  return {
    substats: orderedUnique(
      plans.flatMap((plan) => plan.effectiveSubstats),
      relicSubStats,
    ),
    mainStats: slotsForSetKind[kind].map((slot) => ({
      slot,
      stats: orderedUnique(
        plans.flatMap((plan) => plan.mainStats[slot] ?? []),
        relicMainStats[slot] ?? [],
      ),
    })),
  };
}
