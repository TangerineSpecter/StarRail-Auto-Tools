<script setup lang="ts">
import WebDavSettingsPanel from "@/features/settings/WebDavSettingsPanel.vue";
import { useRuntimeContext } from "@/shared/contracts/runtime";

const { busy, error, notice } = useRuntimeContext();
</script>

<template>
  <WebDavSettingsPanel
    :busy="busy"
    @busy="busy = $event"
    @error="error = $event"
    @notice="notice = $event"
  />
</template>
