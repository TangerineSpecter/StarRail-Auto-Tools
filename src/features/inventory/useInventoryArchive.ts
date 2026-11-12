import { computed, onActivated, onDeactivated, reactive, ref, watch, type Ref } from "vue";
import { directReadApi } from "@/shared/api/direct-read";
import { inventoryApi } from "@/shared/api/inventory";
import { buildInventoryFilter, createInventoryFilterForm } from "./filter";
import type {
  CharacterFilter,
  DirectReadSnapshot,
  InventoryKind,
  InventoryListItem,
  InventorySummary,
  LightConeFilter,
  PagedResult,
  RelicFilter,
} from "@/types";

interface ArchiveOptions {
  summary: Ref<InventorySummary>;
  direct: Ref<DirectReadSnapshot>;
  busy: Ref<boolean>;
  revision: Ref<number>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  cachePrepared?: boolean;
}

const emptyResult = (): PagedResult<InventoryListItem> => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
});
export const inventoryItemId = (item: InventoryListItem): number =>
  "characterId" in item ? item.characterId : item.itemId;

export function useInventoryArchive(options: ArchiveOptions) {
  const { summary, direct, busy, revision, setError, setNotice } = options;
  const kind = ref<InventoryKind>("relic");
  const result = ref<PagedResult<InventoryListItem>>(emptyResult());
  const selectedIds = ref<Set<number>>(new Set());
  const filterOpen = ref(false);
  const appending = ref(false);
  const filtersByKind = reactive({
    relic: createInventoryFilterForm(),
    lightCone: createInventoryFilterForm(),
    character: createInventoryFilterForm(),
  });
  const filters = computed(() => filtersByKind[kind.value]);
  const pageCount = computed(() =>
    Math.max(1, Math.ceil(result.value.total / result.value.pageSize)),
  );
  const allSelected = computed(
    () =>
      result.value.items.length > 0 &&
      result.value.items.every((item) => selectedIds.value.has(inventoryItemId(item))),
  );
  function activeFilterCountFor(nextKind: InventoryKind) {
    const form = filtersByKind[nextKind];
    const values =
      nextKind === "relic"
        ? [
            form.slots.length,
            form.mainStats.length,
            form.subStats.length,
            form.minSubstatCount,
            form.maxSubstatCount,
            form.locked,
            form.discard,
            form.equipped,
          ]
        : nextKind === "lightCone"
          ? [form.superimposition.length, form.locked, form.equipped]
          : [form.path.length, form.eidolon.length, form.element.length, form.buildPlan];
    return values.filter(Boolean).length;
  }
  const activeFilterCount = computed(() => activeFilterCountFor(kind.value));
  const hasActiveSearchOrFilters = computed(
    () => filters.value.search.trim().length > 0 || activeFilterCount.value > 0,
  );
  let requestId = 0;
  let preparedRequestId: number | null = null;
  let loadedRevision = -1;
  let active = false;
  const preparedCache = new Map<
    InventoryKind,
    {
      revision: number;
      query: string;
      result: PagedResult<InventoryListItem>;
    }
  >();
  const previewRequests = new Map<
    InventoryKind,
    { key: string; promise: Promise<PagedResult<InventoryListItem>> }
  >();
  /** Read a neighbour without changing the active category or its busy/request state. */
  async function previewKind(nextKind: InventoryKind): Promise<PagedResult<InventoryListItem>> {
    const query = buildInventoryFilter(nextKind, filtersByKind[nextKind], 1, 50);
    const dataRevision = revision.value;
    const signature = JSON.stringify(query);
    const key = `${dataRevision}:${signature}`;
    const cached = preparedCache.get(nextKind);
    if (cached?.revision === dataRevision && cached.query === signature)
      return { ...cached.result };
    const pending = previewRequests.get(nextKind);
    if (pending?.key === key) return pending.promise;
    const promise = (async () => {
      const next =
        nextKind === "relic"
          ? await inventoryApi.listRelics(query as RelicFilter)
          : nextKind === "lightCone"
            ? await inventoryApi.listLightCones(query as LightConeFilter)
            : await inventoryApi.listCharacters(query as CharacterFilter);
      if (
        dataRevision === revision.value &&
        signature === JSON.stringify(buildInventoryFilter(nextKind, filtersByKind[nextKind], 1, 50))
      )
        cachePage(nextKind, query, next, dataRevision);
      return next;
    })();
    previewRequests.set(nextKind, { key, promise });
    try {
      return await promise;
    } finally {
      if (previewRequests.get(nextKind)?.promise === promise) previewRequests.delete(nextKind);
    }
  }
  function cachePage(
    category: InventoryKind,
    query: unknown,
    page: PagedResult<InventoryListItem>,
    dataRevision: number,
  ) {
    if (options.cachePrepared && page.page === 1) {
      preparedCache.set(category, {
        revision: dataRevision,
        query: JSON.stringify(query),
        result: { ...page },
      });
    }
  }

  async function load(append = false) {
    const currentRequest = ++requestId;
    const dataRevision = revision.value;
    const category = kind.value;
    busy.value = true;
    appending.value = append;
    if (!append) setError("");
    try {
      const query = buildInventoryFilter(
        kind.value,
        filters.value,
        result.value.page,
        result.value.pageSize,
      );
      const next =
        kind.value === "relic"
          ? await inventoryApi.listRelics(query as RelicFilter)
          : kind.value === "lightCone"
            ? await inventoryApi.listLightCones(query as LightConeFilter)
            : await inventoryApi.listCharacters(query as CharacterFilter);
      if (currentRequest !== requestId) return;
      if (!append) cachePage(category, query, next, dataRevision);
      result.value = append ? { ...next, items: [...result.value.items, ...next.items] } : next;
      if (!append) selectedIds.value = new Set();
      loadedRevision = revision.value;
    } catch (cause) {
      if (currentRequest === requestId) setError(String(cause));
    } finally {
      if (currentRequest === requestId) busy.value = false;
      appending.value = false;
    }
  }

  function switchKind(nextKind: InventoryKind) {
    kind.value = nextKind;
    result.value = emptyResult();
    selectedIds.value = new Set();
    void load();
  }
  /** Prepare a category without clearing the visible page; commit only the latest request. */
  async function prepareKind(nextKind: InventoryKind): Promise<(() => boolean) | null> {
    const currentRequest = ++requestId;
    preparedRequestId = currentRequest;
    busy.value = true;
    setError("");
    try {
      const query = buildInventoryFilter(nextKind, filtersByKind[nextKind], 1, 50);
      const dataRevision = revision.value;
      const next = await previewKind(nextKind);
      if (currentRequest !== requestId) return null;
      cachePage(nextKind, query, next, dataRevision);
      return () => {
        if (currentRequest !== requestId || dataRevision !== revision.value) return false;
        kind.value = nextKind;
        result.value = { ...next };
        selectedIds.value = new Set();
        loadedRevision = revision.value;
        return true;
      };
    } catch (cause) {
      if (currentRequest === requestId) setError(String(cause));
      return null;
    } finally {
      if (currentRequest === requestId) busy.value = false;
      if (preparedRequestId === currentRequest) preparedRequestId = null;
    }
  }
  function cancelPreparedKind() {
    if (preparedRequestId === null || preparedRequestId !== requestId) return;
    requestId += 1;
    preparedRequestId = null;
    busy.value = false;
  }
  function resetFilters() {
    Object.assign(filters.value, createInventoryFilterForm());
    result.value.page = 1;
    void load();
  }
  function applyFilters() {
    result.value.page = 1;
    filterOpen.value = false;
    void load();
  }
  function toggleSelected(id: number) {
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = next;
  }
  function toggleAll() {
    selectedIds.value = allSelected.value
      ? new Set()
      : new Set(result.value.items.map(inventoryItemId));
  }
  function goPage(page: number) {
    if (page < 1 || page > pageCount.value) return;
    result.value.page = page;
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

  async function deleteSelected() {
    const ids = [...selectedIds.value];
    if (
      !ids.length ||
      !window.confirm(`确定删除选中的 ${ids.length} 条本地记录？下次完整同步时会从游戏恢复。`)
    )
      return;
    busy.value = true;
    try {
      await inventoryApi.deleteItems(kind.value, ids);
      summary.value = await inventoryApi.summary();
      await load();
      setNotice(`已删除 ${ids.length} 条本地记录`);
    } catch (cause) {
      setError(String(cause));
    } finally {
      busy.value = false;
    }
  }

  async function clearCurrent() {
    const label = kind.value === "relic" ? "遗器" : kind.value === "lightCone" ? "光锥" : "角色";
    if (!window.confirm(`确定清空全部${label}本地记录？下次完整同步时会从游戏恢复。`)) return;
    busy.value = true;
    try {
      summary.value = await inventoryApi.clear(kind.value);
      await load();
      setNotice(`${label}本地记录已清空`);
    } catch (cause) {
      setError(String(cause));
    } finally {
      busy.value = false;
    }
  }

  async function clearAll() {
    if (
      !window.confirm(
        "确定清空遗器、光锥、角色及当前账号标识？下次完整同步时，游戏中仍存在的数据会重新录入。",
      )
    )
      return;
    busy.value = true;
    try {
      summary.value = await inventoryApi.clear(null);
      direct.value = await directReadApi.snapshot();
      await load();
      setNotice("全部本地数据已清空");
    } catch (cause) {
      setError(String(cause));
    } finally {
      busy.value = false;
    }
  }

  async function exportData() {
    busy.value = true;
    try {
      const path = await inventoryApi.export();
      if (path) setNotice(`数据已导出：${path}`);
    } catch (cause) {
      setError(String(cause));
    } finally {
      busy.value = false;
    }
  }
  async function importData() {
    busy.value = true;
    try {
      const imported = await inventoryApi.import();
      if (imported) {
        summary.value = imported.summary;
        await load();
        setNotice(
          `已导入 ${imported.summary.relics} 件遗器、${imported.summary.lightCones} 件光锥、${imported.summary.characters} 名角色${imported.warnings.length ? `；${imported.warnings.join("、")}` : ""}`,
        );
      }
    } catch (cause) {
      setError(String(cause));
    } finally {
      busy.value = false;
    }
  }

  const refreshWhenNeeded = () => {
    if (loadedRevision !== revision.value || result.value.items.length === 0) void load();
  };
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
    kind,
    result,
    selectedIds,
    filterOpen,
    appending,
    filters,
    pageCount,
    allSelected,
    activeFilterCount,
    activeFilterCountFor,
    hasActiveSearchOrFilters,
    load,
    switchKind,
    prepareKind,
    previewKind,
    filtersByKind,
    cancelPreparedKind,
    resetFilters,
    applyFilters,
    toggleSelected,
    toggleAll,
    goPage,
    onScroll,
    deleteSelected,
    clearCurrent,
    clearAll,
    exportData,
    importData,
  };
}
