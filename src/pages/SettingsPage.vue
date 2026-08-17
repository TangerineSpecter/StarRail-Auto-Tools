<script setup lang="ts">
import DataSyncSettingsPanel from "@/features/settings/DataSyncSettingsPanel.vue";
import { useRuntimeContext } from "@/shared/contracts/runtime";

const { busy, error, notice } = useRuntimeContext();
</script>

<template>
  <DataSyncSettingsPanel
    :busy="busy"
    @busy="busy = $event"
    @error="error = $event"
    @notice="notice = $event"
  />
</template>
