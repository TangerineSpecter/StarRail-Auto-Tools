<script setup lang="ts">
import { useMobileView } from "@/shared/contracts/mobile-view";
withDefaults(defineProps<{ title: string; summary?: string }>(), { summary: "" });
const mobile = useMobileView();
</script>
<template>
  <details v-if="mobile" class="mobile-disclosure">
    <summary>
      <span>{{ title }}</span
      ><small v-if="summary">{{ summary }}</small>
      <span class="mobile-disclosure-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div class="mobile-disclosure-body"><slot /></div>
  </details>
  <slot v-else />
</template>
