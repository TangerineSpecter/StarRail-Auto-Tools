<script setup lang="ts">
import { computed } from "vue";
import type { CharacterDetailData } from "./detail-types";

const props = defineProps<{
  detail: CharacterDetailData;
  reason: string;
}>();

const charMaxed = computed(() => props.detail.level >= 80);

const hasCone = computed(() => Boolean(props.detail.equippedLightCone));

const lightConeName = computed(() => props.detail.equippedLightCone?.name || "未装备光锥");

const coneMaxed = computed(() => {
  const cone = props.detail.equippedLightCone;
  return Boolean(cone && cone.level >= 80);
});
</script>

<template>
  <div class="standing-stat-unavailable-box" role="region" aria-label="站街属性未就绪提示">
    <!-- Reason Row -->
    <div class="unavailable-reason-row">
      <div class="reason-badge">
        <span class="reason-dot"></span>
        <span>数据待补全</span>
      </div>
      <p class="reason-text">{{ reason }}</p>
    </div>

    <!-- Compact Inline Tags (3 Tags) -->
    <div class="unavailable-tags-row">
      <!-- Tag 1: 角色 80 级 -->
      <div :class="['inline-status-tag', charMaxed ? 'is-met' : 'is-unmet']">
        <span class="tag-icon">{{ charMaxed ? "✓" : "✕" }}</span>
        <span class="tag-label">角色 80 级</span>
        <span class="tag-pill">{{ charMaxed ? "已达标" : "未达标" }}</span>
      </div>

      <!-- Tag 2: 装备光锥 -->
      <div :class="['inline-status-tag', hasCone ? 'is-met' : 'is-unmet']">
        <span class="tag-icon">{{ hasCone ? "✓" : "✕" }}</span>
        <span class="tag-label"> 装备光锥 {{ hasCone ? `(${lightConeName})` : "" }} </span>
        <span class="tag-pill">{{ hasCone ? "已装备" : "未装备" }}</span>
      </div>

      <!-- Tag 3: 光锥 80 级 -->
      <div :class="['inline-status-tag', coneMaxed ? 'is-met' : 'is-unmet']">
        <span class="tag-icon">{{ coneMaxed ? "✓" : "✕" }}</span>
        <span class="tag-label">光锥 80 级</span>
        <span class="tag-pill">{{ coneMaxed ? "已达标" : "未达标" }}</span>
      </div>
    </div>
  </div>
</template>
