<script setup lang="ts">
import { ref } from "vue";
import BuildDashboard from "@/features/build-planner/BuildDashboard.vue";
import BuildPlanDrawer from "@/features/build-planner/BuildPlanDrawer.vue";
import { useRuntimeContext } from "@/shared/contracts/runtime";

const { summary, error, notice } = useRuntimeContext();
const dashboard = ref<InstanceType<typeof BuildDashboard> | null>(null);
const buildCharacterId = ref<number | null>(null);

function closeBuildPlan() {
  buildCharacterId.value = null;
  void dashboard.value?.reload();
}
</script>

<template>
  <BuildDashboard
    ref="dashboard"
    :key="summary.lastSyncAt ?? 0"
    @edit-build="buildCharacterId = $event"
  />
  <BuildPlanDrawer
    v-if="buildCharacterId"
    :character-id="buildCharacterId"
    @close="closeBuildPlan"
    @deleted="closeBuildPlan"
    @error="error = $event"
    @notice="notice = $event"
  />
</template>
