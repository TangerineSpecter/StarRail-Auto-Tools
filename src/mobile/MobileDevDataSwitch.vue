<script setup lang="ts">
import { demoEnabled, mobileDemoStorageKey } from "@/shared/dev/mobile-mock";
const demo = demoEnabled(localStorage);
function toggle() {
  localStorage.setItem(mobileDemoStorageKey, demo ? "real" : "demo");
  location.reload();
}
</script>
<template>
  <button class="mobile-dev-data-switch" type="button" :aria-pressed="demo" @click="toggle">
    {{ demo ? "示例数据" : "真实数据" }}<small>点击切换</small>
  </button>
</template>
<style scoped>
.mobile-dev-data-switch {
  display: grid;
  gap: 2px;
  min-height: 44px;
  padding: 4px 8px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  color: var(--muted);
  background: transparent;
  font-size: 12px;
}
.mobile-dev-data-switch small {
  font-size: 10px;
}
</style>
