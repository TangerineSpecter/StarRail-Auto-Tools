<script setup lang="ts">
defineProps<{
  previewUrl: string;
  busy: boolean;
  cropBox: { left: number; top: number; width: number; height: number };
  hasSelection: boolean;
}>();
const emit = defineEmits<{
  close: [];
  start: [event: PointerEvent];
  update: [event: PointerEvent];
  end: [event: PointerEvent];
  recognize: [];
  reset: [];
}>();
const surface = defineModel<HTMLElement | null>("surface", { required: true });
</script>

<template>
  <div class="crop-backdrop" @click.self="emit('close')">
    <section class="crop-picker" aria-label="截图区域选择">
      <header class="crop-picker-header">
        <div>
          <p class="eyebrow">SELECT OCR REGION</p>
          <h2>框选识别区域</h2>
        </div>
        <button type="button" aria-label="取消截图" @click="emit('close')">×</button>
      </header>
      <p>拖拽框选遗器、光锥或角色详情。框外内容不会发送给 OCR。</p>
      <div
        :ref="(element) => (surface = element as HTMLElement | null)"
        class="crop-surface"
        @pointerdown="emit('start', $event)"
        @pointermove="emit('update', $event)"
        @pointerup="emit('end', $event)"
        @pointercancel="emit('end', $event)"
      >
        <img :src="previewUrl" alt="待框选的截图" draggable="false" />
        <span
          v-if="hasSelection"
          class="crop-box"
          :style="{
            left: `${cropBox.left}px`,
            top: `${cropBox.top}px`,
            width: `${cropBox.width}px`,
            height: `${cropBox.height}px`,
          }"
        />
        <div
          v-if="hasSelection"
          class="crop-toolbar"
          :style="{
            left: `${cropBox.left + cropBox.width + 10}px`,
            top: `${cropBox.top + cropBox.height + 10}px`,
          }"
          @pointerdown.stop
        >
          <button type="button" title="确认识别" :disabled="busy" @click="emit('recognize')">
            ✓</button
          ><button type="button" title="重新框选" @click="emit('reset')">↻</button
          ><button type="button" title="取消截图" @click="emit('close')">×</button>
        </div>
      </div>
      <footer class="crop-picker-actions">
        <span v-if="hasSelection"
          >已选择 {{ Math.round(cropBox.width) }} × {{ Math.round(cropBox.height) }} px</span
        ><span v-else>拖拽鼠标开始框选</span>
      </footer>
    </section>
  </div>
</template>
