import { invoke } from "@tauri-apps/api/core";
import type {
  BuildDashboardEntry,
  BuildRecommendation,
  CharacterBuildPlan,
  RelicSetRecommendedCharacter,
} from "@/types";

export const buildPlanApi = {
  get: (characterId: number) =>
    invoke<CharacterBuildPlan | null>("get_character_build_plan", { characterId }),
  dashboard: () => invoke<BuildDashboardEntry[]>("get_build_dashboard"),
  recommendedCharactersForSet: (setId: number) =>
    invoke<RelicSetRecommendedCharacter[]>("list_relic_set_recommended_characters", { setId }),
  save: (plan: CharacterBuildPlan) => invoke<void>("save_character_build_plan", { plan }),
  delete: (characterId: number) => invoke<void>("delete_character_build_plan", { characterId }),
  recommend: (characterId: number, includeEquipped: boolean) =>
    invoke<BuildRecommendation>("recommend_character_build", {
      request: { characterId, includeEquipped },
    }),
};
