<script setup lang="ts">
import LoadingState from "./LoadingState.vue";
</script>

<template>
  <section class="async-view-loading panel" aria-busy="true">
    <LoadingState variant="page" label="正在载入模块…" hint="准备界面与本地数据索引" />
  </section>
</template>

<style scoped>
.async-view-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  height: 100%;
  width: 100%;
}
</style>
