<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import type { InventorySummary } from "@/types";
import { appViews, type AppView } from "@/app/navigation";

defineProps<{ activeView: AppView; summary: InventorySummary }>();
const emit = defineEmits<{
  "update:activeView": [view: AppView];
  "preload-view": [view: AppView];
}>();

const views = appViews;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function handleShortcut(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    isEditableTarget(event.target)
  ) {
    return;
  }

  const view = views[Number(event.key) - 1];
  if (!view) return;

  event.preventDefault();
  emit("update:activeView", view.id);
}

onMounted(() => window.addEventListener("keydown", handleShortcut));
onBeforeUnmount(() => window.removeEventListener("keydown", handleShortcut));
</script>

<template>
  <nav class="module-nav" aria-label="工具模块">
    <span class="module-index">{{ views.find((view) => view.id === activeView)?.index }}</span>
    <template v-for="(view, index) in views" :key="view.id">
      <span v-if="index" class="nav-divider" />
      <button
        :class="['nav-item', { active: activeView === view.id }]"
        type="button"
        :aria-keyshortcuts="String(index + 1)"
        @pointerenter="emit('preload-view', view.id)"
        @focus="emit('preload-view', view.id)"
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
