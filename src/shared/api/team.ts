import { invoke } from "@tauri-apps/api/core";
import type { PagedResult, Team, TeamFilter, TeamInput } from "@/types";

export const teamApi = {
  list: (filter: TeamFilter) => invoke<PagedResult<Team>>("list_teams", { filter }),
  get: (teamId: number) => invoke<Team>("get_team", { teamId }),
  save: (team: TeamInput) => invoke<Team>("save_team", { team }),
  delete: (teamId: number) => invoke<void>("delete_team", { teamId }),
};
