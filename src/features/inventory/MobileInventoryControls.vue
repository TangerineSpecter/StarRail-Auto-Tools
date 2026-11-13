<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, ref, watch } from "vue";
import type { InventoryKind } from "@/types";
import MobileFloatingSearch from "@/shared/ui/MobileFloatingSearch.vue";
import MobileInventoryCategoryTabs from "./MobileInventoryCategoryTabs.vue";
import { mobileInventoryCategoryMeta } from "./mobile-inventory-categories";

const props = defineProps<{
  kind: InventoryKind;
  total: number;
  activeFilterCount: number;
  hasFilters: boolean;
  hideCategories?: boolean;
  preview?: boolean;
  railHost?: HTMLElement | null;
}>();
const search = defineModel<string>("search", { required: true });
const emit = defineEmits<{
  category: [kind: InventoryKind];
  search: [];
  filter: [];
  reset: [];
}>();
const composing = ref(false);
const searchOpen = ref(false);
const floatingSearchRef = ref<InstanceType<typeof MobileFloatingSearch> | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
function cancelSearch() {
  clearTimeout(timer);
  timer = undefined;
  floatingSearchRef.value?.cancelPending();
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
function closeFloatingSearch() {
  searchOpen.value = false;
}
function toggleFloatingSearch() {
  if (searchOpen.value) floatingSearchRef.value?.dismissSearch();
  else searchOpen.value = true;
}
function openFilterDrawer() {
  cancelSearch();
  closeFloatingSearch();
  emit("filter");
}
function clearAllFilters() {
  composing.value = false;
  cancelSearch();
  closeFloatingSearch();
  search.value = "";
  emit("reset");
}
const categoryMeta = computed(() => mobileInventoryCategoryMeta(props.kind));
watch(() => props.kind, cancelSearch);
onDeactivated(() => {
  composing.value = false;
  closeFloatingSearch();
  cancelSearch();
});
onBeforeUnmount(() => {
  cancelSearch();
});
defineExpose({ cancelSearch, closeFloatingSearch, toggleFloatingSearch, searchOpen });
</script>
<template>
  <div class="mobile-inventory-controls">
    <MobileInventoryCategoryTabs
      v-if="!hideCategories"
      :kind="kind"
      @category="
        cancelSearch();
        emit('category', $event);
      "
    />
    <form class="mobile-inventory-search" role="search" @submit.prevent="submit()">
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
        @input="scheduleSearch()"
        @compositionstart="startComposition"
        @compositionend="finishComposition"
      />
      <button
        v-if="search"
        class="mobile-inventory-search-clear"
        type="button"
        aria-label="清空搜索"
        @click="clearSearch()"
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
        @click="openFilterDrawer()"
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
    <div v-if="hasFilters || search.trim()" class="mobile-inventory-status">
      <p role="status">
        {{ total }} {{ categoryMeta.unit }}{{ categoryMeta.name
        }}<span v-if="search.trim()"> · 搜索“{{ search.trim() }}”</span
        ><span v-if="hasFilters"> · 筛选结果</span>
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
    <Teleport v-if="!preview" :to="railHost ?? 'body'" :disabled="!railHost">
      <div class="mobile-rail-tools" role="group" aria-label="背包快捷工具">
        <button
          v-if="hasFilters || activeFilterCount > 0 || Boolean(search.trim())"
          type="button"
          class="mobile-rail-tool mobile-rail-tool-clear"
          aria-label="清空搜索与筛选"
          @click="clearAllFilters()"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="m14.8 9.2-5.6 5.6M9.2 9.2l5.6 5.6" />
          </svg>
          <span>清空</span>
        </button>
        <button
          type="button"
          class="mobile-rail-tool"
          :class="{ 'is-active': searchOpen || Boolean(search.trim()) }"
          :aria-expanded="searchOpen"
          aria-label="搜索背包"
          @click="toggleFloatingSearch()"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <span>搜索</span>
        </button>
        <button
          type="button"
          class="mobile-rail-tool"
          :class="{ 'is-active': activeFilterCount > 0 }"
          :aria-label="activeFilterCount ? `筛选，已选 ${activeFilterCount} 项条件` : '筛选背包'"
          @click="openFilterDrawer()"
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
          <span>筛选</span>
          <b v-if="activeFilterCount">{{ activeFilterCount }}</b>
        </button>
      </div>
    </Teleport>
    <MobileFloatingSearch
      ref="floatingSearchRef"
      v-model="search"
      v-model:open="searchOpen"
      placeholder="搜索名称或角色"
      aria-label="搜索背包名称或装备角色"
      :debounce-ms="300"
      :preview="preview"
      @search="emit('search')"
    />
  </div>
</template>
