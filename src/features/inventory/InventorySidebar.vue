<script setup lang="ts">
import Button from "primevue/button";
import { formatTime } from "@/shared/utils/display";
import type { InventoryKind, InventorySummary } from "@/types";

defineProps<{ kind: InventoryKind; summary: InventorySummary; busy: boolean }>();
const emit = defineEmits<{
  "update:kind": [kind: InventoryKind];
  export: [];
  import: [];
}>();
const entries = [
  {
    kind: "relic" as const,
    label: "遗器",
    code: "RELIC",
    count: (summary: InventorySummary) => summary.relics,
  },
  {
    kind: "lightCone" as const,
    label: "光锥",
    code: "CONE",
    count: (summary: InventorySummary) => summary.lightCones,
  },
  {
    kind: "character" as const,
    label: "角色",
    code: "AVATAR",
    count: (summary: InventorySummary) => summary.characters,
  },
];
</script>

<template>
  <aside class="panel archive-sidebar">
    <p class="eyebrow">DATA MANAGEMENT</p>
    <h2>数据管理</h2>
    <p class="sidebar-copy">结构化索引为后续遗器评分与配装分析准备。</p>
    <div class="kind-switcher">
      <button
        v-for="entry in entries"
        :key="entry.kind"
        :class="{ active: kind === entry.kind }"
        type="button"
        @click="emit('update:kind', entry.kind)"
      >
        <span
          ><small>{{ entry.code }}</small
          >{{ entry.label }}</span
        ><b>{{ entry.count(summary) }}</b>
      </button>
    </div>
    <div class="archive-meta">
      <span>最近同步</span><strong>{{ formatTime(summary.lastSyncAt) }}</strong>
    </div>
    <Button class="capture-action-btn" :disabled="busy" @click="emit('export')">
      <svg class="crop-icon" viewBox="0 0 24 24" width="1.2em" height="1.2em" aria-hidden="true">
        <path d="M5 20h14v-2H5v2Zm7-17-5 5h3v6h4V8h3l-5-5Z" fill="currentColor" /></svg
      ><span>导出数据</span>
    </Button>
    <Button class="capture-action-btn" :disabled="busy" @click="emit('import')">
      <svg class="crop-icon" viewBox="0 0 24 24" width="1.2em" height="1.2em" aria-hidden="true">
        <path d="M5 20h14v-2H5v2Zm7-3 5-5h-3V6h-4v6H7l5 5Z" fill="currentColor" /></svg
      ><span>导入 JSON</span>
    </Button>
  </aside>
</template>
