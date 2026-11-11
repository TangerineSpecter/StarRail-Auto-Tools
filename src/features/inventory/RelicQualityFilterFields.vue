<script setup lang="ts">
import Select from "primevue/select";
import { computed } from "vue";
import { characterDisplayName } from "@/shared/catalogue";
import type { BuildDashboardEntry } from "@/types";
import {
  relicQualityGradeOptions,
  relicQualitySortOptions,
  type RelicQualityFilter,
} from "./relic-quality-filter";

const props = defineProps<{ plans: BuildDashboardEntry[] }>();
const filter = defineModel<RelicQualityFilter>({ required: true });
const planOptions = computed(() => [
  { label: "默认权重", value: null },
  ...props.plans.map(({ character }) => ({
    label: characterDisplayName(character),
    value: character.characterId,
  })),
]);
</script>

<template>
  <fieldset class="filter-group filter-group-wide relic-quality-filter">
    <legend>评分与排序 <em>当前页</em></legend>
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
  </fieldset>
</template>
