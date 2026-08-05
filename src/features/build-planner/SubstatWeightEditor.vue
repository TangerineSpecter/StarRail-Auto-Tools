<script setup lang="ts">
import { computed } from "vue";
import { statLabel } from "@/shared/catalogue/relic-options";
import {
  SUBSTAT_KEYS,
  WEIGHT_ROLE_LABELS,
  WEIGHT_STEPS,
  roleWeights,
  type WeightRole,
} from "@/shared/utils/relic-score";

const weights = defineModel<Record<string, number>>({ required: true });
const minPotentialPct = defineModel<number>("minPotentialPct", { required: true });
const spdTarget = defineModel<number>("spdTarget", { required: true });

const roleOptions = (Object.keys(WEIGHT_ROLE_LABELS) as WeightRole[]).map((value) => ({
  value,
  label: WEIGHT_ROLE_LABELS[value],
}));

const selectedRole = computed({
  get: () => "" as string,
  set: (role: string) => {
    if (!role) return;
    weights.value = { ...roleWeights(role as WeightRole) };
  },
});

function setWeight(stat: string, raw: string) {
  const value = Number(raw);
  weights.value = { ...weights.value, [stat]: Number.isFinite(value) ? value : 0 };
}
</script>

<template>
  <div class="weight-editor">
    <div class="weight-editor-toolbar">
      <label>
        <span>角色模板</span>
        <select :value="selectedRole" @change="selectedRole = ($event.target as HTMLSelectElement).value">
          <option value="">套用默认权重…</option>
          <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <label>
        <span>质量门槛 (潜力%)</span>
        <input
          :value="minPotentialPct"
          type="number"
          min="0"
          max="100"
          step="5"
          @input="
            minPotentialPct = Number(($event.target as HTMLInputElement).value) || 0
          "
        />
      </label>
      <label>
        <span>速度断点目标</span>
        <input
          :value="spdTarget"
          type="number"
          min="0"
          max="300"
          step="1"
          @input="spdTarget = Number(($event.target as HTMLInputElement).value) || 0"
        />
      </label>
    </div>
    <p class="weight-editor-hint">
      权重用于词条质量评分与预计刷本成本，<strong>不是</strong>战斗伤害。步进 0.25；小攻击 /
      生命 / 防御按对应百分比权重的 40% 计。
    </p>
    <div class="weight-grid">
      <label v-for="stat in SUBSTAT_KEYS" :key="stat" class="weight-row">
        <span>{{ statLabel(stat) }}</span>
        <select
          :value="weights[stat] ?? 0"
          @change="setWeight(stat, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="step in WEIGHT_STEPS" :key="step" :value="step">
            {{ step.toFixed(2) }}
          </option>
        </select>
      </label>
    </div>
  </div>
</template>
