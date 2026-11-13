<script setup lang="ts">
import type { RelicSetCatalogueEntry } from "@/types";
import {
  farmingPriorityClass,
  formatFarmingCoverage,
  formatFarmingPriority,
  formatFarmingQuality,
  type RelicSetFarmingItem,
} from "./relic-farming-score";

defineProps<{
  items: RelicSetFarmingItem[];
  kindLabel: string;
  loading: boolean;
  error: string;
}>();
const emit = defineEmits<{ select: [set: RelicSetCatalogueEntry]; retry: [] }>();
</script>
<template>
  <section class="mobile-farming" :aria-label="`${kindLabel}刷取评分`" :aria-busy="loading">
    <p v-if="loading" class="mobile-farming-state" role="status">正在评估当前穿戴质量…</p>
    <p v-else-if="error" class="mobile-farming-state" role="alert">
      {{ error }}<button type="button" @click="emit('retry')">重试</button>
    </p>
    <p v-else-if="!items.length" class="mobile-farming-state">当前分类暂无套装数据。</p>
    <div v-else class="mobile-farming-list">
      <button
        v-for="item in items"
        :key="item.set.id"
        type="button"
        class="mobile-farming-item"
        :class="[
          `priority-${farmingPriorityClass(item.priorityScore)}`,
          { 'is-unassigned': !item.targetCount },
        ]"
        :aria-label="`查看${item.set.name}，刷取优先分${formatFarmingPriority(item)}分，${item.targetCount ? `${item.targetCount}名目标角色，当前质量${formatFarmingQuality(item)}，覆盖${formatFarmingCoverage(item)}件` : '未设置培养目标'}`"
        @click="emit('select', item.set)"
      >
        <span class="mobile-farming-icon"
          ><img v-if="item.set.image" :src="item.set.image" alt="" /><span v-else>遗</span></span
        >
        <strong class="mobile-farming-name">{{ item.set.name }}</strong>
        <span class="mobile-farming-score"
          ><b>{{ formatFarmingPriority(item) }}</b
          ><small>分</small></span
        >
        <span v-if="item.targetCount" class="mobile-farming-metrics">
          <span>{{ item.targetCount }} 名目标</span
          ><span>质量 {{ formatFarmingQuality(item) }}</span
          ><span>覆盖 {{ formatFarmingCoverage(item) }} 件</span>
        </span>
        <span v-else class="mobile-farming-metrics">未设置培养目标</span>
        <span v-if="item.targetCount" class="mobile-farming-track" aria-hidden="true"
          ><i :style="{ width: `${item.opportunityPct}%` }"
        /></span>
      </button>
    </div>
  </section>
</template>
<style scoped>
.mobile-farming {
  min-width: 0;
}
.mobile-farming-list {
  display: grid;
  gap: 10px;
}
.mobile-farming-item {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) max-content;
  grid-template-areas: "icon name score" "icon metrics metrics" "icon track track";
  align-items: center;
  gap: 6px 10px;
  width: 100%;
  min-width: 0;
  padding: 14px 12px;
  border: 1px solid #e8dfcf;
  border-radius: 12px;
  background: #fffdf8;
  color: var(--ink);
  text-align: left;
}
.mobile-farming-icon {
  grid-area: icon;
  display: grid;
  place-items: center;
  align-self: start;
  width: 40px;
  height: 40px;
  border-radius: 9px;
  background: #edf2f7;
}
.mobile-farming-icon img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}
.mobile-farming-name {
  grid-area: name;
  min-width: 0;
  font-size: 14px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.mobile-farming-score {
  grid-area: score;
  display: inline-flex;
  align-items: baseline;
  align-self: start;
  gap: 3px;
  color: var(--blue);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.mobile-farming-score b {
  font-size: 18px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.mobile-farming-score small {
  font-size: 12px;
  font-weight: 400;
}
.mobile-farming-metrics {
  grid-area: metrics;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.mobile-farming-metrics > span {
  white-space: nowrap;
}
.mobile-farming-track {
  grid-area: track;
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: #eee5d5;
}
.mobile-farming-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #bc8a34;
}
.mobile-farming-item.priority-urgent .mobile-farming-score {
  color: #b55f2b;
}
.mobile-farming-item.priority-urgent .mobile-farming-track i {
  background: #b55f2b;
}
.mobile-farming-item.is-unassigned {
  grid-template-areas: "icon name score" "icon metrics metrics";
  background: #fff;
  border-color: var(--line);
}
.mobile-farming-item.is-unassigned .mobile-farming-score {
  color: var(--muted);
}
.mobile-farming-item:active {
  background: #f6f0e4;
}
.mobile-farming-item:focus-visible,
.mobile-farming-help summary:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
.mobile-farming-state {
  padding: 20px 14px;
  border-radius: 12px;
  background: white;
  color: var(--muted);
  font-size: 14px;
}
.mobile-farming-state button {
  margin-left: 8px;
  border: 0;
  background: transparent;
  color: var(--blue);
}
@container mobile-content (min-width: 680px) {
  .mobile-farming-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}
</style>
