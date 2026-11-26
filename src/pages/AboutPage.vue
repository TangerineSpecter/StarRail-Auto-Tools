<script setup lang="ts">
import AboutPanel from "@/features/about/AboutPanel.vue";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import { useAppUpdaterContext } from "@/shared/contracts/updater";

const { direct } = useRuntimeContext();
const updater = useAppUpdaterContext();
</script>

<template>
  <AboutPanel :protocol-version="direct.protocolVersion" :updater="updater" />
</template>
