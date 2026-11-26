<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Drawer from "primevue/drawer";
import {
  APP_NAME,
  APP_SLUG,
  APP_VERSION,
  PROJECT_REPOSITORY,
  PROJECT_URL,
} from "@/shared/app-info";
import { characterCatalogue, lightConeCatalogue, relicCatalogue } from "@/shared/catalogue";
import { useSheetDragDismiss } from "@/shared/ui/useSheetDragDismiss";
import { formatTime } from "@/shared/utils/display";
import type { InventorySummary } from "@/types";

const visible = defineModel<boolean>({ required: true });

const props = defineProps<{
  summary: InventorySummary;
}>();

const copyState = ref<"idle" | "copied" | "failed">("idle");
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

const sheetDrag = useSheetDragDismiss(() => {
  visible.value = false;
});

watch(visible, (open) => {
  if (!open) {
    sheetDrag.reset();
    copyState.value = "idle";
  }
});

onBeforeUnmount(() => {
  if (copyResetTimer) {
    clearTimeout(copyResetTimer);
    copyResetTimer = null;
  }
});

const versionLabel = `v${APP_VERSION}`;

const syncTimeLabel = computed(() => formatTime(props.summary.lastSyncAt ?? null));

const protocolLabel = computed(() =>
  props.summary.protocolVersion ? `v${props.summary.protocolVersion}` : "未记录",
);

const inventoryOverview = computed(() => {
  const base = `${props.summary.characters ?? 0} 角色 · ${props.summary.lightCones ?? 0} 光锥 · ${props.summary.relics ?? 0} 遗器`;
  if (typeof props.summary.teams === "number" && props.summary.teams > 0) {
    return `${base} · ${props.summary.teams} 配队`;
  }
  return base;
});

const catalogueOverview = computed(
  () =>
    `${characterCatalogue.characters.length} 角色 · ${lightConeCatalogue.lightCones.length} 光锥 · ${relicCatalogue.sets.length} 套装`,
);

const catalogueUpdatedLabel = computed(() => {
  const raw = characterCatalogue.source?.syncedAt;
  return raw ? `更新至 ${raw.slice(0, 10)}` : "内置离线图鉴";
});

const copyButtonLabel = computed(() => {
  if (copyState.value === "copied") return "已复制仓库地址";
  if (copyState.value === "failed") return "请手动复制上方链接";
  return "复制仓库地址";
});

const featureItems = [
  {
    id: "inventory",
    name: "背包",
    description: "浏览已同步的角色面板、配装光锥与遗器词条详情",
  },
  {
    id: "catalogue",
    name: "图鉴",
    description: "离线检索全量角色技能、光锥效果与遗器套装推荐",
  },
  {
    id: "build",
    name: "毕业",
    description: "查看角色养成目标、毕业进度与常用配队方案",
  },
  {
    id: "analysis",
    name: "分析",
    description: "评估遗器有效词条、强化收益与部位替换建议",
  },
  {
    id: "sync",
    name: "同步",
    description: "通过 WebDAV 从桌面端拉取最新只读数据快照",
  },
] as const;

async function copyProjectUrl() {
  if (copyResetTimer) {
    clearTimeout(copyResetTimer);
    copyResetTimer = null;
  }

  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("clipboard unavailable");
    }
    await navigator.clipboard.writeText(PROJECT_URL);
    copyState.value = "copied";
  } catch {
    copyState.value = "failed";
  }

  copyResetTimer = setTimeout(() => {
    copyState.value = "idle";
    copyResetTimer = null;
  }, 2200);
}
</script>

<template>
  <Drawer
    v-model:visible="visible"
    position="bottom"
    :block-scroll="true"
    class="mobile-about-sheet"
    :show-close-icon="false"
    aria-label="关于应用与版本信息"
  >
    <template #header>
      <div class="mobile-about-header" v-on="sheetDrag.handlers">
        <div class="mobile-about-heading">
          <span class="mobile-about-eyebrow">{{ APP_SLUG }}</span>
          <strong class="mobile-about-title">关于星穹数据航站</strong>
        </div>
        <button
          type="button"
          class="mobile-about-close"
          aria-label="关闭介绍页"
          @click="visible = false"
        >
          完成
        </button>
      </div>
    </template>

    <div class="mobile-about-body">
      <section class="mobile-about-hero" aria-label="应用概览">
        <img class="mobile-about-logo" src="/logo/android-chrome-192x192.png" alt="星穹数据航站" />
        <div class="mobile-about-hero-meta">
          <div class="mobile-about-hero-title-row">
            <h2 class="mobile-about-hero-name">{{ APP_NAME }}</h2>
            <span class="mobile-about-version">{{ versionLabel }}</span>
          </div>
          <p class="mobile-about-hero-sub">移动端只读查看版 · 随身档案与图鉴浏览</p>
          <p class="mobile-about-hero-desc">
            面向《崩坏：星穹铁道》的移动端随身查看终端，可离线浏览桌面端同步来的角色背包、内置全量图鉴、毕业进度与遗器词条分析结果。
          </p>
        </div>
      </section>

      <section class="mobile-about-card" aria-label="版本与数据状态">
        <div class="mobile-about-card-head">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v14a9 3 0 0 0 18 0V5" />
            <path d="M3 12a9 3 0 0 0 18 0" />
          </svg>
          <h3>版本与数据快照</h3>
        </div>
        <dl class="mobile-about-facts">
          <div class="mobile-about-fact-row">
            <dt>当前版本</dt>
            <dd class="is-strong">{{ versionLabel }}</dd>
          </div>
          <div class="mobile-about-fact-row">
            <dt>同步协议</dt>
            <dd>{{ protocolLabel }}</dd>
          </div>
          <div class="mobile-about-fact-row">
            <dt>本地档案</dt>
            <dd>{{ inventoryOverview }}</dd>
          </div>
          <div class="mobile-about-fact-row">
            <dt>最近同步</dt>
            <dd>{{ syncTimeLabel }}</dd>
          </div>
          <div class="mobile-about-fact-row">
            <dt>内置图鉴</dt>
            <dd>{{ catalogueOverview }}（{{ catalogueUpdatedLabel }}）</dd>
          </div>
        </dl>
      </section>

      <section class="mobile-about-card" aria-label="功能说明">
        <div class="mobile-about-card-head">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
            <path d="M5 3v4" />
            <path d="M19 17v4" />
            <path d="M3 5h4" />
            <path d="M17 19h4" />
          </svg>
          <h3>主要功能</h3>
        </div>
        <ul class="mobile-about-feature-list">
          <li v-for="item in featureItems" :key="item.id" class="mobile-about-feature-item">
            <span class="mobile-about-feature-icon" aria-hidden="true">
              <svg
                v-if="item.id === 'inventory'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              <svg
                v-else-if="item.id === 'catalogue'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
              <svg
                v-else-if="item.id === 'build'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polygon
                  points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                />
              </svg>
              <svg
                v-else-if="item.id === 'analysis'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            </span>
            <div class="mobile-about-feature-copy">
              <strong>{{ item.name }}</strong>
              <span>{{ item.description }}</span>
            </div>
          </li>
        </ul>
      </section>

      <section class="mobile-about-card" aria-label="开源项目信息">
        <div class="mobile-about-repo-head">
          <div>
            <h3>开源项目</h3>
            <p class="mobile-about-repo-name">{{ PROJECT_REPOSITORY }}</p>
          </div>
          <button type="button" class="mobile-about-copy-btn" @click="copyProjectUrl">
            <svg
              v-if="copyState === 'copied'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>{{ copyButtonLabel }}</span>
          </button>
        </div>
        <p class="mobile-about-repo-url">{{ PROJECT_URL }}</p>
        <p class="mobile-about-footnote">
          数据与资源仅用于个人本地查看与整理，桌面端负责扫描导入及生成同步快照。
        </p>
      </section>
    </div>
  </Drawer>
</template>

<style>
.mobile-about-sheet.p-drawer {
  --p-drawer-background: #f3f6fb;
  height: auto;
  max-height: min(86dvh, calc(100dvh - max(env(safe-area-inset-top, 0px), 16px) - 8px));
  border-radius: 22px 22px 0 0;
  border: 1px solid rgba(28, 53, 71, 0.08);
  border-bottom: 0;
  background: #f3f6fb;
  color: #182634;
  overflow: hidden;
  box-shadow: 0 -16px 40px rgba(15, 29, 44, 0.16);
}

.mobile-about-sheet.p-drawer .p-drawer-header {
  display: block;
  padding: 0;
  flex-shrink: 0;
}

.mobile-about-sheet.p-drawer .p-drawer-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 12px 16px calc(24px + env(safe-area-inset-bottom, 0px));
}

.mobile-about-sheet .mobile-about-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 18px 14px;
  background: rgba(255, 255, 255, 0.94);
  border-bottom: 1px solid rgba(28, 53, 71, 0.08);
  touch-action: none;
}

.mobile-about-sheet .mobile-about-header::before {
  content: "";
  position: absolute;
  top: 8px;
  left: 50%;
  width: 38px;
  height: 4px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: rgba(28, 53, 71, 0.22);
}

html.mobile-view[data-posture^="landscape-hinge"] .mobile-about-sheet .mobile-about-header {
  padding-left: calc(18px + env(safe-area-inset-left, 0px));
  padding-right: calc(18px + env(safe-area-inset-right, 0px));
}

html.mobile-view[data-posture^="landscape-hinge"] .mobile-about-sheet.p-drawer .p-drawer-content {
  padding-left: calc(16px + env(safe-area-inset-left, 0px));
  padding-right: calc(16px + env(safe-area-inset-right, 0px));
}

/* Folded postures keep modals inside the dedicated fold lane or lower pane */
html.mobile-view:is([data-content-fold="book"], [data-content-fold="tabletop"])
  .mobile-about-sheet.p-drawer {
  left: var(--content-sheet-left, 0px) !important;
  right: auto !important;
  width: var(--content-sheet-width, 100%) !important;
  max-width: var(--content-sheet-width, 100%) !important;
  max-height: min(88dvh, var(--content-sheet-height, 88dvh)) !important;
}

@media (prefers-reduced-motion: reduce) {
  .mobile-about-sheet.p-drawer,
  .mobile-about-sheet.p-drawer * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>

<style scoped>
.mobile-about-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mobile-about-eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #627180;
}

.mobile-about-title {
  font-size: 17px;
  font-weight: 700;
  color: #182634;
  line-height: 1.25;
}

.mobile-about-close {
  border: 0;
  background: rgba(28, 53, 71, 0.08);
  color: #1c3547;
  min-width: 56px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.mobile-about-close:active {
  background: rgba(28, 53, 71, 0.16);
}

.mobile-about-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mobile-about-hero {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  border: 1px solid rgba(28, 53, 71, 0.08);
  box-shadow: 0 4px 14px rgba(18, 38, 58, 0.04);
}

.mobile-about-logo {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(28, 53, 71, 0.14);
}

.mobile-about-hero-meta {
  flex: 1;
  min-width: 0;
}

.mobile-about-hero-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.mobile-about-hero-name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #182634;
  line-height: 1.3;
}

.mobile-about-version {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  background: #1c3547;
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.mobile-about-hero-sub {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: #466076;
}

.mobile-about-hero-desc {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: #4a5a6a;
}

.mobile-about-card {
  padding: 14px 16px;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid rgba(28, 53, 71, 0.08);
}

.mobile-about-card-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: #1c3547;
}

.mobile-about-card-head svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.mobile-about-card-head h3,
.mobile-about-repo-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #182634;
}

.mobile-about-facts {
  margin: 0;
  display: flex;
  flex-direction: column;
}

.mobile-about-fact-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid rgba(28, 53, 71, 0.06);
}

.mobile-about-fact-row:first-child {
  padding-top: 2px;
  border-top: 0;
}

.mobile-about-fact-row:last-child {
  padding-bottom: 2px;
}

.mobile-about-fact-row dt {
  font-size: 13px;
  color: #627180;
  flex-shrink: 0;
}

.mobile-about-fact-row dd {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: #182634;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.mobile-about-fact-row dd.is-strong {
  font-weight: 700;
  color: #1c3547;
}

.mobile-about-feature-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mobile-about-feature-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.mobile-about-feature-icon {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: rgba(28, 53, 71, 0.07);
  color: #1c3547;
}

.mobile-about-feature-icon svg {
  width: 16px;
  height: 16px;
}

.mobile-about-feature-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mobile-about-feature-copy strong {
  font-size: 13px;
  font-weight: 700;
  color: #182634;
}

.mobile-about-feature-copy span {
  font-size: 12.5px;
  line-height: 1.45;
  color: #516171;
}

.mobile-about-repo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mobile-about-repo-name {
  margin: 2px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: #466076;
}

.mobile-about-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(28, 53, 71, 0.14);
  background: #f5f8fc;
  color: #1c3547;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.mobile-about-copy-btn:active {
  background: #e7eef6;
}

.mobile-about-copy-btn svg {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.mobile-about-repo-url {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f5f8fc;
  color: #36495a;
  font-size: 12px;
  line-height: 1.4;
  word-break: break-all;
  user-select: all;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.mobile-about-footnote {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #627180;
}
</style>
