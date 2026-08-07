import { onActivated, onDeactivated, onMounted, ref, watch, type Ref } from "vue";
import { characterScoreApi } from "@/shared/api/character-score";
import { teamApi } from "@/shared/api/team";
import { recomputeAndPersistCharacterScore } from "@/shared/utils/relic-score/persist-character-score";
import type { CharacterBuildScore, PagedResult, Team, TeamInput } from "@/types";
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

const MISS_FILL_CONCURRENCY = 4;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!);
    }
  }
  const agents = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(agents);
  return results;
}

export function useTeamArchive(options: TeamArchiveOptions) {
  const { busy, revision, setError, setNotice } = options;
  const result = ref<PagedResult<Team>>(emptyResult());
  const memberScores = ref<Map<number, CharacterBuildScore>>(new Map());
  const scoresReady = ref(false);
  const search = ref("");
  const appending = ref(false);
  let requestId = 0;
  let scoreRequestId = 0;
  let loadedRevision = -1;
  let active = false;

  function scoresFromTeams(teams: Team[]): Map<number, CharacterBuildScore> {
    const map = new Map<number, CharacterBuildScore>();
    for (const team of teams) {
      for (const member of team.members) {
        if (member?.owned && member.score) {
          map.set(member.characterId, member.score);
        }
      }
    }
    return map;
  }

  function ownedCharacterIds(teams: Team[]): number[] {
    const ids = new Set<number>();
    for (const team of teams) {
      for (const member of team.members) {
        if (member?.owned) ids.add(member.characterId);
      }
    }
    return [...ids];
  }

  function mergeScores(incoming: Map<number, CharacterBuildScore> | CharacterBuildScore[]) {
    const next = new Map(memberScores.value);
    if (Array.isArray(incoming)) {
      for (const score of incoming) next.set(score.characterId, score);
    } else {
      for (const [id, score] of incoming) next.set(id, score);
    }
    memberScores.value = next;
  }

  /**
   * Prefer scores already in memory / embedded in team list / SQLite cache.
   * Only recompute IDs that are still missing. Writes are generation-guarded so a
   * cancelled pass cannot refill the DB after inventory wipe.
   */
  async function ensureMemberScores(teams: Team[], options?: { soft?: boolean }) {
    const soft = options?.soft === true;
    const currentRequest = ++scoreRequestId;
    const startRevision = revision.value;
    const isCurrent = () => currentRequest === scoreRequestId && revision.value === startRevision;

    if (!soft) scoresReady.value = false;

    const needed = ownedCharacterIds(teams);
    if (!needed.length) {
      if (!isCurrent()) return;
      if (!soft) {
        memberScores.value = new Map();
        scoresReady.value = true;
      }
      return;
    }

    // Seed from embedded team payloads without wiping scores for other known IDs.
    mergeScores(scoresFromTeams(teams));

    try {
      const stored = await characterScoreApi.list(needed);
      if (!isCurrent()) return;
      mergeScores(stored);
    } catch {
      // list failures fall through to per-character recompute for misses
    }

    const missing = needed.filter((id) => !memberScores.value.has(id));
    if (missing.length) {
      const computed = await mapPool(missing, MISS_FILL_CONCURRENCY, async (characterId) => {
        try {
          return await recomputeAndPersistCharacterScore(characterId, { isCurrent });
        } catch {
          return null;
        }
      });
      if (!isCurrent()) return;
      const filled = computed.filter((score): score is CharacterBuildScore => score != null);
      if (filled.length) mergeScores(filled);
    }

    if (!isCurrent()) return;
    scoresReady.value = true;
  }

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

      if (append) {
        // Keep existing scores visible; only fill gaps for newly listed members.
        mergeScores(scoresFromTeams(next.items));
        void ensureMemberScores(result.value.items, { soft: true });
      } else {
        // Full reload (including inventory revision): drop possibly-stale in-memory scores.
        memberScores.value = scoresFromTeams(result.value.items);
        scoresReady.value =
          memberScores.value.size > 0 &&
          ownedCharacterIds(result.value.items).every((id) => memberScores.value.has(id));
        void ensureMemberScores(result.value.items, { soft: scoresReady.value });
      }
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
    else void ensureMemberScores(result.value.items, { soft: true });
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
    if (active && document.visibilityState === "visible") {
      // Inventory mutation invalidated scores in SQLite; force a full list reload.
      memberScores.value = new Map();
      scoresReady.value = false;
      void load();
    }
  });

  return {
    result,
    memberScores,
    scoresReady,
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
