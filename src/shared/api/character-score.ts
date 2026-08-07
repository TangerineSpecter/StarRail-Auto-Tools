import { invoke } from "@tauri-apps/api/core";
import type { CharacterBuildScore } from "@/types";

export const characterScoreApi = {
  upsert: (score: CharacterBuildScore) => invoke<void>("upsert_character_build_score", { score }),
  list: (characterIds: number[]) =>
    invoke<CharacterBuildScore[]>("list_character_build_scores", { characterIds }),
  delete: (characterId: number) => invoke<void>("delete_character_build_score", { characterId }),
};
