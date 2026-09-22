import { invoke } from "@/shared/api/invoke";
import type { AdviseCharacterRequest, CharacterBuildAdvice } from "@/types";

export const advisorApi = {
  adviseCharacter: (request: AdviseCharacterRequest) =>
    invoke<CharacterBuildAdvice>("advise_character_build", { request }),
};
