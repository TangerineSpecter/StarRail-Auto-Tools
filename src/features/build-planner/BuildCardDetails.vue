<script setup lang="ts">
import Drawer from "primevue/drawer";
import { useMobileView } from "@/shared/contracts/mobile-view";

defineProps<{ title: string }>();
const visible = defineModel<boolean>({ required: true });
const mobile = useMobileView();
</script>

<template>
  <Drawer
    v-if="mobile"
    v-model:visible="visible"
    position="bottom"
    block-scroll
    class="mobile-build-detail-sheet"
    :show-close-icon="false"
    :aria-label="`${title}培养详情`"
  >
    <template #header>
      <div class="mobile-build-detail-heading">
        <div>
          <h2>{{ title }}</h2>
          <p>装备 · 目标 · 词条潜力</p>
        </div>
        <button type="button" aria-label="关闭培养详情" @click.stop="visible = false">关闭</button>
      </div>
    </template>
    <slot />
  </Drawer>
  <slot v-else />
</template>

<style>
html.mobile-view .mobile-build-detail-sheet.p-drawer {
  --build-sheet-outer: max(0px, calc((100vw - 760px) / 2));
  width: min(760px, 100vw);
  max-width: 100vw;
  height: min(800px, 88dvh);
  max-height: calc(100dvh - env(safe-area-inset-top) - 12px);
  padding: 0 0 env(safe-area-inset-bottom);
  border: 0;
  border-radius: 20px 20px 0 0;
  background: white;
  box-shadow: 0 -12px 40px rgba(30, 49, 79, 0.16);
  overflow: hidden;
}
html.mobile-view .mobile-build-detail-sheet::before {
  content: "";
  position: absolute;
  top: 8px;
  left: 50%;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: #cbd3dc;
  transform: translateX(-50%);
}
html.mobile-view .mobile-build-detail-sheet .p-drawer-header {
  padding: 24px max(16px, calc(env(safe-area-inset-right) - var(--build-sheet-outer))) 16px
    max(16px, calc(env(safe-area-inset-left) - var(--build-sheet-outer)));
  border-bottom: 1px solid #e4eaf1;
}
.mobile-build-detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-width: 0;
}
.mobile-build-detail-heading h2 {
  margin: 0;
  color: var(--ink);
  font-size: 18px;
  overflow-wrap: anywhere;
}
.mobile-build-detail-heading p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 12px;
}
.mobile-build-detail-heading button {
  flex-shrink: 0;
  min-width: 44px;
  min-height: 44px;
  padding: 8px;
  border: 0;
  border-radius: 8px;
  color: var(--blue);
  background: #edf3fa;
  font-size: 14px;
}
.mobile-build-detail-heading button:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
html.mobile-view .mobile-build-detail-sheet .p-drawer-content {
  min-width: 0;
  min-height: 0;
  padding: 16px;
  overflow-x: hidden;
  overscroll-behavior: contain;
}
html.mobile-view .mobile-build-detail-sheet :is(.build-card-body, .build-card-main) {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: auto;
  gap: 16px;
  padding: 0;
  background: none;
}
html.mobile-view .mobile-build-detail-sheet .build-card-equipment {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}
html.mobile-view .mobile-build-detail-sheet .build-card-radar-panel {
  min-width: 0;
  width: 100%;
  height: auto;
  padding: 0;
  border: 0;
  background: none;
}
html.mobile-view .mobile-build-detail-sheet .section-title {
  margin: 0 0 10px;
  font-size: 13px;
  color: #526071;
}
html.mobile-view .mobile-build-detail-sheet .target-progress-row {
  grid-template-columns: minmax(0, 1fr) 40px;
  gap: 6px 10px;
}
html.mobile-view .mobile-build-detail-sheet .target-progress-label {
  grid-column: 1 / -1;
  flex-wrap: wrap;
  font-size: 12px;
}
html.mobile-view .mobile-build-detail-sheet .equipped-light-cone b {
  font-size: 14px;
}
html.mobile-view
  .mobile-build-detail-sheet
  :is(.quality-label, .quality-count, .recommended-set p, .affix-tags) {
  font-size: 12px;
}
@media (min-width: 640px) {
  html.mobile-view .mobile-build-detail-sheet .build-card-body {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(200px, 0.7fr);
    align-items: start;
  }
}
html.mobile-view:is([data-content-fold="book"], [data-content-fold="tabletop"])
  .mobile-build-detail-sheet.p-drawer {
  position: fixed;
  left: var(--content-sheet-left);
  top: auto;
  bottom: calc(100dvh - var(--content-sheet-top) - var(--content-sheet-height));
  width: var(--content-sheet-width);
  max-width: var(--content-sheet-width);
  height: min(800px, 88dvh, var(--content-sheet-height));
  max-height: var(--content-sheet-height);
}
html.mobile-view[data-content-fold="book"] .mobile-build-detail-sheet .build-card-body {
  display: flex;
}
@media (prefers-reduced-motion: reduce) {
  html.mobile-view .mobile-build-detail-sheet.p-drawer {
    animation: none !important;
    transition: none !important;
  }
  html.mobile-view .mobile-build-detail-sheet * {
    animation: none !important;
    transition: none !important;
  }
}
</style>
