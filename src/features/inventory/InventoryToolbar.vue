<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import InputText from "primevue/inputtext";
import type { InventoryKind } from "@/types";
import type { InventoryFilterForm } from "./filter";

const props = defineProps<{
  kind: InventoryKind;
  total: number;
  activeFilterCount: number;
  hasFilters: boolean;
}>();
const filters = defineModel<InventoryFilterForm>("filters", { required: true });
const emit = defineEmits<{ search: []; filter: []; reset: [] }>();
const title = () =>
  props.kind === "relic" ? "遗器档案" : props.kind === "lightCone" ? "光锥档案" : "角色档案";
const searchPlaceholder = () =>
  props.kind === "relic"
    ? "搜索名称、套装或装备角色"
    : props.kind === "lightCone"
      ? "搜索名称或装备角色"
      : "搜索角色名称";

const onlyMissingBuildPlan = computed({
  get: () => filters.value.buildPlan === "false",
  set: (checked: boolean) => {
    filters.value.buildPlan = checked ? "false" : "";
    emit("search");
  },
});
</script>

<template>
  <header class="archive-heading">
    <div>
      <p class="eyebrow">FILTER RESULTS</p>
      <h2>{{ title() }}</h2>
    </div>
    <div class="archive-actions" style="align-items: center">
      <label class="quick-search"
        ><span class="visually-hidden">关键词</span
        ><svg viewBox="0 0 1024 1024" aria-hidden="true">
          <path
            d="M909.6 854.5 649.9 594.8C690.2 542.7 712 479 712 412c0-165.7-134.3-300-300-300S112 246.3 112 412s134.3 300 300 300c67 0 130.6-21.8 182.7-62l259.7 259.6a40.2 40.2 0 0 0 56.9 0 40.2 40.2 0 0 0-1.7-55.1ZM412 640c-125.9 0-228-102.1-228-228s102.1-228 228-228 228 102.1 228 228-102.1 228-228 228Z"
            fill="currentColor"
          /></svg
        ><InputText
          v-model="filters.search"
          :placeholder="searchPlaceholder()"
          @keyup.enter="emit('search')"
      /></label>
      <Button class="filter-toggle" type="button" outlined @click="emit('filter')">
        <svg viewBox="0 0 1024 1024" width="1em" height="1em" aria-hidden="true">
          <path
            d="M790.7 171.7a60 60 0 0 0-55-35.2H196.4a60.7 60.7 0 0 0-46.6 99.8l189.8 225.5v301.8c0 28.5 16.9 54.1 43.2 65.2L518.8 887a52.6 52.6 0 0 0 73.6-48.5V461.8l189.8-225.5a60.2 60.2 0 0 0 8.5-64.6ZM524.1 436.9v378L409.6 766.1c-1-.5-1.7-1.4-1.7-2.6V436.9L212.7 204.8h507L524.1 436.9Z"
            fill="currentColor"
          /></svg
        ><span>筛选</span><b v-if="activeFilterCount">{{ activeFilterCount }}</b>
      </Button>
      <label
        v-if="kind === 'character'"
        class="toolbar-missing-plan-toggle"
        :class="{ 'is-active': onlyMissingBuildPlan }"
        title="仅显示未设置培养目标的角色"
      >
        <Checkbox v-model="onlyMissingBuildPlan" binary input-id="character-missing-plan-only" />
        <span>无目标</span>
      </label>
      <slot name="actions" />
      <Button v-if="hasFilters" class="clear-filter" type="button" text @click="emit('reset')"
        >清空</Button
      >
      <span class="toolbar-spacer" /><span class="result-count">{{ total }} 条记录</span>
    </div>
  </header>
</template>

<style scoped>
.toolbar-missing-plan-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(46, 78, 119, 0.15);
  border-radius: 6px;
  background: #fff;
  color: var(--ink-soft);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
}
.toolbar-missing-plan-toggle:hover {
  background: #f8fbff;
  border-color: rgba(46, 78, 119, 0.25);
}
.toolbar-missing-plan-toggle.is-active {
  border-color: rgba(36, 86, 166, 0.34);
  background: #f2f7fe;
  color: var(--blue);
}
</style>
