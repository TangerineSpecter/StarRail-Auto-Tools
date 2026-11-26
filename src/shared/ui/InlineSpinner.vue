<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: "xs" | "sm" | "md";
  }>(),
  { size: "sm" },
);
</script>

<template>
  <span :class="['inline-spinner', `is-${size}`]" aria-hidden="true" />
</template>

<style scoped>
.inline-spinner {
  display: inline-block;
  flex-shrink: 0;
  border-radius: 50%;
  border-style: solid;
  border-color: color-mix(in srgb, currentColor 24%, transparent);
  border-top-color: currentColor;
  animation: inline-spinner-rotate 0.72s linear infinite;
  vertical-align: middle;
}

.inline-spinner.is-xs {
  width: 11px;
  height: 11px;
  border-width: 1.5px;
}

.inline-spinner.is-sm {
  width: 13px;
  height: 13px;
  border-width: 1.8px;
}

.inline-spinner.is-md {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

@keyframes inline-spinner-rotate {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .inline-spinner {
    animation-duration: 1.8s;
  }
}
</style>
