<script setup lang="ts">
import DirectReadPanel from "@/features/capture/DirectReadPanel.vue";
import DirectReadLogPanel from "@/features/capture/DirectReadLogPanel.vue";
import { useDirectRead } from "@/features/capture/useDirectRead";
import InventorySyncPanel from "@/features/inventory/InventorySyncPanel.vue";
import { useRuntimeContext } from "@/shared/contracts/runtime";

defineOptions({ name: "CapturePage" });
const { direct, summary, busy, error, notice } = useRuntimeContext();
const feedback = {
  busy,
  setError: (message: string) => (error.value = message),
  setNotice: (message: string) => (notice.value = message),
};
const directRead = useDirectRead({ ...feedback, direct, summary });
</script>

<template>
  <section class="capture-workspace">
    <DirectReadPanel
      :direct="direct"
      :busy="busy"
      :running="directRead.running.value"
      @toggle="directRead.toggle"
      @switch-account="directRead.switchAccount"
    />
    <div class="capture-side">
      <InventorySyncPanel
        :summary="summary"
        :busy="busy"
        @busy="busy = $event"
        @error="error = $event"
        @notice="notice = $event"
      />
      <DirectReadLogPanel :direct="direct" :running="directRead.running.value" />
    </div>
  </section>
</template>
