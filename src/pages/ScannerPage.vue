<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from "vue";
import InventoryDetailDrawer from "@/features/inventory/InventoryDetailDrawer.vue";
import { useInventoryDetail } from "@/features/inventory/useInventoryDetail";
import { loadRelicCleanupPanel, loadRelicMainStatScanner } from "@/pages/scanner-loaders";
import { relicImage } from "@/shared/catalogue";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import AsyncViewLoading from "@/shared/ui/AsyncViewLoading.vue";
import LoadingState from "@/shared/ui/LoadingState.vue";

const { error } = useRuntimeContext();
defineOptions({ name: "ScannerPage" });

const inventoryDetail = useInventoryDetail((message) => (error.value = message));
const imageFor = (item: { setId: number; slot: string }) => relicImage(item.setId, item.slot);
const mode = ref<"mainStat" | "cleanup">("cleanup");
const panelReady = ref(false);
const desktopToolbarHost = ref<HTMLElement | null>(null);
const RelicCleanupPanel = defineAsyncComponent({
  loader: loadRelicCleanupPanel,
  loadingComponent: AsyncViewLoading,
  delay: 120,
});
const RelicMainStatScanner = defineAsyncComponent({
  loader: loadRelicMainStatScanner,
  loadingComponent: AsyncViewLoading,
  delay: 120,
});
let mountFrame: number | undefined;

function selectMode(nextMode: "mainStat" | "cleanup") {
  if (nextMode === "mainStat") void loadRelicMainStatScanner();
  else void loadRelicCleanupPanel();
  mode.value = nextMode;
}

onMounted(() => {
  mountFrame = window.requestAnimationFrame(() => {
    mountFrame = window.requestAnimationFrame(() => {
      panelReady.value = true;
      mountFrame = undefined;
    });
  });
});

onBeforeUnmount(() => {
  if (mountFrame !== undefined) window.cancelAnimationFrame(mountFrame);
});
</script>
<template>
  <section class="scanner-page">
    <nav class="scanner-mode-bar" aria-label="背包扫描模式">
      <div class="scanner-mode-left">
        <span class="scanner-mode-mark" aria-hidden="true">◇</span>
        <div class="scanner-mode-switch">
          <button
            type="button"
            :class="{ active: mode === 'cleanup' }"
            @pointerenter="loadRelicCleanupPanel()"
            @focus="loadRelicCleanupPanel()"
            @click="selectMode('cleanup')"
          >
            <small>01</small><span>安全清理</span>
          </button>
          <button
            type="button"
            :class="{ active: mode === 'mainStat' }"
            @pointerenter="loadRelicMainStatScanner()"
            @focus="loadRelicMainStatScanner()"
            @click="selectMode('mainStat')"
          >
            <small>02</small><span>主词条扫描</span>
          </button>
        </div>
      </div>
      <div class="scanner-mode-right">
        <span v-if="mode === 'cleanup'" class="scanner-mode-kicker">SAFE SALVAGE WORKBENCH</span>
        <div ref="desktopToolbarHost" class="scanner-mode-actions" />
      </div>
    </nav>
    <div class="scanner-page-content">
      <LoadingState v-if="!panelReady" variant="page" label="正在准备遗器工作台…" />
      <RelicCleanupPanel v-else-if="mode === 'cleanup'" />
      <RelicMainStatScanner
        v-else
        :image-for="imageFor"
        :desktop-toolbar-host="desktopToolbarHost"
        @open-relic="inventoryDetail.open('relic', $event.itemId)"
      />
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
  gap: 8px;
  height: 100%;
  min-height: 0;
  padding: 10px 24px 10px;
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
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 4px 8px 4px 12px;
  border: 1px solid rgba(46, 79, 126, 0.15);
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.92), rgba(246, 249, 253, 0.8)),
    linear-gradient(135deg, rgba(199, 165, 90, 0.08), transparent 52%);
  box-shadow: 0 6px 18px rgba(39, 72, 117, 0.04);
}
.scanner-mode-left,
.scanner-mode-right,
.scanner-mode-actions,
.scanner-mode-switch,
.scanner-mode-switch button {
  display: flex;
  align-items: center;
}
.scanner-mode-left {
  gap: 10px;
  min-width: 0;
}
.scanner-mode-right {
  gap: 10px;
  margin-left: auto;
  min-width: 0;
}
.scanner-mode-kicker {
  padding-right: 6px;
  color: var(--muted);
  font:
    700 9px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.16em;
  white-space: nowrap;
}
.scanner-mode-mark {
  color: var(--gold);
  font-size: 16px;
  line-height: 1;
}
.scanner-mode-switch {
  gap: 2px;
  padding: 2px;
  background: rgba(224, 230, 238, 0.64);
}
.scanner-mode-switch button {
  min-width: 112px;
  justify-content: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid transparent;
  color: var(--ink-soft);
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 150ms ease,
    background 150ms ease,
    box-shadow 150ms ease;
}
.scanner-mode-switch button small {
  color: var(--muted);
  font:
    700 8px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.08em;
}
.scanner-mode-switch button.active {
  border-color: rgba(34, 79, 148, 0.18);
  color: var(--blue-deep);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 2px 8px rgba(38, 70, 112, 0.1);
}
.scanner-mode-switch button.active small {
  color: var(--gold);
}
@media (max-width: 760px) {
  .scanner-page {
    padding-inline: 14px;
  }
  .scanner-mode-left {
    width: 100%;
  }
  .scanner-mode-mark,
  .scanner-mode-kicker {
    display: none;
  }
  .scanner-mode-switch {
    width: 100%;
  }
  .scanner-mode-switch button {
    min-width: 0;
    flex: 1;
  }
  .scanner-mode-right {
    width: 100%;
    margin-left: 0;
    justify-content: flex-end;
  }
}
</style>
