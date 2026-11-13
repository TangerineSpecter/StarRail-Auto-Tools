<script setup lang="ts">
import { watch } from "vue";
import Drawer from "primevue/drawer";
import { useMobileView } from "@/shared/contracts/mobile-view";
import { useSheetDragDismiss } from "@/shared/ui/useSheetDragDismiss";

defineProps<{
  title: string;
  avatar?: string | null;
  summary?: string;
  completionPct?: string;
  completionClass?: string;
  canEdit?: boolean;
}>();
const emit = defineEmits<{ edit: [] }>();
const visible = defineModel<boolean>({ required: true });
const mobile = useMobileView();
const sheetDrag = useSheetDragDismiss(() => {
  visible.value = false;
});

watch(visible, (open) => {
  if (!open) sheetDrag.reset();
});

function handleEdit() {
  visible.value = false;
  emit("edit");
}
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
      <div class="mobile-build-detail-heading" v-on="sheetDrag.handlers">
        <div class="mobile-build-detail-identity">
          <div class="mobile-build-detail-avatar">
            <img v-if="avatar" :src="avatar" :alt="`${title} 头像`" />
            <span v-else>{{ title.slice(0, 1) }}</span>
          </div>
          <div class="mobile-build-detail-title-group">
            <div class="mobile-build-detail-title-row">
              <h2>{{ title }}</h2>
              <span
                v-if="completionPct"
                :class="['mobile-build-detail-ratio-pill', completionClass]"
              >
                {{ completionPct }}
              </span>
              <button
                v-if="canEdit"
                type="button"
                class="mobile-build-detail-edit-btn"
                :aria-label="`编辑${title}的毕业目标`"
                @click.stop="handleEdit"
              >
                <span aria-hidden="true">✎</span> 编辑
              </button>
            </div>
            <p>{{ summary || "装备 · 目标 · 词条潜力" }}</p>
          </div>
        </div>
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
  height: min(820px, 88dvh);
  max-height: calc(100dvh - env(safe-area-inset-top) - 12px);
  padding: 0 0 env(safe-area-inset-bottom);
  border: 0;
  border-radius: 22px 22px 0 0;
  background: #f3f6fb;
  box-shadow: 0 -14px 44px rgba(20, 38, 66, 0.18);
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
  pointer-events: none;
}
html.mobile-view .mobile-build-detail-sheet .p-drawer-header {
  padding: 20px max(14px, calc(env(safe-area-inset-right) - var(--build-sheet-outer))) 12px
    max(14px, calc(env(safe-area-inset-left) - var(--build-sheet-outer)));
  border-bottom: 1px solid rgba(28, 49, 80, 0.08);
  background: #ffffff;
}
.mobile-build-detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-width: 0;
}
.mobile-build-detail-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1 1 auto;
}
.mobile-build-detail-avatar {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  overflow: hidden;
  border-radius: 11px;
  border: 1px solid #d9e4f1;
  background: #eef4fb;
  color: var(--blue);
  font-size: 16px;
  font-weight: 700;
}
.mobile-build-detail-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mobile-build-detail-title-group {
  min-width: 0;
  flex: 1 1 auto;
}
.mobile-build-detail-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.mobile-build-detail-heading h2 {
  margin: 0;
  color: var(--ink);
  font-size: 17px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.mobile-build-detail-ratio-pill {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: #e7f0fd;
  color: #245ea6;
}
.mobile-build-detail-ratio-pill.progress-complete {
  background: #e1f4ec;
  color: #1c7b59;
}
.mobile-build-detail-ratio-pill.progress-medium {
  background: #fcf1e5;
  color: #b8741a;
}
.mobile-build-detail-ratio-pill.progress-low {
  background: #faeaea;
  color: #bf4444;
}
.mobile-build-detail-edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-height: 26px;
  padding: 2px 9px;
  border: 1px solid rgba(36, 94, 166, 0.22);
  border-radius: 999px;
  background: #f3f7fd;
  color: #245ea6;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.mobile-build-detail-heading p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.3;
}
html.mobile-view .mobile-build-detail-sheet .p-drawer-content {
  min-width: 0;
  min-height: 0;
  padding: 12px 14px 22px;
  overflow-x: hidden;
  overscroll-behavior: contain;
}
html.mobile-view[data-posture^="landscape-hinge"] .mobile-build-detail-sheet .p-drawer-content {
  padding-left: max(14px, calc(env(safe-area-inset-left) - var(--build-sheet-outer)));
  padding-right: max(14px, calc(env(safe-area-inset-right) - var(--build-sheet-outer)));
}
html.mobile-view
  .mobile-build-detail-sheet
  :is(.build-card-body, .build-card-main, .build-card-side) {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: auto;
  gap: 10px;
  padding: 0;
  background: none;
}
html.mobile-view .mobile-build-detail-sheet .build-card-equipment {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}
html.mobile-view .mobile-build-detail-sheet .build-card-section {
  min-width: 0;
  padding: 12px 13px;
  border-radius: 14px;
  border: 1px solid rgba(28, 49, 80, 0.07);
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(24, 43, 74, 0.03);
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
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #5b6d84;
}
html.mobile-view .mobile-build-detail-sheet .equipped-light-cone {
  padding: 8px 10px;
  border-radius: 11px;
}
html.mobile-view .mobile-build-detail-sheet .equipped-light-cone img,
html.mobile-view .mobile-build-detail-sheet .equipped-light-cone-fallback {
  width: 40px;
  height: 40px;
  flex-basis: 40px;
  border-radius: 9px;
}
html.mobile-view .mobile-build-detail-sheet .equipped-light-cone b {
  font-size: 14px;
}
html.mobile-view .mobile-build-detail-sheet .equipped-light-cone em {
  font-size: 11px;
}
html.mobile-view .mobile-build-detail-sheet .sets-section {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
html.mobile-view .mobile-build-detail-sheet .sets-section .section-title {
  margin-bottom: 3px;
}
html.mobile-view .mobile-build-detail-sheet .recommended-set {
  justify-content: space-between;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 10px;
  background: #f7f9fc;
}
html.mobile-view .mobile-build-detail-sheet .recommended-set img,
html.mobile-view .mobile-build-detail-sheet .recommended-set-fallback {
  width: 28px;
  height: 28px;
  flex-basis: 28px;
  border-radius: 7px;
}
html.mobile-view .mobile-build-detail-sheet .recommended-set p {
  flex: 1 1 auto;
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
}
html.mobile-view .mobile-build-detail-sheet .recommended-set p b {
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(53, 110, 174, 0.1);
  font-size: 11px;
}
html.mobile-view .mobile-build-detail-sheet .recommended-set-status {
  width: auto;
  height: auto;
  flex: 0 0 auto;
  padding: 3px 8px;
  border: 0;
  border-radius: 999px;
  background: #fdeaea;
  color: #c44b4b;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}
html.mobile-view .mobile-build-detail-sheet .recommended-set-status.matched {
  background: #e2f5ed;
  color: #1f7f5c;
}
html.mobile-view .mobile-build-detail-sheet .progress-section {
  display: flex;
  flex-direction: column;
  gap: 0;
}
html.mobile-view .mobile-build-detail-sheet .progress-section .section-title {
  margin-bottom: 6px;
}
html.mobile-view .mobile-build-detail-sheet .target-progress-row {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px 10px;
  padding: 8px 0;
}
html.mobile-view .mobile-build-detail-sheet .target-progress-row + .target-progress-row {
  border-top: 1px solid #eef2f7;
}
html.mobile-view .mobile-build-detail-sheet .target-progress-label {
  grid-column: 1;
  align-items: baseline;
  font-size: 13px;
}
html.mobile-view .mobile-build-detail-sheet .target-progress-label b {
  font-weight: 700;
}
html.mobile-view .mobile-build-detail-sheet .target-progress-row i {
  grid-column: 1 / -1;
  grid-row: 2;
  height: 7px;
}
html.mobile-view .mobile-build-detail-sheet .target-progress-row small {
  grid-column: 2;
  grid-row: 1;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f5f7fb;
  font-size: 11px;
  line-height: 1.25;
}
html.mobile-view .mobile-build-detail-sheet .target-progress-row.progress-complete small {
  background: #e2f5ed;
  color: #1f7f5c;
}
html.mobile-view .mobile-build-detail-sheet .target-progress-row.progress-high small {
  background: #e7f0fd;
  color: #245ea6;
}
html.mobile-view .mobile-build-detail-sheet .target-progress-row.progress-medium small {
  background: #fcf1e5;
  color: #b8741a;
}
html.mobile-view .mobile-build-detail-sheet .target-progress-row.progress-low small {
  background: #faeaea;
  color: #bf4444;
}
html.mobile-view .mobile-build-detail-sheet .quality-visuals {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 0;
}
html.mobile-view .mobile-build-detail-sheet .quality-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px 6px;
  padding: 9px 10px;
  border-radius: 10px;
  background: #f6f9fd;
}
html.mobile-view .mobile-build-detail-sheet .quality-label {
  width: auto;
  font-size: 12px;
  font-weight: 600;
}
html.mobile-view .mobile-build-detail-sheet .quality-count {
  min-width: 0;
  font-size: 13px;
}
html.mobile-view .mobile-build-detail-sheet .quality-segments {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 3px;
}
html.mobile-view .mobile-build-detail-sheet .quality-segments i {
  width: 100%;
  height: 7px;
  border-radius: 999px;
}
html.mobile-view .mobile-build-detail-sheet .affix-tags {
  gap: 7px;
  font-size: 12px;
}
html.mobile-view .mobile-build-detail-sheet .affix-tag {
  height: 26px;
  border-radius: 7px;
  font-size: 12px;
}
html.mobile-view .mobile-build-detail-sheet .affix-val {
  min-width: 24px;
}
@media (min-width: 640px) {
  html.mobile-view .mobile-build-detail-sheet .build-card-body {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(240px, 0.8fr);
    align-items: start;
  }
  html.mobile-view .mobile-build-detail-sheet .build-card-side {
    grid-column: 1;
  }
  html.mobile-view .mobile-build-detail-sheet .build-card-radar-panel {
    grid-column: 2;
    grid-row: 1 / span 2;
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
  height: min(820px, 88dvh, var(--content-sheet-height));
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
