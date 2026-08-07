import { buildPlanApi } from "@/shared/api/build-plan";
import { characterScoreApi } from "@/shared/api/character-score";
import { inventoryApi } from "@/shared/api/inventory";
import type { CharacterBuildPlan, CharacterBuildScore } from "@/types";
import {
  scoreEquippedRelics,
  toPersistedCharacterScore,
  type ScoreRelicLike,
} from "./character-summary";

export interface PersistCharacterScoreOptions {
  plan?: CharacterBuildPlan | null;
  relics?: ScoreRelicLike[] | null;
  /**
   * Called after async work and again before write.
   * Return false to abandon persistence (stale generation / cancelled request).
   */
  isCurrent?: () => boolean;
}

/**
 * Load plan + equipped relics, recompute summary, and persist (or clear if no relics).
 * Used after detail open, plan save, and team list miss-fill.
 *
 * Callers that race with inventory sync must pass `isCurrent` so wiped caches are not
 * refilled with pre-sync equipment.
 */
export async function recomputeAndPersistCharacterScore(
  characterId: number,
  options?: PersistCharacterScoreOptions,
): Promise<CharacterBuildScore | null> {
  const isCurrent = options?.isCurrent ?? (() => true);

  if (!isCurrent()) return null;

  const plan =
    options && "plan" in options
      ? (options.plan ?? null)
      : await buildPlanApi.get(characterId).catch(() => null);

  if (!isCurrent()) return null;

  let relics = options?.relics;
  if (relics === undefined) {
    const detail = await inventoryApi.detail("character", characterId);
    if (!isCurrent()) return null;
    relics = (detail.data as { equippedRelics?: ScoreRelicLike[] }).equippedRelics ?? null;
  }

  if (!isCurrent()) return null;

  const summary = scoreEquippedRelics(relics, plan);
  if (!summary) {
    if (!isCurrent()) return null;
    await characterScoreApi.delete(characterId).catch(() => undefined);
    return null;
  }

  const score = toPersistedCharacterScore(characterId, summary);
  if (!isCurrent()) return null;
  await characterScoreApi.upsert(score);
  // Final check: a concurrent wipe may have landed during upsert; best-effort only.
  if (!isCurrent()) return null;
  return score;
}

/** Persist an already-computed summary when the caller still holds live gear/plan. */
export async function persistCharacterScoreSummary(
  characterId: number,
  summary: ReturnType<typeof scoreEquippedRelics>,
  options?: { isCurrent?: () => boolean },
): Promise<CharacterBuildScore | null> {
  const isCurrent = options?.isCurrent ?? (() => true);
  if (!isCurrent()) return null;
  if (!summary) {
    await characterScoreApi.delete(characterId).catch(() => undefined);
    return null;
  }
  const score = toPersistedCharacterScore(characterId, summary);
  if (!isCurrent()) return null;
  await characterScoreApi.upsert(score);
  if (!isCurrent()) return null;
  return score;
}
