import { onActivated, onDeactivated, onMounted, ref, watch, type Ref } from "vue";
import { teamApi } from "@/shared/api/team";
import type { PagedResult, Team, TeamInput } from "@/types";
import { characterIdsFromTeam, emptyCharacterIds } from "./team-utils";

interface TeamArchiveOptions {
  busy: Ref<boolean>;
  revision: Ref<number>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}

const emptyResult = (): PagedResult<Team> => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
});

export function useTeamArchive(options: TeamArchiveOptions) {
  const { busy, revision, setError, setNotice } = options;
  const result = ref<PagedResult<Team>>(emptyResult());
  const search = ref("");
  const appending = ref(false);
  let requestId = 0;
  let loadedRevision = -1;
  let active = false;

  async function load(append = false) {
    const currentRequest = ++requestId;
    busy.value = true;
    appending.value = append;
    if (!append) setError("");
    try {
      const page = append ? result.value.page : 1;
      const next = await teamApi.list({
        page,
        pageSize: result.value.pageSize,
        search: search.value.trim() || undefined,
      });
      if (currentRequest !== requestId) return;
      result.value = append ? { ...next, items: [...result.value.items, ...next.items] } : next;
      loadedRevision = revision.value;
    } catch (cause) {
      if (currentRequest === requestId) setError(String(cause));
    } finally {
      if (currentRequest === requestId) busy.value = false;
      appending.value = false;
    }
  }

  function applySearch() {
    result.value.page = 1;
    void load();
  }

  function resetSearch() {
    search.value = "";
    result.value.page = 1;
    void load();
  }

  function onScroll(event: Event) {
    const target = event.target as HTMLElement;
    if (
      !busy.value &&
      result.value.items.length < result.value.total &&
      target.scrollTop + target.clientHeight >= target.scrollHeight - 50
    ) {
      result.value.page += 1;
      void load(true);
    }
  }

  async function saveTeam(input: TeamInput) {
    busy.value = true;
    setError("");
    try {
      await teamApi.save(input);
      setNotice(input.teamId ? "配队已更新" : "配队已创建");
      await load();
      return true;
    } catch (cause) {
      setError(String(cause));
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function deleteTeam(teamId: number) {
    busy.value = true;
    setError("");
    try {
      await teamApi.delete(teamId);
      setNotice("配队已删除");
      await load();
      return true;
    } catch (cause) {
      setError(String(cause));
      return false;
    } finally {
      busy.value = false;
    }
  }

  function draftFromTeam(team?: Team | null): TeamInput {
    return {
      teamId: team?.teamId ?? null,
      name: team?.name ?? "",
      note: team?.note ?? "",
      characterIds: team ? characterIdsFromTeam(team) : emptyCharacterIds(),
    };
  }

  const refreshWhenNeeded = () => {
    if (loadedRevision !== revision.value || result.value.items.length === 0) void load();
  };

  onMounted(() => {
    active = true;
    refreshWhenNeeded();
  });
  onActivated(() => {
    active = true;
    refreshWhenNeeded();
  });
  onDeactivated(() => {
    active = false;
  });
  watch(revision, () => {
    if (active && document.visibilityState === "visible") void load();
  });

  return {
    result,
    search,
    appending,
    load,
    applySearch,
    resetSearch,
    onScroll,
    saveTeam,
    deleteTeam,
    draftFromTeam,
  };
}
