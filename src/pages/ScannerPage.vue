<script setup lang="ts">
import { ref } from "vue";
import RelicMainStatScanner from "@/features/relic-scanner/RelicMainStatScanner.vue";
import RelicCleanupPanel from "@/features/relic-cleanup/RelicCleanupPanel.vue";
import InventoryDetailDrawer from "@/features/inventory/InventoryDetailDrawer.vue";
import { useInventoryDetail } from "@/features/inventory/useInventoryDetail";
import { relicImage } from "@/shared/catalogue";
import { useRuntimeContext } from "@/shared/contracts/runtime";

const { error } = useRuntimeContext();
const inventoryDetail = useInventoryDetail((message) => (error.value = message));
const imageFor = (item: { setId: number; slot: string }) => relicImage(item.setId, item.slot);
const mode = ref<"mainStat" | "cleanup">("cleanup");
</script>
<template>
  <section class="scanner-page">
    <nav class="scanner-mode-bar" aria-label="背包扫描模式">
      <div class="scanner-mode-context">
        <span class="scanner-mode-mark" aria-hidden="true">◇</span>
        <div>
          <small>INVENTORY SCAN</small>
          <strong>遗器工作台</strong>
        </div>
      </div>
      <div class="scanner-mode-switch">
        <button type="button" :class="{ active: mode === 'cleanup' }" @click="mode = 'cleanup'">
          <small>01</small><span>安全清理</span>
        </button>
        <button type="button" :class="{ active: mode === 'mainStat' }" @click="mode = 'mainStat'">
          <small>02</small><span>主词条扫描</span>
        </button>
      </div>
    </nav>
    <div class="scanner-page-content">
      <KeepAlive>
        <RelicCleanupPanel v-if="mode === 'cleanup'" />
        <RelicMainStatScanner
          v-else
          :image-for="imageFor"
          @open-relic="inventoryDetail.open('relic', $event.itemId)"
        />
      </KeepAlive>
    </div>
    <InventoryDetailDrawer
      v-if="inventoryDetail.detail.value || inventoryDetail.loading.value"
      :detail="inventoryDetail.detail.value"
      :loading="inventoryDetail.loading.value"
      @close="inventoryDetail.close"
    />
  </section>
</template>

<style scoped>
.scanner-page {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  height: 100%;
  min-height: 0;
  padding: 16px 28px 12px;
  overflow: hidden;
}
.scanner-page-content {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.scanner-page-content > :deep(.relic-scanner) {
  padding: 0;
}
.scanner-mode-bar {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 5px 6px 5px 15px;
  border: 1px solid rgba(46, 79, 126, 0.15);
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.9), rgba(246, 249, 253, 0.78)),
    linear-gradient(135deg, rgba(199, 165, 90, 0.08), transparent 52%);
  box-shadow: 0 8px 24px rgba(39, 72, 117, 0.05);
}
.scanner-mode-context,
.scanner-mode-switch,
.scanner-mode-switch button {
  display: flex;
  align-items: center;
}
.scanner-mode-context {
  gap: 9px;
}
.scanner-mode-context > div {
  display: grid;
  gap: 2px;
}
.scanner-mode-context small {
  color: var(--muted);
  font:
    700 7px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.18em;
}
.scanner-mode-context strong {
  color: var(--ink);
  font-size: 12px;
  letter-spacing: 0.08em;
}
.scanner-mode-mark {
  color: var(--gold);
  font-size: 18px;
}
.scanner-mode-switch {
  align-self: stretch;
  gap: 2px;
  padding: 2px;
  background: rgba(224, 230, 238, 0.64);
}
.scanner-mode-switch button {
  min-width: 122px;
  justify-content: center;
  gap: 8px;
  padding: 7px 14px;
  border: 1px solid transparent;
  color: var(--ink-soft);
  background: transparent;
  font-size: 11px;
  transition:
    color 150ms ease,
    background 150ms ease,
    box-shadow 150ms ease;
}
.scanner-mode-switch button small {
  color: var(--muted);
  font:
    700 7px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.08em;
}
.scanner-mode-switch button.active {
  border-color: rgba(34, 79, 148, 0.18);
  color: var(--blue-deep);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 3px 10px rgba(38, 70, 112, 0.1);
}
.scanner-mode-switch button.active small {
  color: var(--gold);
}
@media (max-width: 760px) {
  .scanner-page {
    padding-inline: 14px;
  }
  .scanner-mode-context {
    display: none;
  }
  .scanner-mode-switch {
    width: 100%;
  }
  .scanner-mode-switch button {
    min-width: 0;
    flex: 1;
  }
}
</style>
