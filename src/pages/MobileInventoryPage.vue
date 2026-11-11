<script setup lang="ts">
import { computed, onDeactivated, ref, toRaw, watch } from "vue";
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
import { useMobileRelicQuality } from "@/features/inventory/useMobileRelicQuality";
import { createInventoryFilterForm } from "@/features/inventory/filter";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import type { InventoryKind, RelicListItem } from "@/types";

defineOptions({ name: "MobileInventoryPage" });
const runtime = useRuntimeContext();
const archive = useInventoryArchive({
  ...runtime,
  revision: runtime.inventoryRevision,
  setError: (value) => (runtime.error.value = value),
  setNotice: (value) => (runtime.notice.value = value),
});
const detail = useInventoryDetail((value) => (runtime.error.value = value));
const master = ref<HTMLElement | null>(null);
const activeDetailId = ref<number | null>(null);
const detailOpen = computed(() => Boolean(detail.detail.value || detail.loading.value));
const splitView = useInventorySplitView(detailOpen, master);
const transitionDetail = useInventoryDetailTransition(master);
const categoryBody = ref<HTMLElement | null>(null);
const controls = ref<InstanceType<typeof MobileInventoryControls> | null>(null);
const categoryTransition = useInventoryCategoryTransition({
  kind: archive.kind,
  body: categoryBody,
  prepare: archive.prepareKind,
  onCommit: detail.close,
  cancelDetail: transitionDetail.cancel,
  cancelPrepare: archive.cancelPreparedKind,
});
const filterDraft = ref(createInventoryFilterForm());
const quality = useMobileRelicQuality(
  computed(() => archive.result.value.items as RelicListItem[]),
  (value) => (runtime.error.value = value),
);
const qualityCount = computed(() =>
  archive.kind.value === "relic" ? quality.activeCount.value : 0,
);
const activeFilterCount = computed(() => archive.activeFilterCount.value + qualityCount.value);
function openFilters() {
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
  controls.value?.cancelSearch();
  void categoryTransition.switchTo(kind);
}
watch(detailOpen, (open) => {
  if (!open) activeDetailId.value = null;
});
const listItems = computed(() =>
  archive.kind.value === "relic" ? quality.displayItems.value : archive.result.value.items,
);
onDeactivated(detail.close);
</script>
<template>
  <section :class="['mobile-archive', { 'is-split': splitView }]">
    <div ref="master" class="mobile-inventory-master">
      <MobileInventoryCategoryTabs
        :kind="categoryTransition.selectedKind.value"
        @category="switchKind"
      />
      <div
        ref="categoryBody"
        class="mobile-inventory-category-content"
        :inert="categoryTransition.pending.value"
        :aria-busy="categoryTransition.pending.value"
      >
        <MobileInventoryControls
          ref="controls"
          v-model:search="archive.filters.value.search"
          hide-categories
          :kind="archive.kind.value"
          :total="archive.result.value.total"
          :active-filter-count="activeFilterCount"
          :has-filters="archive.hasActiveSearchOrFilters.value || qualityCount > 0"
          @search="archive.applyFilters"
          @filter="openFilters"
          @reset="resetFilters"
        />
        <InventoryFilterDrawer
          v-model="archive.filterOpen.value"
          v-model:filters="filterDraft"
          :kind="archive.kind.value"
          :busy="runtime.busy.value"
          @apply="applyFilters"
          @reset="resetDraft"
        >
          <template #relic-quality>
            <RelicQualityFilterFields v-model="quality.draft.value" :plans="quality.plans.value" />
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
          :items="listItems"
          :selected-ids="archive.selectedIds.value"
          :all-selected="false"
          :appending="archive.appending.value"
          :busy="runtime.busy.value"
          read-only
          :active-detail-id="activeDetailId"
          @detail="openDetail"
        />
        <button
          v-if="archive.result.value.page > 1"
          class="mobile-more"
          :disabled="runtime.busy.value"
          @click="archive.goPage(archive.result.value.page - 1)"
        >
          上一页
        </button>
        <button
          v-if="archive.result.value.page < archive.pageCount.value"
          class="mobile-more"
          :disabled="runtime.busy.value"
          @click="archive.goPage(archive.result.value.page + 1)"
        >
          下一页
        </button>
      </div>
    </div>
    <InventoryDetailDrawer
      v-if="detailOpen"
      :detail="detail.detail.value"
      :loading="detail.loading.value"
      :inline="splitView"
      @close="closeDetail"
    />
  </section>
</template>
