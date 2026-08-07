<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from "vue";
import InventorySidebar from "@/features/inventory/InventorySidebar.vue";
import InventoryToolbar from "@/features/inventory/InventoryToolbar.vue";
import InventoryFilterDrawer from "@/features/inventory/InventoryFilterDrawer.vue";
import InventoryList from "@/features/inventory/InventoryList.vue";
import InventoryDetailDrawer from "@/features/inventory/InventoryDetailDrawer.vue";
import RelicQualityToolbar from "@/features/inventory/RelicQualityToolbar.vue";
import BuildPlanDrawer from "@/features/build-planner/BuildPlanDrawer.vue";
import TeamWorkspace from "@/features/team/TeamWorkspace.vue";
import { useInventoryArchive } from "@/features/inventory/useInventoryArchive";
import { useInventoryDetail } from "@/features/inventory/useInventoryDetail";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import type { ArchiveView, InventoryKind, InventoryListItem, RelicListItem } from "@/types";

defineOptions({ name: "InventoryPage" });
const { direct, summary, busy, error, notice, inventoryRevision } = useRuntimeContext();
const feedback = {
  summary,
  direct,
  busy,
  revision: inventoryRevision,
  setError: (message: string) => (error.value = message),
  setNotice: (message: string) => (notice.value = message),
};
const archive = useInventoryArchive(feedback);
const detail = useInventoryDetail(feedback.setError);
const archiveView = ref<ArchiveView>("relic");
const buildCharacterId = ref<number | null>(null);
const scoredRelicItems = ref<RelicListItem[] | null>(null);
const isTeamView = computed(() => archiveView.value === "team");
const listItems = computed<InventoryListItem[]>(() => {
  if (archive.kind.value === "relic" && scoredRelicItems.value) return scoredRelicItems.value;
  return archive.result.value.items;
});

function switchArchiveView(view: ArchiveView) {
  archiveView.value = view;
  if (view !== "team") {
    archive.switchKind(view);
  }
}

// Drop client-side score ordering when leaving the relic tab so stale pages never leak.
watch(
  () => archive.kind.value,
  (kind) => {
    if (kind !== "relic") scoredRelicItems.value = null;
  },
);

function onEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.isComposing) return;
  if (buildCharacterId.value && !detail.detail.value && !detail.loading.value)
    buildCharacterId.value = null;
}
const removeEscapeListener = () => window.removeEventListener("keydown", onEscape);
onActivated(() => window.addEventListener("keydown", onEscape));
onDeactivated(removeEscapeListener);
onBeforeUnmount(removeEscapeListener);
</script>

<template>
  <section class="archive-workspace">
    <InventorySidebar
      :kind="archiveView"
      :summary="summary"
      :busy="busy"
      @update:kind="switchArchiveView"
      @export="archive.exportData"
      @import="archive.importData"
    />
    <TeamWorkspace v-if="isTeamView" />
    <article v-else class="panel archive-main">
      <InventoryToolbar
        v-model:filters="archive.filters.value"
        :kind="archive.kind.value as InventoryKind"
        :total="archive.result.value.total"
        :active-filter-count="archive.activeFilterCount.value"
        :has-filters="archive.hasActiveSearchOrFilters.value"
        @search="archive.applyFilters"
        @filter="archive.filterOpen.value = true"
        @reset="archive.resetFilters"
      />
      <InventoryFilterDrawer
        v-model="archive.filterOpen.value"
        v-model:filters="archive.filters.value"
        :kind="archive.kind.value as InventoryKind"
        :busy="busy"
        @apply="archive.applyFilters"
        @reset="archive.resetFilters"
      />
      <RelicQualityToolbar
        v-if="archive.kind.value === 'relic'"
        :items="archive.result.value.items as RelicListItem[]"
        @update:display-items="scoredRelicItems = $event"
        @notice="notice = $event"
        @error="error = $event"
      />
      <InventoryList
        :kind="archive.kind.value as InventoryKind"
        :items="listItems"
        :selected-ids="archive.selectedIds.value"
        :all-selected="archive.allSelected.value"
        :appending="archive.appending.value"
        :busy="busy"
        @toggle-all="archive.toggleAll"
        @toggle-selected="archive.toggleSelected"
        @detail="detail.open"
        @edit-build="buildCharacterId = $event.characterId"
        @scroll="archive.onScroll"
      />
    </article>
  </section>
  <InventoryDetailDrawer
    v-if="detail.detail.value || detail.loading.value"
    :detail="detail.detail.value"
    :loading="detail.loading.value"
    @close="detail.close"
  />
  <BuildPlanDrawer
    v-if="buildCharacterId"
    :character-id="buildCharacterId"
    @close="buildCharacterId = null"
    @deleted="buildCharacterId = null"
    @error="error = $event"
    @notice="notice = $event"
  />
</template>
