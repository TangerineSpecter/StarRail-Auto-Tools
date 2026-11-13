<script setup lang="ts">
import { computed, onDeactivated, ref, watch } from "vue";
import Drawer from "primevue/drawer";
import { slotLabel } from "@/shared/catalogue/relic-options";
import { useSheetDragDismiss } from "@/shared/ui/useSheetDragDismiss";
import { emptyScanReviewFilters, type ScanReviewFilters } from "./scan-review";

const props = defineProps<{
  filters: ScanReviewFilters;
  total: number;
  cavernCount: number;
  planarCount: number;
  disabled: boolean;
}>();
const emit = defineEmits<{ apply: [filters: ScanReviewFilters] }>();
const visible = ref(false);
const draft = ref(emptyScanReviewFilters());
const sheetDrag = useSheetDragDismiss(() => {
  visible.value = false;
});
watch(visible, (open) => {
  if (!open) sheetDrag.reset();
});
const count = computed(
  () =>
    [
      props.filters.category !== "all",
      props.filters.slot !== "all",
      !!props.filters.search.trim(),
    ].filter(Boolean).length,
);
const slots = ["Body", "Feet", "PlanarSphere", "LinkRope", "Head", "Hands"];
function open() {
  draft.value = { ...props.filters };
  visible.value = true;
}
function apply() {
  emit("apply", { ...draft.value, search: draft.value.search.trim() });
  visible.value = false;
}
onDeactivated(() => (visible.value = false));
</script>

<template>
  <button
    type="button"
    class="scanner-filter-button"
    :class="{ 'is-active': count > 0 }"
    :disabled="disabled"
    :aria-label="count ? `筛选分析结果，已选 ${count} 项条件` : '筛选分析结果'"
    aria-haspopup="dialog"
    :aria-expanded="visible"
    @click="open"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="2" fill="white" />
      <circle cx="15" cy="17" r="2" fill="white" />
    </svg>
    <span v-if="count" class="scanner-filter-count">{{ count }}</span>
  </button>
  <Drawer
    v-model:visible="visible"
    position="bottom"
    block-scroll
    class="scanner-filter-sheet"
    :show-close-icon="false"
    aria-label="分析筛选条件"
  >
    <template #header>
      <div class="scanner-filter-heading" v-on="sheetDrag.handlers">
        <h2>筛选条件</h2>
      </div>
    </template>
    <form id="scanner-filter-form" class="scanner-filter-fields" @submit.prevent="apply">
      <label class="scanner-filter-search">
        <span>套装名称</span>
        <input v-model="draft.search" type="search" placeholder="搜索套装" enterkeyhint="done" />
      </label>
      <fieldset>
        <legend>遗器类型</legend>
        <div class="scanner-filter-options">
          <button
            v-for="option in [
              { key: 'all', label: '全部', count: total },
              { key: 'cavern', label: '隧洞遗器', count: cavernCount },
              { key: 'planar', label: '位面饰品', count: planarCount },
            ]"
            :key="option.key"
            type="button"
            :aria-pressed="draft.category === option.key"
            @click="draft.category = option.key"
          >
            {{ option.label }} <small>{{ option.count }}</small>
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>部位</legend>
        <div class="scanner-filter-options">
          <button type="button" :aria-pressed="draft.slot === 'all'" @click="draft.slot = 'all'">
            所有部位
          </button>
          <button
            v-for="slot in slots"
            :key="slot"
            type="button"
            :aria-pressed="draft.slot === slot"
            @click="draft.slot = slot"
          >
            {{ slotLabel(slot) }}
          </button>
        </div>
      </fieldset>
    </form>
    <template #footer>
      <div class="scanner-filter-actions">
        <button type="button" @click="draft = emptyScanReviewFilters()">重置全部</button>
        <button type="submit" form="scanner-filter-form">查看结果</button>
      </div>
    </template>
  </Drawer>
</template>

<style scoped>
.scanner-filter-button {
  position: relative;
  flex: 0 0 46px;
  width: 46px;
  height: 46px;
  padding: 12px;
  border: 1px solid #dce4ef;
  border-radius: 12px;
  background: white;
  color: var(--ink);
}
.scanner-filter-button svg {
  width: 100%;
  height: 100%;
}
.scanner-filter-button.is-active {
  color: var(--blue);
  border-color: var(--blue);
}
.scanner-filter-button:disabled {
  opacity: 0.45;
}
.scanner-filter-count {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  padding: 2px 4px;
  border-radius: 9px;
  background: var(--blue);
  color: white;
  font-size: 10px;
}
</style>

<style>
html.mobile-view .scanner-filter-sheet.p-drawer {
  width: min(760px, 100vw);
  max-width: 100vw;
  height: min(620px, 88dvh);
  max-height: calc(100dvh - env(safe-area-inset-top) - 12px);
  padding-bottom: env(safe-area-inset-bottom);
  border: 0;
  border-radius: 20px 20px 0 0;
  background: white;
}
.scanner-filter-sheet::before {
  content: "";
  position: absolute;
  top: 8px;
  left: calc(50% - 18px);
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: #cbd3dc;
}
html.mobile-view .scanner-filter-sheet .p-drawer-header {
  padding: 20px max(16px, calc(env(safe-area-inset-right) - max(0px, (100vw - 760px) / 2))) 12px
    16px;
  border-bottom: 1px solid #e4eaf1;
}
.scanner-filter-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
  touch-action: none;
}
.scanner-filter-heading h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--ink);
}
html.mobile-view .scanner-filter-sheet .p-drawer-content {
  padding: 20px 16px;
  overscroll-behavior: contain;
}
.scanner-filter-fields {
  display: grid;
  gap: 24px;
}
.scanner-filter-fields fieldset {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.scanner-filter-fields legend,
.scanner-filter-search > span {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.scanner-filter-search {
  display: grid;
}
.scanner-filter-search input {
  width: 100%;
  min-height: 46px;
  padding: 10px 12px;
  border: 1px solid #dce4ef;
  border-radius: 8px;
  font-size: 16px;
  color: var(--ink);
  background: white;
}
.scanner-filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.scanner-filter-options button {
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid #dce4ef;
  border-radius: 8px;
  color: #526784;
  background: white;
  font-size: 14px;
}
.scanner-filter-options button[aria-pressed="true"] {
  color: var(--blue);
  border-color: var(--blue);
  background: #edf4ff;
}
.scanner-filter-options small {
  margin-left: 4px;
  font-size: 12px;
}
html.mobile-view .scanner-filter-sheet .p-drawer-footer {
  padding: 12px 16px 16px;
  border-top: 1px solid #e4eaf1;
}
.scanner-filter-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
}
.scanner-filter-actions button {
  min-height: 46px;
  padding: 10px;
  border: 1px solid #dce4ef;
  border-radius: 8px;
  color: #526784;
  background: white;
  font-size: 14px;
}
.scanner-filter-actions button[type="submit"] {
  background: var(--blue);
  border-color: var(--blue);
  color: white;
}
.scanner-filter-sheet :is(button, input):focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
html.mobile-view:is([data-content-fold="book"], [data-content-fold="tabletop"])
  .scanner-filter-sheet.p-drawer {
  left: var(--content-sheet-left);
  top: auto;
  bottom: calc(100dvh - var(--content-sheet-top) - var(--content-sheet-height));
  width: var(--content-sheet-width);
  max-width: var(--content-sheet-width);
  height: min(620px, 88dvh, var(--content-sheet-height));
  max-height: var(--content-sheet-height);
}
@media (prefers-reduced-motion: reduce) {
  html.mobile-view .scanner-filter-sheet.p-drawer {
    animation: none !important;
    transition: none !important;
  }
}
</style>
