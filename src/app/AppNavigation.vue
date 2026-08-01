<script setup lang="ts">
import type { InventorySummary } from "@/types";

export type AppView = "capture" | "archive" | "catalogue" | "builds" | "scanner" | "about";

defineProps<{ activeView: AppView; summary: InventorySummary }>();
const emit = defineEmits<{ "update:activeView": [view: AppView] }>();

const views: Array<{ id: AppView; index: string; label: string; title: string }> = [
  { id: "capture", index: "01", label: "ACQUISITION", title: "数据录入" },
  { id: "archive", index: "02", label: "MANAGEMENT", title: "数据管理" },
  { id: "catalogue", index: "03", label: "CATALOGUE", title: "套装图鉴" },
  { id: "builds", index: "04", label: "BUILD MANAGEMENT", title: "毕业管理" },
  { id: "scanner", index: "05", label: "INVENTORY SCAN", title: "背包扫描" },
  { id: "about", index: "06", label: "ABOUT PROJECT", title: "关于" },
];
</script>

<template>
  <nav class="module-nav" aria-label="工具模块">
    <span class="module-index">{{ views.find((view) => view.id === activeView)?.index }}</span>
    <template v-for="(view, index) in views" :key="view.id">
      <span v-if="index" class="nav-divider" />
      <button
        :class="['nav-item', { active: activeView === view.id }]"
        type="button"
        @click="emit('update:activeView', view.id)"
      >
        <small>{{ view.label }}</small>
        {{ view.title }}
      </button>
    </template>
    <span class="route-line" aria-hidden="true"><i /><i /><i /></span>
    <div class="nav-counts">
      <span
        >遗器 <b>{{ summary.relics }}</b></span
      >
      <span
        >光锥 <b>{{ summary.lightCones }}</b></span
      >
      <span
        >角色 <b>{{ summary.characters }}</b></span
      >
    </div>
  </nav>
</template>
