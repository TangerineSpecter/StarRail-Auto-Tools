<script setup lang="ts">
import { computed } from "vue";
import type { InventoryKind, InventoryListItem, PagedResult } from "@/types";
import InventoryList from "./InventoryList.vue";
import MobileInventoryControls from "./MobileInventoryControls.vue";

const props = defineProps<{
  kind: InventoryKind;
  result: PagedResult<InventoryListItem> | null;
  items: InventoryListItem[];
  search: string;
  filterCount: number;
  viewportHeight: number;
  width: number;
  error: string;
}>();
const visible = computed(() => {
  const row = props.kind === "relic" ? 180 : props.kind === "character" ? 80 : 100;
  const columns = props.width >= 440 ? 2 : 1;
  return props.items.slice(0, (Math.ceil(props.viewportHeight / row) + 2) * columns);
});
const selected = new Set<number>();
</script>
<template>
  <div class="mobile-inventory-preview" inert aria-hidden="true">
    <MobileInventoryControls
      :kind="kind"
      :total="result?.total ?? 0"
      :active-filter-count="filterCount"
      :has-filters="!!search || filterCount > 0"
      :search="search"
      hide-categories
    />
    <p v-if="!result" class="mobile-inventory-preview-state">{{ error || "正在加载…" }}</p>
    <InventoryList
      v-else
      :kind="kind"
      :items="visible"
      :selected-ids="selected"
      :all-selected="false"
      :appending="false"
      :busy="false"
      read-only
    />
  </div>
</template>
<style scoped>
.mobile-inventory-preview {
  position: absolute;
  left: 0;
  width: 100%;
  background: transparent;
  pointer-events: none;
}
.mobile-inventory-preview-state {
  padding: 28px 16px;
  color: var(--muted);
  text-align: center;
  font-size: 14px;
}
</style>
