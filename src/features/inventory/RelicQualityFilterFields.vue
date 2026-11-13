<script setup lang="ts">
import Select from "primevue/select";
import { computed } from "vue";
import { useMobileView } from "@/shared/contracts/mobile-view";
import MobileSegmentedControl from "@/shared/ui/MobileSegmentedControl.vue";
import { characterDisplayName } from "@/shared/catalogue";
import type { BuildDashboardEntry } from "@/types";
import {
  relicQualityGradeOptions,
  relicQualitySortOptions,
  type RelicQualityFilter,
} from "./relic-quality-filter";

const mobile = useMobileView();
const props = defineProps<{ plans: BuildDashboardEntry[] }>();
const filter = defineModel<RelicQualityFilter>({ required: true });
const planOptions = computed(() => [
  { label: "默认权重", value: null },
  ...props.plans.map(({ character }) => ({
    label: characterDisplayName(character),
    value: character.characterId,
  })),
]);
const mobileSortOptions = [
  { label: "默认", value: "default" },
  { label: "评分高优先", value: "score-desc" },
  { label: "评分低优先", value: "score-asc" },
] as const;
</script>

<template>
  <fieldset class="filter-group filter-group-wide relic-quality-filter">
    <legend>评分与排序 <em>当前页</em></legend>
    <div v-if="mobile" class="mobile-filter-card relic-quality-mobile-card">
      <div class="mobile-filter-row mobile-filter-row-stack">
        <span class="mobile-filter-row-label">排序</span>
        <MobileSegmentedControl
          v-model="filter.sortMode"
          :options="mobileSortOptions"
          aria-label="排序"
        />
      </div>
      <label class="mobile-filter-row mobile-filter-select-row">
        <span class="mobile-filter-row-label">评分方案</span>
        <Select
          v-model="filter.characterId"
          :options="planOptions"
          option-label="label"
          option-value="value"
          aria-label="评分方案"
          placeholder="默认权重"
        />
      </label>
      <label class="mobile-filter-row mobile-filter-select-row">
        <span class="mobile-filter-row-label">最低等级</span>
        <Select
          v-model="filter.minGrade"
          :options="relicQualityGradeOptions"
          option-label="label"
          option-value="value"
          aria-label="最低字母等级"
          placeholder="不限等级"
        />
      </label>
    </div>
    <template v-else>
      <div class="relic-quality-filter-fields">
        <label>
          <span>排序</span>
          <Select
            v-model="filter.sortMode"
            :options="relicQualitySortOptions"
            option-label="label"
            option-value="value"
            aria-label="排序"
          />
        </label>
        <label>
          <span>评分方案</span>
          <Select
            v-model="filter.characterId"
            :options="planOptions"
            option-label="label"
            option-value="value"
            aria-label="评分方案"
            placeholder="默认权重"
          />
        </label>
        <label>
          <span>最低字母等级</span>
          <Select
            v-model="filter.minGrade"
            :options="relicQualityGradeOptions"
            option-label="label"
            option-value="value"
            aria-label="最低字母等级"
            placeholder="不限等级"
          />
        </label>
      </div>
      <p class="relic-quality-filter-hint">评分排序与等级筛选仅作用于当前页。</p>
    </template>
  </fieldset>
</template>
