<script setup lang="ts">
import BuildDashboard from "@/features/build-planner/BuildDashboard.vue";
import { useRuntimeContext } from "@/shared/contracts/runtime";

const { summary } = useRuntimeContext();
</script>

<template><BuildDashboard :key="summary.lastSyncAt ?? 0" /></template>
