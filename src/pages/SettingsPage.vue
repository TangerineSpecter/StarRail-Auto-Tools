<script setup lang="ts">
import { ref } from "vue";
import DataSyncSettingsPanel from "@/features/settings/DataSyncSettingsPanel.vue";
import McpSettingsPanel from "@/features/mcp/McpSettingsPanel.vue";
import { useRuntimeContext } from "@/shared/contracts/runtime";

const { busy, error, notice } = useRuntimeContext();
const section = ref<"sync" | "mcp">("sync");
</script>

<template>
  <div class="settings-page">
    <nav class="settings-sections" aria-label="软件设置分区">
      <button
        type="button"
        class="settings-section"
        :class="{ active: section === 'sync' }"
        :disabled="busy"
        :aria-pressed="section === 'sync'"
        @click="section = 'sync'"
      >
        数据同步站
      </button>
      <button
        type="button"
        class="settings-section"
        :class="{ active: section === 'mcp' }"
        :disabled="busy"
        :aria-pressed="section === 'mcp'"
        @click="section = 'mcp'"
      >
        MCP 管理
      </button>
    </nav>
    <DataSyncSettingsPanel
      v-if="section === 'sync'"
      :busy="busy"
      @busy="busy = $event"
      @error="error = $event"
      @notice="notice = $event"
    />
    <McpSettingsPanel
      v-else
      :busy="busy"
      @busy="busy = $event"
      @error="error = $event"
      @notice="notice = $event"
    />
  </div>
</template>

<style scoped>
.settings-page {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  height: 100%;
}
.settings-sections {
  display: flex;
  gap: 8px;
  padding: 16px clamp(32px, 5vw, 86px) 0;
}
.settings-section {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(41, 76, 120, 0.2);
  border-radius: 3px;
  color: #344a68;
  background: #fff;
  font: 700 12px/1 var(--font-ui);
  letter-spacing: 0.04em;
}
.settings-section.active {
  border-color: #173d7a;
  color: #fff;
  background: #173d7a;
}
.settings-section:disabled {
  cursor: wait;
  opacity: 0.55;
}
@media (max-width: 680px) {
  .settings-sections {
    padding: 16px 20px 0;
  }
}
</style>
