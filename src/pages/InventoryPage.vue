<script setup lang="ts">
import { onActivated, onBeforeUnmount, onDeactivated, ref } from "vue";
import InventorySidebar from "@/features/inventory/InventorySidebar.vue";
import InventoryToolbar from "@/features/inventory/InventoryToolbar.vue";
import InventoryFilterDrawer from "@/features/inventory/InventoryFilterDrawer.vue";
import InventoryList from "@/features/inventory/InventoryList.vue";
import InventoryDetailDrawer from "@/features/inventory/InventoryDetailDrawer.vue";
import BuildPlanDrawer from "@/features/build-planner/BuildPlanDrawer.vue";
import { useInventoryArchive } from "@/features/inventory/useInventoryArchive";
import { useInventoryDetail } from "@/features/inventory/useInventoryDetail";
import { useRuntimeContext } from "@/shared/contracts/runtime";

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
const buildCharacterId = ref<number | null>(null);

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
      :kind="archive.kind.value"
      :summary="summary"
      :busy="busy"
      @update:kind="archive.switchKind"
      @export="archive.exportData"
      @import="archive.importData"
    />
    <article class="panel archive-main">
      <InventoryToolbar
        v-model:filters="archive.filters.value"
        :kind="archive.kind.value"
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
        :kind="archive.kind.value"
        :busy="busy"
        @apply="archive.applyFilters"
        @reset="archive.resetFilters"
      />
      <InventoryList
        :kind="archive.kind.value"
        :items="archive.result.value.items"
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
