<script setup lang="ts">
import Button from "primevue/button";
import type { OcrImageResult } from "@/types";

defineProps<{ result: OcrImageResult | null; busy: boolean }>();
const emit = defineEmits<{ capture: [] }>();
</script>

<template>
  <article class="panel ocr-panel">
    <div class="panel-heading compact">
      <div>
        <p class="eyebrow">SCREENSHOT RECOGNITION</p>
        <h2>截图识别</h2>
      </div>
      <span class="local-badge">本地识别</span>
    </div>
    <div v-if="result" class="ocr-output">
      <div class="output-meta">
        <span>{{ result.regions.length }} 个文本区域</span><span>{{ result.elapsedMs }} ms</span>
      </div>
      <p v-for="(region, index) in result.regions" :key="index">{{ region.text }}</p>
    </div>
    <div v-else class="empty-output">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="empty-image-icon"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
      <p>识别结果仅供核对</p>
      <small>点击下方按钮开始截图</small>
    </div>
    <Button class="capture-action-btn" :disabled="busy" @click="emit('capture')">
      <svg class="crop-icon" viewBox="0 0 24 24" width="1.2em" height="1.2em" aria-hidden="true">
        <path
          d="M4 9V4h5v2H6v3H4Zm11-5h5v5h-2V6h-3V4ZM6 15v3h3v2H4v-5h2Zm12 0h2v5h-5v-2h3v-3Z"
          fill="currentColor"
        />
      </svg>
      <span>{{ busy ? "正在截图 / 识别" : "截图并框选" }}</span>
    </Button>
  </article>
</template>
