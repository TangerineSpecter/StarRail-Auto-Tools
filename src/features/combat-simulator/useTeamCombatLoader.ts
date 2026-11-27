import { ref } from "vue";
import { inventoryApi } from "@/shared/api/inventory";
import {
  resolveCombatantFromCharacter,
  type CharacterCombatSource,
  type CombatantInput,
} from "@/shared/utils/combat";
import { loadDisabledTraceNodes } from "@/shared/utils/trace-settings";
import type { Team } from "@/types";

export interface TeamCombatDrawerState {
  team: Team;
  combatants: CombatantInput[];
  unavailableNotes: string[];
  loading: boolean;
  error: string;
}

export function useTeamCombatLoader() {
  const state = ref<TeamCombatDrawerState | null>(null);
  let requestId = 0;

  async function open(
    team: Team,
    cachedCombatants?: CombatantInput[],
    cachedUnavailable?: string[],
    ready = false,
  ) {
    const current = ++requestId;
    if (ready && (cachedCombatants?.length || cachedUnavailable?.length)) {
      state.value = {
        team,
        combatants: cachedCombatants ?? [],
        unavailableNotes: cachedUnavailable ?? [],
        loading: false,
        error: "",
      };
      return;
    }

    state.value = {
      team,
      combatants: cachedCombatants ?? [],
      unavailableNotes: cachedUnavailable ?? [],
      loading: true,
      error: "",
    };

    try {
      const disabledTraceNodes = loadDisabledTraceNodes();
      const combatants: CombatantInput[] = [];
      const unavailableNotes: string[] = [];

      const results = await Promise.all(
        team.members.map(async (member) => {
          if (!member) return null;
          if (!member.owned)
            return {
              available: false as const,
              reason: `${member.name} 已不在档案`,
              combatant: null,
            };
          try {
            const detail = await inventoryApi.detail("character", member.characterId);
            return resolveCombatantFromCharacter(
              detail.data as unknown as CharacterCombatSource,
              disabledTraceNodes,
            );
          } catch (cause) {
            return {
              available: false as const,
              reason: `读取 ${member.name} 详情失败：${String(cause)}`,
              combatant: null,
            };
          }
        }),
      );

      if (current !== requestId) return;
      for (const item of results) {
        if (!item) continue;
        if (item.available && item.combatant) combatants.push(item.combatant);
        else if (item.reason) unavailableNotes.push(item.reason);
      }
      state.value = {
        team,
        combatants,
        unavailableNotes,
        loading: false,
        error: "",
      };
    } catch (cause) {
      if (current !== requestId) return;
      state.value = {
        team,
        combatants: [],
        unavailableNotes: [],
        loading: false,
        error: String(cause),
      };
    }
  }

  function close() {
    requestId += 1;
    state.value = null;
  }

  return { state, open, close };
}
