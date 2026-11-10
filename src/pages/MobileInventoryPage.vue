<script setup lang="ts">
import { computed, onDeactivated, ref } from "vue";
import RelicQualityToolbar from "@/features/inventory/RelicQualityToolbar.vue";
import InventoryList from "@/features/inventory/InventoryList.vue";
import InventoryToolbar from "@/features/inventory/InventoryToolbar.vue";
import InventoryFilterDrawer from "@/features/inventory/InventoryFilterDrawer.vue";
import InventoryDetailDrawer from "@/features/inventory/InventoryDetailDrawer.vue";
import { useInventoryArchive } from "@/features/inventory/useInventoryArchive";
import { useInventoryDetail } from "@/features/inventory/useInventoryDetail";
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
const kinds: { id: InventoryKind; name: string }[] = [
  { id: "relic", name: "遗器" },
  { id: "lightCone", name: "光锥" },
  { id: "character", name: "角色" },
];
const scoredItems = ref<RelicListItem[] | null>(null);
const listItems = computed(() =>
  archive.kind.value === "relic" && scoredItems.value
    ? scoredItems.value
    : archive.result.value.items,
);
onDeactivated(detail.close);
</script>
<template>
  <section class="mobile-archive">
    <nav class="mobile-segments" aria-label="背包分类">
      <button
        v-for="item in kinds"
        :key="item.id"
        :class="{ active: archive.kind.value === item.id }"
        @click="archive.switchKind(item.id)"
      >
        {{ item.name }}
      </button>
    </nav>
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
      :busy="runtime.busy.value"
      @apply="archive.applyFilters"
      @reset="archive.resetFilters"
    />
    <RelicQualityToolbar
      v-if="archive.kind.value === 'relic'"
      :items="archive.result.value.items as RelicListItem[]"
      @update:display-items="scoredItems = $event"
      @error="runtime.error.value = $event"
      @notice="runtime.notice.value = $event"
    />
    <InventoryList
      :kind="archive.kind.value"
      :items="listItems"
      :selected-ids="archive.selectedIds.value"
      :all-selected="false"
      :appending="archive.appending.value"
      :busy="runtime.busy.value"
      read-only
      @detail="detail.open"
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
    <InventoryDetailDrawer
      v-if="detail.detail.value || detail.loading.value"
      :detail="detail.detail.value"
      :loading="detail.loading.value"
      @close="detail.close"
    />
  </section>
</template>
