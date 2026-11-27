<script setup lang="ts">
import { ref } from "vue";
import BuildDashboard from "@/features/build-planner/BuildDashboard.vue";
import BuildPlanDrawer from "@/features/build-planner/BuildPlanDrawer.vue";
import CombatSimulatorDrawer from "@/features/combat-simulator/CombatSimulatorDrawer.vue";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import type { CombatantInput } from "@/shared/utils/combat";

const { summary, error, notice } = useRuntimeContext();
const dashboard = ref<InstanceType<typeof BuildDashboard> | null>(null);
const buildCharacterId = ref<number | null>(null);
const simCombatant = ref<CombatantInput | null>(null);

function closeBuildPlan() {
  buildCharacterId.value = null;
}

function reloadBuildPlan() {
  buildCharacterId.value = null;
  void dashboard.value?.reload();
}
</script>

<template>
  <BuildDashboard
    ref="dashboard"
    :key="summary.lastSyncAt ?? 0"
    @edit-build="buildCharacterId = $event"
    @open-combat-sim="simCombatant = $event"
  />
  <BuildPlanDrawer
    v-if="buildCharacterId"
    :character-id="buildCharacterId"
    @close="closeBuildPlan"
    @saved="reloadBuildPlan"
    @deleted="reloadBuildPlan"
    @error="error = $event"
    @notice="notice = $event"
  />
  <CombatSimulatorDrawer
    v-if="simCombatant"
    mode="single"
    :title="`${simCombatant.name} · 伤害分析与战斗模拟`"
    :combatants="[simCombatant]"
    @close="simCombatant = null"
  />
</template>
