import { invoke } from "@/shared/api/invoke";
import type {
  BuildDashboardEntry,
  BuildPlanExcelImportResult,
  CharacterBuildPlan,
  RelicOptimizerContext,
  RelicSetFarmingProfile,
  RelicSetRecommendedCharacter,
  RelicSetTargetCount,
} from "@/types";

export const buildPlanApi = {
  get: (characterId: number) =>
    invoke<CharacterBuildPlan | null>("get_character_build_plan", { characterId }),
  dashboard: () => invoke<BuildDashboardEntry[]>("get_build_dashboard"),
  reorderDashboard: (characterIds: number[]) =>
    invoke<void>("reorder_build_dashboard", { characterIds }),
  setDashboardPinned: (characterId: number, pinned: boolean) =>
    invoke<void>("set_build_dashboard_pinned", { characterId, pinned }),
  recommendedCharactersForSet: (setId: number) =>
    invoke<RelicSetRecommendedCharacter[]>("list_relic_set_recommended_characters", { setId }),
  relicSetTargetCounts: () => invoke<RelicSetTargetCount[]>("list_relic_set_target_counts"),
  relicSetFarmingProfiles: () =>
    invoke<RelicSetFarmingProfile[]>("list_relic_set_farming_profiles"),
  save: (plan: CharacterBuildPlan) => invoke<void>("save_character_build_plan", { plan }),
  delete: (characterId: number) => invoke<void>("delete_character_build_plan", { characterId }),
  exportExcel: () => invoke<string | null>("export_character_build_plans_excel"),
  importExcel: () =>
    invoke<BuildPlanExcelImportResult | null>("import_character_build_plans_excel"),
  optimizerContext: (characterId: number) =>
    invoke<RelicOptimizerContext>("get_relic_optimizer_context", { characterId }),
};
