<script setup lang="ts">
import DirectReadPanel from "@/features/capture/DirectReadPanel.vue";
import OcrPanel from "@/features/capture/OcrPanel.vue";
import ScreenshotCropOverlay from "@/features/capture/ScreenshotCropOverlay.vue";
import { useDirectRead } from "@/features/capture/useDirectRead";
import { useScreenshotCrop } from "@/features/capture/useScreenshotCrop";
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
const crop = useScreenshotCrop(feedback);
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
      <OcrPanel :result="crop.ocrResult.value" :busy="busy" @capture="crop.runOcrScreenshot" />
    </div>
  </section>
  <ScreenshotCropOverlay
    v-if="crop.screenshotPreviewUrl.value"
    v-model:surface="crop.cropSurface.value"
    :preview-url="crop.screenshotPreviewUrl.value"
    :busy="busy"
    :crop-box="crop.cropBox.value"
    :has-selection="crop.hasCropSelection.value"
    @close="crop.closeCropPicker()"
    @start="crop.startCropSelection"
    @update="crop.updateCropSelection"
    @end="crop.endCropSelection"
    @recognize="crop.recognizeCrop"
    @reset="crop.resetCropSelection"
  />
</template>
