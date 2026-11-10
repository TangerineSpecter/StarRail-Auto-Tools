<script setup lang="ts">
import { onBeforeUnmount, onDeactivated, ref, watch } from "vue";
import type { InventoryKind } from "@/types";

const props = defineProps<{
  kind: InventoryKind;
  total: number;
  activeFilterCount: number;
  hasFilters: boolean;
}>();
const search = defineModel<string>("search", { required: true });
const emit = defineEmits<{
  category: [kind: InventoryKind];
  search: [];
  filter: [];
  reset: [];
}>();
const categories: { id: InventoryKind; name: string }[] = [
  { id: "relic", name: "遗器" },
  { id: "lightCone", name: "光锥" },
  { id: "character", name: "角色" },
];
const composing = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
function cancelSearch() {
  clearTimeout(timer);
  timer = undefined;
}
function submit() {
  cancelSearch();
  if (!composing.value) emit("search");
}
function scheduleSearch() {
  cancelSearch();
  if (!composing.value) timer = setTimeout(submit, 300);
}
function clearSearch() {
  search.value = "";
  submit();
}
function startComposition() {
  composing.value = true;
  cancelSearch();
}
function finishComposition() {
  composing.value = false;
  scheduleSearch();
}
watch(() => props.kind, cancelSearch);
onDeactivated(() => {
  composing.value = false;
  cancelSearch();
});
onBeforeUnmount(cancelSearch);
</script>
<template>
  <div class="mobile-inventory-controls">
    <nav class="mobile-inventory-categories" aria-label="背包分类">
      <button
        v-for="item in categories"
        :key="item.id"
        type="button"
        :class="{ active: kind === item.id }"
        :aria-pressed="kind === item.id"
        @click="
          cancelSearch();
          emit('category', item.id);
        "
      >
        {{ item.name }}
      </button>
    </nav>
    <form class="mobile-inventory-search" role="search" @submit.prevent="submit">
      <svg
        class="mobile-inventory-search-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </svg>
      <input
        v-model="search"
        type="search"
        aria-label="搜索背包名称或装备角色"
        placeholder="搜索名称或角色"
        enterkeyhint="search"
        autocomplete="off"
        @input="scheduleSearch"
        @compositionstart="startComposition"
        @compositionend="finishComposition"
      />
      <button
        v-if="search"
        class="mobile-inventory-search-clear"
        type="button"
        aria-label="清空搜索"
        @click="clearSearch"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="m8 8 8 8M16 8l-8 8" />
        </svg>
      </button>
      <button
        class="mobile-inventory-filter"
        :class="{ 'is-active': activeFilterCount > 0 }"
        type="button"
        :aria-label="activeFilterCount ? `筛选，已选 ${activeFilterCount} 项条件` : '筛选背包'"
        title="筛选"
        @click="
          cancelSearch();
          emit('filter');
        "
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 17h16" />
          <circle cx="9" cy="7" r="2.5" />
          <circle cx="15" cy="17" r="2.5" />
        </svg>
        <b v-if="activeFilterCount">{{ activeFilterCount }}</b>
      </button>
    </form>
    <div class="mobile-inventory-status">
      <p role="status">
        {{ total }} {{ kind === "character" ? "名角色" : kind === "lightCone" ? "把光锥" : "件遗器"
        }}<span v-if="hasFilters"> · 筛选结果</span>
      </p>
      <button
        v-if="hasFilters"
        type="button"
        @click="
          cancelSearch();
          emit('reset');
        "
      >
        重置
      </button>
    </div>
  </div>
</template>
