<script setup lang="ts">
import Button from "primevue/button";
import { inventoryApi } from "@/shared/api/inventory";
import { formatTime } from "@/shared/utils/display";
import type { InventorySummary } from "@/types";

const props = defineProps<{ summary: InventorySummary; busy: boolean }>();
const emit = defineEmits<{
  busy: [value: boolean];
  error: [message: string];
  notice: [message: string];
}>();

async function exportData() {
  emit("busy", true);
  try {
    const path = await inventoryApi.export();
    if (path) emit("notice", `数据已导出：${path}`);
  } catch (cause) {
    emit("error", String(cause));
  } finally {
    emit("busy", false);
  }
}
</script>

<template>
  <article class="panel sync-panel">
    <div class="panel-heading compact">
      <div>
        <p class="eyebrow">DATA MANAGEMENT</p>
        <h2>数据管理</h2>
      </div>
      <span class="record-dot" />
    </div>
    <div class="sync-ledger">
      <div>
        <span>最近同步</span><strong>{{ formatTime(summary.lastSyncAt) }}</strong>
      </div>
      <div>
        <span>已归档数据</span
        ><strong>{{ summary.relics + summary.lightCones + summary.characters }} 条</strong>
      </div>
    </div>
    <Button class="capture-action-btn" type="button" :disabled="busy" @click="exportData">
      <svg class="crop-icon" viewBox="0 0 24 24" width="1.2em" height="1.2em" aria-hidden="true">
        <path d="M5 20h14v-2H5v2Zm7-17-5 5h3v6h4V8h3l-5-5Z" fill="currentColor" />
      </svg>
      <span>导出数据</span>
    </Button>
  </article>
</template>
