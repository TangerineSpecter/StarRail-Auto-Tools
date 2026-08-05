<script setup lang="ts">
import { computed, ref, watch } from "vue";
import InputNumber from "primevue/inputnumber";
import Select from "primevue/select";
import { statLabel } from "@/shared/catalogue/relic-options";
import {
  DEFAULT_ROLE_WEIGHTS,
  SUBSTAT_KEYS,
  WEIGHT_ROLE_HINTS,
  WEIGHT_ROLE_LABELS,
  WEIGHT_ROLE_ORDER,
  resolvePlanWeights,
  roleWeights,
  type WeightRole,
} from "@/shared/utils/relic-score";

const weights = defineModel<Record<string, number>>({ required: true });
const minPotentialPct = defineModel<number>("minPotentialPct", { required: true });
const spdTarget = defineModel<number>("spdTarget", { required: true });

const props = withDefaults(
  defineProps<{
    /** Used only when stored weights are empty (display + materialize on edit). */
    effectiveSubstats?: string[];
  }>(),
  { effectiveSubstats: () => [] },
);

const roleOptions = WEIGHT_ROLE_ORDER.map((value) => ({
  value,
  label: WEIGHT_ROLE_LABELS[value],
}));

/** Currently selected template; null = custom / not matching any preset. */
const selectedRole = ref<WeightRole | null>(null);
/** Skip clearing role while we are applying a template ourselves. */
let applyingTemplate = false;

const hasStoredWeights = computed(() => Object.keys(weights.value ?? {}).length > 0);

/**
 * Weights shown in the grid. Empty stored map → same inference as Stat Score (display only).
 * Materialized into `weights` only when the user applies a template or edits a value.
 */
const displayWeights = computed(() => {
  if (hasStoredWeights.value) return weights.value;
  return resolvePlanWeights({
    substatWeights: {},
    effectiveSubstats: props.effectiveSubstats,
  });
});

const showingInferred = computed(() => !hasStoredWeights.value);

function weightsMatchRole(role: WeightRole, current: Record<string, number>): boolean {
  const preset = DEFAULT_ROLE_WEIGHTS[role];
  for (const key of SUBSTAT_KEYS) {
    const expected = preset[key] ?? 0;
    const actual = current[key] ?? 0;
    if (Math.abs(expected - actual) > 1e-9) return false;
  }
  return true;
}

function detectRole(current: Record<string, number>): WeightRole | null {
  for (const role of Object.keys(DEFAULT_ROLE_WEIGHTS) as WeightRole[]) {
    if (weightsMatchRole(role, current)) return role;
  }
  return null;
}

watch(
  displayWeights,
  (current) => {
    if (applyingTemplate) return;
    selectedRole.value = detectRole(current ?? {});
  },
  { deep: true, immediate: true },
);

function materializeIfNeeded() {
  if (hasStoredWeights.value) return;
  weights.value = {
    ...resolvePlanWeights({
      substatWeights: {},
      effectiveSubstats: props.effectiveSubstats,
    }),
  };
}

function applyRole(role: WeightRole | null) {
  selectedRole.value = role;
  if (!role) return;
  applyingTemplate = true;
  weights.value = { ...roleWeights(role) };
  queueMicrotask(() => {
    applyingTemplate = false;
  });
}

/** Clamp to [0, 1]; allow free decimals (not locked to 0.25). */
function setWeight(stat: string, value: number | null) {
  materializeIfNeeded();
  let next = value ?? 0;
  if (!Number.isFinite(next)) next = 0;
  next = Math.min(1, Math.max(0, next));
  next = Math.round(next * 1000) / 1000;
  weights.value = { ...weights.value, [stat]: next };
}

const roleSelectModel = computed({
  get: () => selectedRole.value,
  set: (role: WeightRole | null) => applyRole(role),
});

const roleHints = WEIGHT_ROLE_HINTS;
</script>

<template>
  <div class="weight-editor">
    <div class="weight-editor-toolbar">
      <label class="weight-field">
        <span>角色模板</span>
        <Select
          v-model="roleSelectModel"
          class="weight-control"
          :options="roleOptions"
          option-label="label"
          option-value="value"
          placeholder="自定义权重"
          show-clear
          aria-label="角色模板"
        />
      </label>
      <label class="weight-field">
        <span>质量门槛 (潜力%)</span>
        <InputNumber
          v-model="minPotentialPct"
          class="weight-control"
          :min="0"
          :max="100"
          :step="5"
          show-buttons
          aria-label="质量门槛"
        />
      </label>
      <label class="weight-field">
        <span>速度断点目标</span>
        <InputNumber
          v-model="spdTarget"
          class="weight-control"
          :min="0"
          :max="300"
          :step="1"
          show-buttons
          aria-label="速度断点目标"
        />
      </label>
    </div>
    <p class="weight-editor-hint">
      权重用于词条质量、字母评级与预计刷本成本，<strong>不是</strong>战斗伤害。范围
      <strong>0～1</strong>，可直接输入。角色模板是按常见配队<strong>定位预设</strong>（非官方角色表）；「生命倍率输出」指技能公式吃生命面板。纯输出模板默认<strong>不计效果抵抗</strong>，避免死词条抬分。小攻/小生/小防按对应 % 权重的
      40% 计。手动改动后模板会变为「自定义权重」。改完后需保存。
    </p>
    <p v-if="showingInferred" class="weight-editor-hint weight-editor-role-hint">
      当前方案<strong>尚未保存词条权重</strong>。下方为与评分相同的<strong>推断结果（仅展示）</strong>；直接点保存不会写入权重。选择角色模板或改动任意数值后才会写入方案并在保存时持久化。
    </p>
    <p v-else-if="selectedRole" class="weight-editor-hint weight-editor-role-hint">
      {{ roleHints[selectedRole] }}
    </p>
    <div class="weight-grid">
      <label v-for="stat in SUBSTAT_KEYS" :key="stat" class="weight-row">
        <span>{{ statLabel(stat) }}</span>
        <InputNumber
          class="weight-step-input"
          :model-value="displayWeights[stat] ?? 0"
          :min="0"
          :max="1"
          :step="0.05"
          :min-fraction-digits="0"
          :max-fraction-digits="3"
          show-buttons
          :aria-label="`${statLabel(stat)} 权重`"
          @update:model-value="setWeight(stat, $event)"
        />
      </label>
    </div>
  </div>
</template>
