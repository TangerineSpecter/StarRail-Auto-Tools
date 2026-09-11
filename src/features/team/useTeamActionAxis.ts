import { ref } from "vue";
import { inventoryApi } from "@/shared/api/inventory";
import { characterDisplayName } from "@/shared/catalogue";
import { loadDisabledTraceNodes } from "@/shared/utils/trace-settings";
import type { Team } from "@/types";
import {
  resolveTeamActionAxisProfile,
  type TeamActionAxisProfile,
  type TeamAxisCharacterDetail,
} from "./team-action-axis";

export function useTeamActionAxis() {
  const profiles = ref<Array<TeamActionAxisProfile | null>>([]);
  const loading = ref(false);
  const error = ref("");
  let requestId = 0;

  async function load(team: Team) {
    const currentRequest = ++requestId;
    loading.value = true;
    error.value = "";
    const disabledTraceNodes = loadDisabledTraceNodes();

    try {
      const next = await Promise.all(
        team.members.map(async (member): Promise<TeamActionAxisProfile | null> => {
          if (!member) return null;
          if (!member.owned) {
            return {
              characterId: member.characterId,
              name: characterDisplayName({
                characterId: member.characterId,
                name: member.name,
                path: member.path,
              }),
              available: false,
              speed: null,
              initialAdvance: 0,
              warnings: [],
              reason: "角色已不在当前背包档案中",
            };
          }
          try {
            const detail = await inventoryApi.detail("character", member.characterId);
            return resolveTeamActionAxisProfile(
              member,
              detail.data as unknown as TeamAxisCharacterDetail,
              disabledTraceNodes,
            );
          } catch (cause) {
            return {
              characterId: member.characterId,
              name: characterDisplayName({
                characterId: member.characterId,
                name: member.name,
                path: member.path,
              }),
              available: false,
              speed: null,
              initialAdvance: 0,
              warnings: [],
              reason: `读取角色详情失败：${String(cause)}`,
            };
          }
        }),
      );
      if (currentRequest === requestId) profiles.value = next;
    } catch (cause) {
      if (currentRequest === requestId) error.value = String(cause);
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
  }

  function cancel() {
    requestId += 1;
    loading.value = false;
  }

  return { profiles, loading, error, load, cancel };
}
