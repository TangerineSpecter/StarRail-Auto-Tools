<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref, toRaw, watch } from "vue";
import RelicQualityFilterFields from "@/features/inventory/RelicQualityFilterFields.vue";
import RelicQualityToolbar from "@/features/inventory/RelicQualityToolbar.vue";
import MobileInventoryControls from "@/features/inventory/MobileInventoryControls.vue";
import MobileInventoryCategoryTabs from "@/features/inventory/MobileInventoryCategoryTabs.vue";
import InventoryList from "@/features/inventory/InventoryList.vue";
import InventoryFilterDrawer from "@/features/inventory/InventoryFilterDrawer.vue";
import InventoryDetailDrawer from "@/features/inventory/InventoryDetailDrawer.vue";
import { useInventoryArchive } from "@/features/inventory/useInventoryArchive";
import { useInventoryDetail } from "@/features/inventory/useInventoryDetail";
import { useInventorySplitView } from "@/features/inventory/useInventorySplitView";
import { useInventoryDetailTransition } from "@/features/inventory/useInventoryDetailTransition";
import { useInventoryCategoryTransition } from "@/features/inventory/useInventoryCategoryTransition";
import { useInventoryCategoryPager } from "@/features/inventory/useInventoryCategoryPager";
import MobileInventoryPreview from "@/features/inventory/MobileInventoryPreview.vue";
import { useMobileInventoryWindow } from "@/features/inventory/useMobileInventoryWindow";
import { useMobileRelicQuality } from "@/features/inventory/useMobileRelicQuality";
import { createInventoryFilterForm } from "@/features/inventory/filter";
import { mobileInventoryCategoryMeta } from "@/features/inventory/mobile-inventory-categories";
import { useMobileTopHeaderTarget } from "@/shared/contracts/mobile-top-header";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import type { InventoryKind, RelicListItem } from "@/types";

defineOptions({ name: "MobileInventoryPage" });
const runtime = useRuntimeContext();
const archive = useInventoryArchive({
  ...runtime,
  revision: runtime.inventoryRevision,
  setError: (value) => (runtime.error.value = value),
  setNotice: (value) => (runtime.notice.value = value),
  cachePrepared: true,
});
const detail = useInventoryDetail((value) => (runtime.error.value = value));
const master = ref<HTMLElement | null>(null);
const activeDetailId = ref<number | null>(null);
const detailOpen = computed(() => Boolean(detail.detail.value || detail.loading.value));
const splitView = useInventorySplitView(detailOpen, master);
const transitionDetail = useInventoryDetailTransition(master);
const categoryBody = ref<HTMLElement | null>(null);
const controls = ref<InstanceType<typeof MobileInventoryControls> | null>(null);
const railHost = ref<HTMLElement | null>(null);
const categoryTransition = useInventoryCategoryTransition({
  kind: archive.kind,
  body: categoryBody,
  prepare: archive.prepareKind,
  onCommit: detail.close,
  cancelDetail: transitionDetail.cancel,
  cancelPrepare: archive.cancelPreparedKind,
});
const pager = useInventoryCategoryPager({
  surface: master,
  body: categoryBody,
  kind: archive.kind,
  enabled: computed(
    () =>
      !categoryTransition.pending.value &&
      !archive.filterOpen.value &&
      (!detailOpen.value || splitView.value),
  ),
  preview: archive.previewKind,
  async commit(kind) {
    controls.value?.cancelSearch();
    await categoryTransition.switchTo(kind, false);
    return archive.kind.value === kind;
  },
});
const filterDraft = ref(createInventoryFilterForm());
const quality = useMobileRelicQuality(
  computed(() => archive.result.value.items as RelicListItem[]),
  (value) => (runtime.error.value = value),
);
const qualityCount = computed(() =>
  archive.kind.value === "relic" ? quality.activeCount.value : 0,
);
const qualityDraftCount = computed(() => {
  if (archive.kind.value !== "relic") return 0;
  const draft = quality.draft.value;
  return (
    Number(draft.sortMode !== "default") +
    Number(draft.characterId !== null) +
    Number(Boolean(draft.minGrade))
  );
});
const activeFilterCount = computed(() => archive.activeFilterCount.value + qualityCount.value);
function openFilters() {
  pager.cancel();
  controls.value?.closeFloatingSearch();
  filterDraft.value = structuredClone(toRaw(archive.filters.value));
  quality.begin();
  archive.filterOpen.value = true;
}
function resetDraft() {
  filterDraft.value = createInventoryFilterForm();
  quality.resetDraft();
}
function applyFilters() {
  Object.assign(archive.filters.value, filterDraft.value);
  if (archive.kind.value === "relic") quality.apply();
  archive.applyFilters();
}
function resetFilters() {
  if (archive.kind.value === "relic") quality.reset();
  archive.resetFilters();
}
function openDetail(kind: InventoryKind, id: number) {
  pager.cancel();
  controls.value?.closeFloatingSearch();
  categoryTransition.cancel();
  transitionDetail(() => {
    activeDetailId.value = id;
    void detail.open(kind, id);
  });
}
function closeDetail() {
  categoryTransition.cancel();
  transitionDetail(detail.close, true);
}
function switchKind(kind: InventoryKind) {
  pager.cancel();
  controls.value?.cancelSearch();
  controls.value?.closeFloatingSearch();
  void categoryTransition.switchTo(kind);
}
watch(detailOpen, (open) => {
  if (!open) activeDetailId.value = null;
});
const listItems = computed(() =>
  archive.kind.value === "relic" ? quality.displayItems.value : archive.result.value.items,
);
const listWindow = useMobileInventoryWindow({
  items: listItems,
  kind: archive.kind,
  pending: computed(() => categoryTransition.pending.value || pager.active.value),
  master,
});
const previewItems = computed(() => {
  const rows = pager.preview.value?.items ?? [];
  return pager.target.value === "relic" ? quality.preview(rows as RelicListItem[]) : rows;
});
const pageActive = ref(true);
const { host: topHeaderHost, enabled: useTopHeader } = useMobileTopHeaderTarget(
  "inventory",
  pageActive,
);
const activeCategoryMeta = computed(() => mobileInventoryCategoryMeta(archive.kind.value));
const hasActiveFilters = computed(
  () => archive.hasActiveSearchOrFilters.value || qualityCount.value > 0,
);
function warmNeighbours() {
  if (!pageActive.value) return;
  for (const kind of ["relic", "lightCone", "character"] as const) {
    if (kind !== archive.kind.value) void archive.previewKind(kind).catch(() => {});
  }
}
watch(() => archive.result.value, warmNeighbours);
watch(runtime.inventoryRevision, pager.cancel);
onActivated(() => {
  pageActive.value = true;
  warmNeighbours();
});
onDeactivated(() => {
  pageActive.value = false;
  detail.close();
});
</script>
<template>
  <section :class="['mobile-archive', { 'is-split': splitView }]">
    <div ref="master" class="mobile-inventory-master">
      <Teleport :to="topHeaderHost ?? 'body'" :disabled="!useTopHeader">
        <div class="mobile-inventory-toolbar">
          <MobileInventoryCategoryTabs
            :kind="categoryTransition.selectedKind.value"
            :position="pager.active.value ? pager.position.value : undefined"
            :motion-ms="pager.active.value ? pager.duration.value : undefined"
            @category="switchKind"
          />
          <span
            class="mobile-inventory-count-pill"
            :class="{ 'is-filtered': hasActiveFilters }"
            role="status"
          >
            <i class="mobile-inventory-count-pill-dot" aria-hidden="true" />
            <b>{{ archive.result.value.total }}</b>
            <span class="mobile-inventory-count-unit">{{ activeCategoryMeta.unit }}</span>
            <span class="mobile-inventory-count-noun">{{ activeCategoryMeta.name }}</span>
          </span>
          <slot name="toolbar-actions" />
          <div class="mobile-inventory-inline-tools" role="group" aria-label="背包快捷工具">
            <button
              v-if="hasActiveFilters"
              type="button"
              class="mobile-inline-tool-clear"
              aria-label="清空搜索与筛选"
              title="清空"
              @click="
                controls?.cancelSearch();
                controls?.closeFloatingSearch();
                resetFilters();
              "
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="m14.8 9.2-5.6 5.6M9.2 9.2l5.6 5.6" />
              </svg>
            </button>
            <button
              type="button"
              :class="{
                'is-active': controls?.searchOpen || Boolean(archive.filters.value.search.trim()),
              }"
              :aria-expanded="Boolean(controls?.searchOpen)"
              aria-label="搜索背包"
              title="搜索"
              @click="controls?.toggleFloatingSearch()"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4.5 4.5" />
              </svg>
            </button>
            <button
              type="button"
              :class="{ 'is-active': activeFilterCount > 0 }"
              :aria-label="
                activeFilterCount ? `筛选，已选 ${activeFilterCount} 项条件` : '筛选背包'
              "
              title="筛选"
              @click="openFilters()"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M4 7h16M4 17h16" />
                <circle cx="9" cy="7" r="2.5" />
                <circle cx="15" cy="17" r="2.5" />
              </svg>
              <b v-if="activeFilterCount">{{ activeFilterCount }}</b>
            </button>
          </div>
        </div>
      </Teleport>
      <div
        class="mobile-inventory-pager"
        :class="{ 'is-interacting': pager.active.value }"
        :style="
          pager.active.value
            ? { minHeight: `${pager.top.value + pager.height.value}px` }
            : undefined
        "
      >
        <div
          ref="categoryBody"
          class="mobile-inventory-category-content"
          :style="pager.paneStyle.value"
          :inert="categoryTransition.pending.value || pager.settling.value"
          :aria-busy="categoryTransition.pending.value || pager.settling.value"
        >
          <MobileInventoryControls
            ref="controls"
            v-model:search="archive.filters.value.search"
            hide-categories
            :kind="archive.kind.value"
            :total="archive.result.value.total"
            :active-filter-count="activeFilterCount"
            :has-filters="archive.hasActiveSearchOrFilters.value || qualityCount > 0"
            :rail-host="railHost"
            @search="archive.applyFilters"
            @filter="openFilters"
            @reset="resetFilters"
          />
          <InventoryFilterDrawer
            v-model="archive.filterOpen.value"
            v-model:filters="filterDraft"
            :kind="archive.kind.value"
            :busy="runtime.busy.value"
            :extra-filter-count="qualityDraftCount"
            @apply="applyFilters"
            @reset="resetDraft"
          >
            <template #relic-quality>
              <RelicQualityFilterFields
                v-model="quality.draft.value"
                :plans="quality.plans.value"
              />
              <details class="filter-group-wide relic-quality-preview">
                <summary>质量建议</summary>
                <RelicQualityToolbar
                  :items="archive.result.value.items as RelicListItem[]"
                  actions-only
                  :preview-plan="quality.draftPlan.value"
                  @error="runtime.error.value = $event"
                  @notice="runtime.notice.value = $event"
                />
              </details>
            </template>
          </InventoryFilterDrawer>
          <InventoryList
            :kind="archive.kind.value"
            :items="listWindow.visibleItems.value"
            :selected-ids="archive.selectedIds.value"
            :all-selected="false"
            :appending="archive.appending.value"
            :busy="runtime.busy.value"
            read-only
            :active-detail-id="activeDetailId"
            @detail="openDetail"
          />
          <div
            v-if="listWindow.hasMore.value"
            :ref="(element) => (listWindow.sentinel.value = element as HTMLElement | null)"
            class="mobile-inventory-render-sentinel"
            aria-hidden="true"
          />
          <button
            v-if="!listWindow.hasMore.value && archive.result.value.page > 1"
            class="mobile-more"
            :disabled="runtime.busy.value"
            @click="archive.goPage(archive.result.value.page - 1)"
          >
            上一页
          </button>
          <button
            v-if="!listWindow.hasMore.value && archive.result.value.page < archive.pageCount.value"
            class="mobile-more"
            :disabled="runtime.busy.value"
            @click="archive.goPage(archive.result.value.page + 1)"
          >
            下一页
          </button>
        </div>
        <MobileInventoryPreview
          v-if="pager.active.value && pager.target.value"
          :kind="pager.target.value"
          :result="pager.preview.value"
          :items="previewItems"
          :search="archive.filtersByKind[pager.target.value].search"
          :filter-count="
            archive.activeFilterCountFor(pager.target.value) +
            (pager.target.value === 'relic' ? quality.activeCount.value : 0)
          "
          :viewport-height="pager.height.value"
          :width="master?.clientWidth ?? 360"
          :error="pager.error.value"
          :style="pager.neighbourStyle.value"
        />
      </div>
    </div>
    <InventoryDetailDrawer
      v-if="detailOpen"
      :detail="detail.detail.value"
      :loading="detail.loading.value"
      :inline="splitView"
      @close="closeDetail"
    />
    <div ref="railHost" class="mobile-inventory-rail-host" />
  </section>
</template>
