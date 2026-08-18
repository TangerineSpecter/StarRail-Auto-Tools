<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from "vue";

const props = defineProps<{
  title: string;
  text: string;
}>();

const hostRef = ref<HTMLElement | null>(null);
const cardRef = ref<HTMLElement | null>(null);
const open = ref(false);
const placeAbove = ref(true);
const top = ref(0);
const left = ref(0);
const tipId = useId();

const TIP_WIDTH = 280;
const GAP = 8;

async function show() {
  const trigger = hostRef.value;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  left.value = Math.max(12, Math.min(rect.left, window.innerWidth - TIP_WIDTH - 12));
  const spaceBelow = window.innerHeight - rect.bottom - GAP;
  const spaceAbove = rect.top - GAP;
  const preferredBelowHeight = 128;
  placeAbove.value = spaceBelow < preferredBelowHeight && spaceAbove > spaceBelow;
  top.value = placeAbove.value ? rect.top - GAP : rect.bottom + GAP;
  open.value = true;
  await nextTick();
  const card = cardRef.value;
  if (!card || !open.value) return;
  const height = card.getBoundingClientRect().height;
  if (placeAbove.value) {
    const minBottom = 12 + height;
    if (top.value < minBottom) top.value = minBottom;
  } else {
    const maxTop = window.innerHeight - height - 12;
    if (top.value > maxTop) top.value = Math.max(12, maxTop);
  }
}

function hide() {
  open.value = false;
}

function onViewportChange() {
  if (open.value) hide();
}

onMounted(() => {
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange);
});

onBeforeUnmount(() => {
  hide();
  window.removeEventListener("scroll", onViewportChange, true);
  window.removeEventListener("resize", onViewportChange);
});
</script>

<template>
  <div
    ref="hostRef"
    class="build-hover-tip-host"
    :aria-describedby="tipId"
    @mouseenter="show"
    @mouseleave="hide"
  >
    <slot />
    <span :id="tipId" class="build-hover-tip-sr">{{ props.title }}：{{ props.text }}</span>
  </div>
  <Teleport to="body">
    <div
      v-if="open"
      ref="cardRef"
      class="build-hover-tip"
      :class="{ 'place-above': placeAbove }"
      role="tooltip"
      :aria-hidden="true"
      :style="{ top: `${top}px`, left: `${left}px` }"
    >
      <p class="build-hover-tip-title">{{ props.title }}</p>
      <p class="build-hover-tip-body">{{ props.text }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.build-hover-tip-host {
  position: relative;
  cursor: help;
}
.build-hover-tip-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
<style>
/* Teleported card sits on body; keep a feature-prefixed global rule. */
.build-hover-tip {
  position: fixed;
  z-index: 1200;
  width: min(280px, calc(100vw - 24px));
  padding: 10px 12px;
  border: 1px solid rgba(53, 110, 174, 0.22);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow:
    0 14px 28px rgba(36, 86, 166, 0.16),
    0 2px 8px rgba(36, 86, 166, 0.08);
  color: #334d6e;
  pointer-events: none;
}
.build-hover-tip.place-above {
  transform: translateY(-100%);
}
.build-hover-tip-title {
  margin: 0 0 6px;
  color: #356eae;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.build-hover-tip-body {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.55;
}
</style>
