/** Re-export shared scoring helpers used by the team feature. */
export {
  formatScorePct,
  scoreEquippedRelics,
  scoreFromDashboardEntry,
  toPersistedCharacterScore,
  type CharacterScoreSummary as TeamMemberScore,
  type ScoreRelicLike,
} from "@/shared/utils/relic-score";
