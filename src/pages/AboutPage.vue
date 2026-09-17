<script setup lang="ts">
import AboutPanel from "@/features/about/AboutPanel.vue";
import { useRuntimeContext } from "@/shared/contracts/runtime";

const { direct } = useRuntimeContext();
</script>

<template><AboutPanel :protocol-version="direct.protocolVersion" /></template>
