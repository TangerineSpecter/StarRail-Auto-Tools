import { resolvePlanWeights, scoreRelic } from "@/shared/utils/relic-score";
import type {
  BuildDashboardRelic,
  CharacterBuildPlan,
  RelicSetCatalogueEntry,
  RelicSetFarmingProfile,
} from "@/types";

const CAVERN_SLOTS = new Set(["Head", "Hands", "Body", "Feet"]);
const PLANAR_SLOTS = new Set(["PlanarSphere", "LinkRope"]);

export interface RelicSetFarmingItem {
  set: RelicSetCatalogueEntry;
  /** Lower is better; this is the score shown to the user. */
  priorityScore: number;
  /** Characters whose saved plan targets this set. */
  targetCount: number;
  /** Average potential over all expected pieces, including missing pieces as zero. */
  currentQualityPct: number;
  /** Expected number of pieces across all target characters. */
  expectedPieceCount: number;
  /** Equipped pieces that cover the expected slots, capped per character. */
  equippedPieceCount: number;
  /** The opportunity represented by the bar length. */
  opportunityPct: number;
}

export type FarmingPriorityClass = "urgent" | "watch" | "stable";

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** Resolve how many pieces one plan expects from a particular catalogue set. */
export function expectedPiecesForSet(
  plan: Pick<CharacterBuildPlan, "cavernMode" | "cavernSetA" | "cavernSetB" | "planarSetId">,
  set: Pick<RelicSetCatalogueEntry, "id" | "kind">,
): number {
  if (set.kind === "planar") return plan.planarSetId === set.id ? 2 : 0;
  if (plan.cavernSetA === set.id) return plan.cavernMode === "fourPiece" ? 4 : 2;
  if (plan.cavernMode === "twoPlusTwo" && plan.cavernSetB === set.id) return 2;
  return 0;
}

function isSlotForSetKind(slot: string | undefined, kind: RelicSetCatalogueEntry["kind"]): boolean {
  return Boolean(slot && (kind === "planar" ? PLANAR_SLOTS : CAVERN_SLOTS).has(slot));
}

function scoreEquippedPiece(relic: BuildDashboardRelic, plan: CharacterBuildPlan): number {
  // The backend includes slot on every inventory relic. Treat legacy/malformed records as
  // missing rather than letting an unknown slot bypass the plan's main-stat requirements.
  if (!relic.slot) return 0;
  const score = scoreRelic(
    {
      ...relic,
      slot: relic.slot,
    },
    resolvePlanWeights(plan),
    { allowedMainStats: plan.mainStats },
  );
  if (score.mainStatCorrect === false) return 0;
  return clampPct(score.potentialPct);
}

interface CharacterSetQuality {
  qualitySum: number;
  equippedPieceCount: number;
}

function qualityForCharacterSet(
  profile: RelicSetFarmingProfile,
  set: RelicSetCatalogueEntry,
  expectedPieces: number,
): CharacterSetQuality {
  const matchingPieces = (profile.character.equippedRelics ?? [])
    .filter((relic) => relic.setId === set.id && isSlotForSetKind(relic.slot, set.kind))
    .map((relic) => scoreEquippedPiece(relic, profile.plan))
    // A 2+2 set can have more than two matching pieces during a transition. Only the best
    // expected pieces should represent the set's current quality in that case.
    .sort((left, right) => right - left)
    .slice(0, expectedPieces);

  return {
    qualitySum: matchingPieces.reduce((sum, quality) => sum + quality, 0),
    equippedPieceCount: matchingPieces.length,
  };
}

function uniqueProfiles(profiles: RelicSetFarmingProfile[]): RelicSetFarmingProfile[] {
  const byCharacterId = new Map<number, RelicSetFarmingProfile>();
  for (const profile of profiles) {
    if (!byCharacterId.has(profile.plan.characterId))
      byCharacterId.set(profile.plan.characterId, profile);
  }
  return [...byCharacterId.values()];
}

function compareFarmingItems(left: RelicSetFarmingItem, right: RelicSetFarmingItem): number {
  // Unused sets are explicitly kept at the end, even when an in-use set also happens to score
  // 100 because all of its currently equipped pieces are perfect.
  if (left.targetCount === 0 && right.targetCount > 0) return 1;
  if (right.targetCount === 0 && left.targetCount > 0) return -1;
  return (
    left.priorityScore - right.priorityScore ||
    right.targetCount - left.targetCount ||
    left.currentQualityPct - right.currentQualityPct ||
    left.set.name.localeCompare(right.set.name, "zh-CN") ||
    left.set.id - right.set.id
  );
}

/** Calculate and stably sort the farming opportunity for every set in one catalogue category. */
export function scoreRelicSetsForFarming(
  sets: RelicSetCatalogueEntry[],
  profiles: RelicSetFarmingProfile[],
): RelicSetFarmingItem[] {
  const unique = uniqueProfiles(profiles);
  const aggregates = sets.map((set) => {
    let targetCount = 0;
    let expectedPieceCount = 0;
    let qualitySum = 0;
    let equippedPieceCount = 0;

    for (const profile of unique) {
      const expectedPieces = expectedPiecesForSet(profile.plan, set);
      if (expectedPieces <= 0) continue;
      targetCount += 1;
      expectedPieceCount += expectedPieces;
      const quality = qualityForCharacterSet(profile, set, expectedPieces);
      qualitySum += quality.qualitySum;
      equippedPieceCount += quality.equippedPieceCount;
    }

    return {
      set,
      targetCount,
      expectedPieceCount,
      qualitySum,
      equippedPieceCount,
    };
  });
  const maxTargetCount = Math.max(0, ...aggregates.map((item) => item.targetCount));
  const denominator = Math.log1p(maxTargetCount);

  return aggregates
    .map((item) => {
      const currentQualityPct =
        item.expectedPieceCount > 0 ? clampPct(item.qualitySum / item.expectedPieceCount) : 0;
      const peopleWeight =
        item.targetCount > 0 && denominator > 0 ? Math.log1p(item.targetCount) / denominator : 0;
      const qualityGap = 1 - currentQualityPct / 100;
      const priorityScore = clampPct(100 * (1 - qualityGap * peopleWeight));
      return {
        set: item.set,
        priorityScore,
        targetCount: item.targetCount,
        currentQualityPct,
        expectedPieceCount: item.expectedPieceCount,
        equippedPieceCount: item.equippedPieceCount,
        opportunityPct: clampPct(100 - priorityScore),
      };
    })
    .sort(compareFarmingItems);
}

export function farmingPriorityClass(priorityScore: number): FarmingPriorityClass {
  if (priorityScore <= 35) return "urgent";
  if (priorityScore <= 65) return "watch";
  return "stable";
}

export function formatFarmingPriority(item: Pick<RelicSetFarmingItem, "priorityScore">): string {
  return item.priorityScore.toFixed(1);
}

export function formatFarmingQuality(
  item: Pick<RelicSetFarmingItem, "targetCount" | "currentQualityPct">,
): string {
  return item.targetCount > 0 ? `${item.currentQualityPct.toFixed(1)}%` : "—";
}

export function formatFarmingCoverage(
  item: Pick<RelicSetFarmingItem, "equippedPieceCount" | "expectedPieceCount">,
): string {
  return `${item.equippedPieceCount}/${item.expectedPieceCount}`;
}
