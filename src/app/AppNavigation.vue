<script setup lang="ts">
import type { InventorySummary } from "@/types";
import { appViews, type AppView } from "@/app/navigation";

defineProps<{ activeView: AppView; summary: InventorySummary }>();
const emit = defineEmits<{ "update:activeView": [view: AppView] }>();

const views = appViews;
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
<style scoped src="./navigation.css"></style>
