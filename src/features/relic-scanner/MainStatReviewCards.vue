<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { relicImage } from "@/shared/catalogue";
import { slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import type { ScanReviewGroup } from "./scan-review";

const props = defineProps<{ groups: ScanReviewGroup[] }>();
const track = ref<HTMLElement>();
const active = ref(0);
let width = 0;
let observer: ResizeObserver | undefined;
function align(index: number, behavior: "instant" | "smooth" = "instant") {
  const el = track.value;
  const slide = el?.children[index] as HTMLElement | undefined;
  if (!el || !slide) return;
  const left = slide.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
  el.scrollTo({ left, behavior });
}
function syncWidth() {
  const nextWidth = track.value?.clientWidth ?? 0;
  if (nextWidth === width) return false;
  width = nextWidth;
  if (width > 0) align(active.value);
  return true;
}
function onScroll() {
  const el = track.value;
  if (!el || syncWidth() || !el.clientWidth) return;
  const slides = Array.from(el.children) as HTMLElement[];
  let nearest = 0;
  let distance = Infinity;
  slides.forEach((slide, index) => {
    const delta = Math.abs(slide.getBoundingClientRect().left - el.getBoundingClientRect().left);
    if (delta < distance) {
      nearest = index;
      distance = delta;
    }
  });
  active.value = nearest;
}
function move(delta: number) {
  const index = Math.max(0, Math.min(props.groups.length - 1, active.value + delta));
  align(
    index,
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  );
}
onMounted(() => {
  width = track.value?.clientWidth ?? 0;
  observer = new ResizeObserver(syncWidth);
  if (track.value) observer.observe(track.value);
});
onBeforeUnmount(() => observer?.disconnect());
watch(
  () => props.groups,
  async () => {
    active.value = 0;
    await nextTick();
    track.value?.scrollTo({ left: 0, behavior: "instant" });
  },
);
</script>

<template>
  <section
    class="scanner-review-cards"
    aria-label="按套装浏览待复核遗器"
    aria-roledescription="轮播"
  >
    <div class="scanner-review-paging">
      <p>{{ groups.length > 1 ? "左右滑动查看套装" : "按套装查看" }}</p>
      <div class="scanner-review-page-controls">
        <button type="button" aria-label="上一套遗器" :disabled="active === 0" @click="move(-1)">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="m14 7-5 5 5 5" />
          </svg>
        </button>
        <span aria-live="polite" aria-atomic="true">{{ active + 1 }} / {{ groups.length }}</span>
        <button
          type="button"
          aria-label="下一套遗器"
          :disabled="active >= groups.length - 1"
          @click="move(1)"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="m10 7 5 5-5 5" />
          </svg>
        </button>
      </div>
    </div>
    <div
      ref="track"
      class="scanner-review-track"
      tabindex="0"
      aria-label="套装卡片，可左右滑动"
      @scroll.passive="onScroll"
      @keydown.right.prevent="move(1)"
      @keydown.left.prevent="move(-1)"
    >
      <article
        v-for="(group, index) in groups"
        :key="group.setId"
        class="scanner-review-slide"
        :aria-label="`${group.setName}，第 ${index + 1} 套，共 ${groups.length} 套`"
        aria-roledescription="幻灯片"
      >
        <header class="scanner-review-set">
          <img
            v-if="relicImage(group.setId, group.isPlanar ? 'PlanarSphere' : 'Head')"
            :src="relicImage(group.setId, group.isPlanar ? 'PlanarSphere' : 'Head')"
            alt=""
          />
          <div>
            <h3>{{ group.setName }}</h3>
            <p>{{ group.isPlanar ? "位面饰品 · 2件套" : "隧洞遗器 · 4件套" }}</p>
          </div>
          <span
            ><b>{{ group.groupTotal }}</b> 件</span
          >
        </header>
        <div class="scanner-review-parts">
          <section v-for="part in group.parts" :key="part.slot" class="scanner-review-part">
            <h4>{{ slotLabel(part.slot) }}</h4>
            <dl>
              <div v-for="stat in part.stats" :key="stat.mainStat">
                <dt>{{ statLabel(stat.mainStat) }}</dt>
                <dd>
                  <b>{{ stat.count }}</b> 件
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.scanner-review-cards {
  min-width: 0;
}
.scanner-review-paging {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.scanner-review-paging p {
  margin: 0;
  color: #526784;
  font-size: 12px;
}
.scanner-review-page-controls {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #526784;
  font-variant-numeric: tabular-nums;
}
.scanner-review-page-controls button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--blue);
}
.scanner-review-page-controls button:disabled {
  opacity: 0.35;
}
.scanner-review-page-controls svg {
  width: 20px;
  height: 20px;
}
.scanner-review-track {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  scrollbar-color: #b6c9df transparent;
  padding-bottom: 10px;
}
.scanner-review-slide {
  box-sizing: border-box;
  flex: 0 0 calc(100% - 20px);
  min-width: 0;
  border: 1px solid #dce4ef;
  border-radius: 14px;
  background: white;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  overflow: hidden;
}
.scanner-review-slide:only-child {
  flex-basis: 100%;
}
.scanner-review-set {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  background: #f1f6fd;
}
.scanner-review-set img {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  object-fit: contain;
}
.scanner-review-set > div {
  flex: 1;
  min-width: 0;
}
.scanner-review-set h3 {
  margin: 0;
  color: var(--ink);
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.scanner-review-set p {
  margin: 3px 0 0;
  color: #526784;
  font-size: 11px;
}
.scanner-review-set > span {
  flex-shrink: 0;
  color: #526784;
  font-size: 12px;
  white-space: nowrap;
}
.scanner-review-set > span b {
  color: var(--blue);
  font-size: 18px;
}
.scanner-review-parts {
  padding: 0 14px;
}
.scanner-review-part {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid #e9eef5;
}
.scanner-review-part:last-child {
  border-bottom: 0;
}
.scanner-review-part h4 {
  margin: 0;
  color: #526784;
  font-size: 12px;
  line-height: 24px;
  font-weight: 500;
}
.scanner-review-part dl {
  margin: 0;
  display: grid;
  gap: 8px;
}
.scanner-review-part dl > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  line-height: 24px;
}
.scanner-review-part dt {
  color: var(--ink);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.scanner-review-part dd {
  flex-shrink: 0;
  margin: 0;
  color: #526784;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.scanner-review-part dd b {
  color: var(--blue);
}
.scanner-review-cards :is(button, .scanner-review-track):focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: -2px;
}
</style>
