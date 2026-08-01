import { invoke } from "@tauri-apps/api/core";
import type { BuildDashboardEntry, BuildRecommendation, CharacterBuildPlan } from "@/types";

export const buildPlanApi = {
  get: (characterId: number) =>
    invoke<CharacterBuildPlan | null>("get_character_build_plan", { characterId }),
  dashboard: () => invoke<BuildDashboardEntry[]>("get_build_dashboard"),
  save: (plan: CharacterBuildPlan) => invoke<void>("save_character_build_plan", { plan }),
  delete: (characterId: number) => invoke<void>("delete_character_build_plan", { characterId }),
  recommend: (characterId: number, includeEquipped: boolean) =>
    invoke<BuildRecommendation>("recommend_character_build", {
      request: { characterId, includeEquipped },
    }),
};
