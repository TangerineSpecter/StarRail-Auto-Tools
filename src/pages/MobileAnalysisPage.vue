<script setup lang="ts">
import { defineAsyncComponent, onDeactivated } from "vue";
import InventoryDetailDrawer from "@/features/inventory/InventoryDetailDrawer.vue";
import { useInventoryDetail } from "@/features/inventory/useInventoryDetail";
import { loadRelicMainStatScanner } from "./scanner-loaders";
import { relicImage } from "@/shared/catalogue";
import { useRuntimeContext } from "@/shared/contracts/runtime";

defineOptions({ name: "MobileAnalysisPage" });
const runtime = useRuntimeContext();
const detail = useInventoryDetail((message) => (runtime.error.value = message));
const RelicMainStatScanner = defineAsyncComponent(loadRelicMainStatScanner);
onDeactivated(detail.close);
</script>

<template>
  <section class="mobile-analysis">
    <RelicMainStatScanner
      :key="runtime.inventoryRevision.value"
      :image-for="(item) => relicImage(item.setId, item.slot)"
      @open-relic="detail.open('relic', $event.itemId)"
    />
    <InventoryDetailDrawer
      v-if="detail.detail.value || detail.loading.value"
      :detail="detail.detail.value"
      :loading="detail.loading.value"
      @close="detail.close"
    />
  </section>
</template>

<style scoped>
.mobile-analysis {
  min-width: 0;
}
.mobile-analysis :deep(.relic-scanner) {
  height: auto;
  padding: 0;
  overflow: visible;
}
.mobile-analysis :deep(.scanner-hero) {
  flex-direction: row;
  align-items: center;
  gap: 10px;
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
}
.mobile-analysis :deep(.scanner-title) {
  display: none;
}
.mobile-analysis :deep(.scanner-hero::after),
.mobile-analysis :deep(.scanner-title .eyebrow),
.mobile-analysis :deep(.scanner-sigil),
.mobile-analysis :deep(.scanner-command > small),
.mobile-analysis :deep(.command-marker),
.mobile-analysis :deep(.cleaning-header-compact .compact-left > small),
.mobile-analysis :deep(.scanner-result-heading small) {
  display: none;
}
.mobile-analysis :deep(.scanner-title h2) {
  font-size: 18px;
  letter-spacing: 0;
}
.mobile-analysis :deep(.scanner-title > p:last-child) {
  font-size: 13px;
  line-height: 1.6;
}
.mobile-analysis :deep(.scanner-command) {
  align-items: stretch;
  flex: 1;
  min-width: 0;
}
.mobile-analysis :deep(.scanner-command-buttons) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.mobile-analysis :deep(.scanner-command .p-button) {
  min-width: 0;
  min-height: 44px;
  padding: 10px 6px;
  border-radius: 8px;
  font-size: 13px;
  box-shadow: none;
  background: var(--blue);
}
.mobile-analysis :deep(.scanner-command .p-button-outlined) {
  background: white;
}
.mobile-analysis :deep(.scanner-command .p-button:not(.p-button-outlined)) {
  background: var(--blue);
  border-color: var(--blue);
  box-shadow: none;
}
.mobile-analysis :deep(.scanner-command .p-button.p-button-outlined) {
  background: white;
  box-shadow: none;
}
.mobile-analysis :deep(.scanner-intro) {
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  height: auto;
  padding: 24px 16px;
  border-radius: 14px;
}
.mobile-analysis :deep(.scanner-intro > div:last-child) {
  justify-items: center;
  text-align: center;
}
.mobile-analysis :deep(.scanner-radar) {
  display: none;
}
.mobile-analysis :deep(.scanner-intro p) {
  display: none;
}
.mobile-analysis :deep(.scanner-intro strong) {
  font-size: 16px;
}
.mobile-analysis :deep(.scanner-intro small) {
  font-size: 12px;
  line-height: 1.6;
}
.mobile-analysis :deep(.scanner-state) {
  min-height: 120px;
  height: auto;
  border-radius: 14px;
  padding: 20px 16px;
  font-size: 14px;
}
.mobile-analysis :deep(.cleaning-header-compact),
.mobile-analysis :deep(.scanner-result-heading) {
  flex-wrap: wrap;
  gap: 12px;
}
.mobile-analysis :deep(.compact-right) {
  width: 100%;
  flex-wrap: wrap;
}
.mobile-analysis :deep(.search-input-wrapper) {
  flex: 1;
  min-width: 0;
}
.mobile-analysis :deep(.search-input),
.mobile-analysis :deep(.slot-filter-select) {
  min-height: 44px;
  font-size: 14px;
}
.mobile-analysis :deep(.category-tabs-group) {
  flex-wrap: wrap;
}
.mobile-analysis :deep(.cat-tab-btn) {
  min-height: 44px;
}
.mobile-analysis :deep(.compact-title-row) {
  flex-wrap: wrap;
  gap: 6px;
}
.mobile-analysis :deep(.scanner-review-results) {
  container-name: scanner-results;
  container-type: inline-size;
  min-width: 0;
}
.mobile-analysis :deep(.scanner-review-cards) {
  display: none;
}
@container scanner-results (max-width: 580px) {
  .mobile-analysis :deep(.scanner-review-cards) {
    display: block;
  }
  .mobile-analysis :deep(.matrix-board-container) {
    display: none;
  }
}
.mobile-analysis :deep(.matrix-board-container) {
  overflow: visible;
}
.mobile-analysis :deep(.matrix-table-wrapper) {
  overflow-x: auto;
  overscroll-behavior-x: contain;
}
.mobile-analysis :deep(.modern-matrix-table) {
  min-width: 100%;
  width: max-content;
}
.mobile-analysis :deep(.col-slot-header) {
  min-width: 112px;
}
.mobile-analysis :deep(.chip-stat-label) {
  white-space: nowrap;
}
.mobile-analysis :deep(.scanner-upgrade-grid) {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  grid-auto-rows: auto;
  overflow: visible;
  padding: 0;
}
.mobile-analysis :deep(.upgrade-card) {
  height: auto;
  min-width: 0;
  border-radius: 14px;
  grid-template-rows: auto auto auto auto auto;
}
.mobile-analysis :deep(.substat-chips-row) {
  grid-template-rows: repeat(2, auto);
}
.mobile-analysis :deep(.card-view-btn) {
  display: none;
}
.mobile-analysis :deep(.scanner-result-heading p) {
  font-size: 14px;
}
.mobile-analysis :deep(.scanner-result-note) {
  line-height: 1.6;
}
</style>
