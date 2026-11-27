<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from "vue";
import Button from "primevue/button";
import { buildPlanApi } from "@/shared/api/build-plan";
import { inventoryApi } from "@/shared/api/inventory";
import { relicImage } from "@/shared/catalogue";
import { formatStatValue, slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import { useMobileSubMode } from "@/shared/contracts/mobile-sub-mode";
import { useMobileTopHeaderTarget } from "@/shared/contracts/mobile-top-header";
import { useMobileView } from "@/shared/contracts/mobile-view";
import LoadingState from "@/shared/ui/LoadingState.vue";
import { useCapsuleSwipe } from "@/shared/ui/useCapsuleSwipe";
import type { BuildDashboardEntry, RelicListItem, RelicMainStatGroupedResult } from "@/types";
import MainStatReviewCards from "./MainStatReviewCards.vue";
import type { ScanReviewFilters } from "./scan-review";
import {
  buildUsefulnessRows,
  filterMainStatGroups,
  formatSubstatWeightHint,
  getSetHeaderIcon,
  getStatThemeClass,
  gradeClass,
  groupFilteredSetsBySlot,
  SCANNER_SLOTS as allSlots,
  substatEffectiveTier,
  summarizeMainStatGroups,
  type ScannerUsefulnessRow,
} from "./scanner-grouping";
import ScannerFilterButton from "./ScannerFilterButton.vue";

const props = defineProps<{
  imageFor: (relic: RelicListItem) => string | undefined;
  desktopToolbarHost?: HTMLElement | null;
}>();
const emit = defineEmits<{ "open-relic": [relic: RelicListItem] }>();
const mobile = useMobileView();
let disposed = false;
const planCount = ref<number | null>(null);
const loading = ref(false);
const usefulnessLoading = ref(false);
const error = ref("");
const result = ref<RelicMainStatGroupedResult | null>(null);
const plans = ref<BuildDashboardEntry[]>([]);
const usefulnessRows = ref<ScannerUsefulnessRow[]>([]);
const usefulnessScanned = ref(0);
/** True after upgrade scan finishes (used to show empty-success when no upgrades). */
const usefulnessDone = ref(false);
const USEFULNESS_PAGE_SIZE = 200;
const USEFULNESS_FETCH_CONCURRENCY = 4;
const UPGRADE_MIN_LEVEL = 15;
const UPGRADE_RENDER_BATCH = 60;
const visibleUpgradeCount = ref(UPGRADE_RENDER_BATCH);
const visibleUsefulnessRows = computed(() =>
  usefulnessRows.value.slice(0, visibleUpgradeCount.value),
);
const remainingUpgradeCount = computed(() =>
  Math.max(0, usefulnessRows.value.length - visibleUpgradeCount.value),
);
const upgradeGridEl = ref<HTMLElement | null>(null);
const upgradeSentinelEl = ref<HTMLElement | null>(null);
let upgradeObserver: IntersectionObserver | null = null;
let usefulnessRequestId = 0;

const canAnalyze = computed(
  () =>
    planCount.value !== null && planCount.value > 0 && !loading.value && !usefulnessLoading.value,
);

const activeMode = ref<"mainStat" | "upgrade">("mainStat");
const transitionDirection = ref<"next" | "prev">("next");
const hasCurrentResult = computed(() =>
  activeMode.value === "mainStat" ? result.value !== null : usefulnessDone.value,
);
const isCurrentLoading = computed(() =>
  activeMode.value === "mainStat" ? loading.value : usefulnessLoading.value,
);
const scannerDescription = "比对已保存的培养方案，定位无去向闲置件，或优于当前穿戴的替换候选。";

const subMode = useMobileSubMode();
const pageActive = ref(true);
const {
  host: topHeaderHost,
  enabled: useTopHeader,
  isLeaving: isCapsuleLeaving,
} = useMobileTopHeaderTarget("analysis", pageActive);

const scannerTabButtons = ref<Record<string, HTMLElement | null>>({});
const setScannerTabBtnRef = (key: string, el: unknown) => {
  scannerTabButtons.value[key] = (el as HTMLElement) ?? null;
};
const scannerIndicatorX = ref(0);
function updateScannerIndicator() {
  const el = scannerTabButtons.value[activeMode.value];
  if (el) {
    scannerIndicatorX.value = el.offsetLeft + (el.offsetWidth - 18) / 2;
  }
}

watch(activeMode, () => {
  void nextTick(updateScannerIndicator);
});
watch(useTopHeader, () => {
  void nextTick(updateScannerIndicator);
});

function goToMode(mode: "mainStat" | "upgrade", direction?: "next" | "prev") {
  if (activeMode.value === mode) return;
  transitionDirection.value = direction ?? (mode === "upgrade" ? "next" : "prev");
  activeMode.value = mode;
  void nextTick(updateScannerIndicator);
  if (mode === "upgrade") {
    if (!usefulnessRows.value.length && !usefulnessDone.value && !usefulnessLoading.value) {
      void analyzeUsefulness();
    }
  } else {
    if (!result.value && !loading.value) {
      void analyze();
    }
  }
}

function nextMode() {
  const target = activeMode.value === "mainStat" ? "upgrade" : "mainStat";
  goToMode(target, "next");
}

function prevMode() {
  const target = activeMode.value === "upgrade" ? "mainStat" : "upgrade";
  goToMode(target, "prev");
}

function refreshCurrentMode() {
  if (activeMode.value === "mainStat") {
    void analyze();
  } else {
    void analyzeUsefulness();
  }
}

function selectDesktopMode(mode: "mainStat" | "upgrade") {
  if (activeMode.value !== mode) {
    goToMode(mode);
    return;
  }
  if (!hasCurrentResult.value) {
    refreshCurrentMode();
  }
}

const capsuleEl = ref<HTMLElement | null>(null);
const { dragStyle: capsuleDragStyle } = useCapsuleSwipe({
  element: capsuleEl,
  enabled: computed(() => mobile),
  onNext: nextMode,
  onPrev: prevMode,
});

let cleanupSubMode: (() => void) | null = null;
function registerSubMode() {
  if (mobile) {
    cleanupSubMode?.();
    cleanupSubMode =
      subMode?.register({ pageId: "analysis", prev: prevMode, next: nextMode }) ?? null;
    void nextTick(updateScannerIndicator);
  }
}
function unregisterSubMode() {
  cleanupSubMode?.();
  cleanupSubMode = null;
}

onMounted(() => {
  pageActive.value = true;
  registerSubMode();
  window.addEventListener("resize", updateScannerIndicator);
  void syncUpgradeObserver();
});
onActivated(() => {
  pageActive.value = true;
  registerSubMode();
  window.addEventListener("resize", updateScannerIndicator);
  void syncUpgradeObserver();
});
onDeactivated(() => {
  pageActive.value = false;
  unregisterSubMode();
  disconnectUpgradeObserver();
  window.removeEventListener("resize", updateScannerIndicator);
});
onBeforeUnmount(() => {
  unregisterSubMode();
  disconnectUpgradeObserver();
  window.removeEventListener("resize", updateScannerIndicator);
});

async function analyze() {
  if (!canAnalyze.value) return;
  const requestId = ++usefulnessRequestId;
  error.value = "";
  loading.value = true;
  try {
    const grouped = await inventoryApi.scanRelicsByMainStatGrouped();
    if (requestId !== usefulnessRequestId) return;
    planCount.value = grouped.planCount;
    result.value = grouped;
  } catch (cause) {
    if (requestId !== usefulnessRequestId) return;
    error.value = String(cause);
  } finally {
    if (requestId === usefulnessRequestId) loading.value = false;
  }
}

async function analyzeUsefulness() {
  if (!canAnalyze.value) return;
  const requestId = ++usefulnessRequestId;
  usefulnessLoading.value = true;
  error.value = "";
  usefulnessScanned.value = 0;
  usefulnessDone.value = false;
  usefulnessRows.value = [];
  visibleUpgradeCount.value = UPGRADE_RENDER_BATCH;
  try {
    plans.value = await buildPlanApi.dashboard();
    if (disposed || requestId !== usefulnessRequestId) return;
    planCount.value = plans.value.length;
    if (!plans.value.length) {
      usefulnessRows.value = [];
      return;
    }
    const firstPage = await inventoryApi.listRelics({
      page: 1,
      pageSize: USEFULNESS_PAGE_SIZE,
      equipped: false,
      minLevel: UPGRADE_MIN_LEVEL,
    });
    if (disposed || requestId !== usefulnessRequestId) return;

    const seenIds = new Set<number>();
    const allItems: RelicListItem[] = [];
    const appendItems = (items: RelicListItem[]) => {
      for (const item of items) {
        if (item.level < UPGRADE_MIN_LEVEL) continue;
        if (!seenIds.has(item.itemId)) {
          seenIds.add(item.itemId);
          allItems.push(item);
        }
      }
    };
    appendItems(firstPage.items);

    const totalPages = Math.ceil(firstPage.total / USEFULNESS_PAGE_SIZE);
    for (
      let startPage = 2;
      startPage <= totalPages && firstPage.items.length > 0;
      startPage += USEFULNESS_FETCH_CONCURRENCY
    ) {
      const pageNumbers: number[] = [];
      for (
        let p = startPage;
        p < startPage + USEFULNESS_FETCH_CONCURRENCY && p <= totalPages;
        p += 1
      ) {
        pageNumbers.push(p);
      }
      const pages = await Promise.all(
        pageNumbers.map((page) =>
          inventoryApi.listRelics({
            page,
            pageSize: USEFULNESS_PAGE_SIZE,
            equipped: false,
            minLevel: UPGRADE_MIN_LEVEL,
          }),
        ),
      );
      if (disposed || requestId !== usefulnessRequestId) return;
      let hitEmpty = false;
      for (const nextPage of pages) {
        if (!nextPage.items.length) {
          hitEmpty = true;
          continue;
        }
        appendItems(nextPage.items);
      }
      if (hitEmpty) break;
    }

    usefulnessScanned.value = allItems.length;
    usefulnessRows.value = buildUsefulnessRows(allItems, plans.value);
    usefulnessDone.value = true;
  } catch (cause) {
    if (disposed || requestId !== usefulnessRequestId) return;
    error.value = String(cause);
  } finally {
    if (requestId === usefulnessRequestId) usefulnessLoading.value = false;
  }
}

function loadMoreUpgrades() {
  if (remainingUpgradeCount.value <= 0) return;
  visibleUpgradeCount.value = Math.min(
    usefulnessRows.value.length,
    visibleUpgradeCount.value + UPGRADE_RENDER_BATCH,
  );
}

function disconnectUpgradeObserver() {
  upgradeObserver?.disconnect();
  upgradeObserver = null;
}

async function syncUpgradeObserver() {
  await nextTick();
  disconnectUpgradeObserver();
  if (
    disposed ||
    !pageActive.value ||
    activeMode.value !== "upgrade" ||
    remainingUpgradeCount.value <= 0
  ) {
    return;
  }
  const target = upgradeSentinelEl.value;
  if (!target || typeof window.IntersectionObserver !== "function") return;
  upgradeObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      loadMoreUpgrades();
      if (remainingUpgradeCount.value <= 0) {
        disconnectUpgradeObserver();
      }
    },
    {
      root: mobile ? null : upgradeGridEl.value,
      rootMargin: "320px 0px",
    },
  );
  upgradeObserver.observe(target);
}

function onUpgradeGridScroll() {
  if (remainingUpgradeCount.value <= 0) return;
  const el = upgradeGridEl.value;
  if (!el) return;
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (distanceToBottom <= 360) {
    loadMoreUpgrades();
  }
}

watch(
  [upgradeGridEl, upgradeSentinelEl, activeMode, remainingUpgradeCount],
  () => {
    void syncUpgradeObserver();
  },
  { flush: "post" },
);

function applyReviewFilters(filters: ScanReviewFilters) {
  categoryFilter.value = filters.category;
  slotFilter.value = filters.slot;
  searchQuery.value = filters.search;
}

// Main stat scanning review filters.
const searchQuery = ref("");
const slotFilter = ref("all");
const categoryFilter = ref("all");
const viewMode = ref<"grid" | "list">("grid");
const displayView = ref<"matrix" | "cards" | "slots">("matrix");
const collapsedSetIds = ref<Set<number>>(new Set());

function toggleSetCollapse(setId: number) {
  const newSet = new Set(collapsedSetIds.value);
  if (newSet.has(setId)) {
    newSet.delete(setId);
  } else {
    newSet.add(setId);
  }
  collapsedSetIds.value = newSet;
}

function collapseAllSets() {
  if (!result.value) return;
  collapsedSetIds.value = new Set(result.value.groups.map((g) => g.setId));
}

function expandAllSets() {
  collapsedSetIds.value = new Set();
}

const summaryStats = computed(() => summarizeMainStatGroups(result.value));

const filteredGroups = computed(() =>
  filterMainStatGroups(result.value, {
    searchQuery: searchQuery.value,
    slotFilter: slotFilter.value,
    categoryFilter: categoryFilter.value,
  }),
);

const groupedBySlot = computed(() =>
  groupFilteredSetsBySlot(filteredGroups.value, slotFilter.value),
);

onMounted(async () => {
  try {
    const [count, dashboard] = await Promise.all([
      inventoryApi.relicMainStatScanPlanCount(),
      buildPlanApi.dashboard(),
    ]);
    if (disposed) return;
    plans.value = dashboard;
    planCount.value = Math.max(count ?? 0, dashboard.length);
    if (canAnalyze.value && !result.value && !loading.value) {
      void analyze();
    }
  } catch (cause) {
    if (!disposed) error.value = String(cause);
  }
});
onBeforeUnmount(() => {
  disposed = true;
  usefulnessRequestId += 1;
});
</script>

<template>
  <section class="relic-scanner">
    <!-- Mobile Top Categories Tabs -->
    <Teleport :to="topHeaderHost ?? 'body'" :disabled="!useTopHeader">
      <nav v-if="mobile" class="mobile-scanner-categories" aria-label="分析模式">
        <button
          :ref="(el) => setScannerTabBtnRef('mainStat', el)"
          type="button"
          :class="{ active: activeMode === 'mainStat' }"
          :aria-pressed="activeMode === 'mainStat'"
          @click="goToMode('mainStat')"
        >
          主属性扫描
        </button>
        <button
          :ref="(el) => setScannerTabBtnRef('upgrade', el)"
          type="button"
          :class="{ active: activeMode === 'upgrade' }"
          :aria-pressed="activeMode === 'upgrade'"
          @click="goToMode('upgrade')"
        >
          替换推荐扫描
        </button>
        <span
          class="mobile-scanner-category-indicator"
          :style="{ transform: `translateX(${scannerIndicatorX}px)` }"
          aria-hidden="true"
        />
      </nav>
    </Teleport>

    <!-- Desktop Compact Action Bar (teleported into ScannerPage mode bar when available) -->
    <Teleport
      v-if="!mobile"
      :to="props.desktopToolbarHost ?? 'body'"
      :disabled="!props.desktopToolbarHost"
    >
      <div class="scanner-desktop-actions">
        <div class="scanner-submode-switch" role="group" aria-label="扫描分析视图">
          <button
            type="button"
            :class="['submode-btn', { active: activeMode === 'mainStat' }]"
            :aria-pressed="activeMode === 'mainStat'"
            :disabled="!canAnalyze"
            @click="selectDesktopMode('mainStat')"
          >
            <span class="submode-marker" aria-hidden="true">✦</span>
            主属性扫描
          </button>
          <button
            type="button"
            :class="['submode-btn', { active: activeMode === 'upgrade' }]"
            :aria-pressed="activeMode === 'upgrade'"
            :disabled="!canAnalyze"
            @click="selectDesktopMode('upgrade')"
          >
            替换推荐扫描
          </button>
        </div>

        <Button
          type="button"
          class="scanner-rescan-btn"
          :disabled="!canAnalyze"
          :loading="isCurrentLoading"
          :outlined="hasCurrentResult"
          @click="refreshCurrentMode()"
        >
          <svg
            v-if="hasCurrentResult && !isCurrentLoading"
            class="rescan-icon"
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
          <span v-else-if="!isCurrentLoading" class="rescan-marker" aria-hidden="true">✦</span>
          <span>{{ hasCurrentResult ? "重新扫描" : "开始扫描" }}</span>
        </Button>

        <span
          class="scanner-help-tip"
          tabindex="0"
          role="note"
          :aria-label="scannerDescription"
          :data-tooltip="scannerDescription"
          :title="scannerDescription"
        >
          ?
        </span>
      </div>
    </Teleport>

    <!-- Content Viewport with Directional Slide Transition -->
    <div class="scanner-mode-viewport">
      <Transition :name="`slide-${transitionDirection}`" mode="out-in">
        <!-- UPGRADE MODE (替换推荐扫描) -->
        <div v-if="activeMode === 'upgrade'" key="upgrade" class="scanner-mode-pane">
          <p v-if="error" class="scanner-state error">{{ error }}</p>
          <LoadingState
            v-else-if="usefulnessLoading"
            variant="page"
            label="正在检索优于当前穿戴的 +15 未装备遗器…"
            hint="正在逐件比对所有培养方案的套装、主词条与加权副词条评分"
          />
          <div v-else-if="usefulnessRows.length" class="scanner-usefulness">
            <div class="scanner-result-heading">
              <div class="result-heading-left">
                <p class="result-heading-summary">
                  <b>{{ usefulnessRows.length }}</b> 件可替换推荐
                  <span class="result-heading-criteria">（主属性 + 套装匹配且词条分更高）</span>
                </p>
                <span v-if="usefulnessScanned > 0" class="scanner-scanned-badge">
                  已全量分析 {{ usefulnessScanned }} 件 +15 未装备
                </span>
              </div>
              <p class="scanner-result-note">按相对当前穿戴的加权分增量排序</p>
            </div>
            <div
              ref="upgradeGridEl"
              class="scanner-upgrade-grid"
              role="list"
              aria-label="替换推荐扫描"
              @scroll.passive="onUpgradeGridScroll"
            >
              <article
                v-for="row in visibleUsefulnessRows"
                :key="row.item.itemId"
                class="upgrade-card"
                role="listitem"
                tabindex="0"
                @click="emit('open-relic', row.item)"
                @keydown.enter="emit('open-relic', row.item)"
                @keydown.space.prevent="emit('open-relic', row.item)"
              >
                <!-- Main Info Section -->
                <div class="upgrade-card-main">
                  <!-- Relic Icon Frame -->
                  <div :class="['relic-thumb', `rarity-${row.item.rarity}`]">
                    <img
                      v-if="props.imageFor(row.item) || relicImage(row.item.setId, row.item.slot)"
                      :src="props.imageFor(row.item) || relicImage(row.item.setId, row.item.slot)"
                      :alt="row.item.name"
                    />
                    <span v-else class="relic-thumb-fallback">{{
                      slotLabel(row.item.slot).slice(0, 1)
                    }}</span>
                    <span class="relic-level-tag">+{{ row.item.level }}</span>
                  </div>

                  <!-- Set, Upgrade Badge, Tags & Main Stat -->
                  <div class="relic-meta">
                    <div class="relic-name-row">
                      <div class="relic-title-group">
                        <b class="relic-set-name" :title="row.item.setName">{{
                          row.item.setName
                        }}</b>
                        <span class="upgrade-badge"><i class="sparkle">✦</i> 替换推荐</span>
                      </div>
                      <div class="upgrade-card-tags">
                        <span class="slot-pill">{{ slotLabel(row.item.slot) }}</span>
                        <span :class="['grade-pill', gradeClass(row.grade)]">
                          {{ row.grade ?? "—" }}
                        </span>
                      </div>
                    </div>
                    <div class="main-stat-badge">
                      <small>主词条</small>
                      <strong>{{ statLabel(row.item.mainStat) }}</strong>
                      <em v-if="row.item.mainStatValue"
                        >+{{ formatStatValue(row.item.mainStat, row.item.mainStatValue) }}</em
                      >
                    </div>
                  </div>
                </div>

                <!-- Target Character Banner with Upgrade Delta -->
                <div class="target-character-bar">
                  <div class="character-target-left">
                    <div class="character-avatar-wrapper">
                      <img
                        v-if="row.characterAvatar"
                        :src="row.characterAvatar"
                        :alt="row.characterDisplayLabel"
                        class="character-avatar-img"
                      />
                      <span
                        v-else
                        :class="['character-avatar-fallback', `element-${row.characterElement}`]"
                      >
                        {{ row.characterDisplayLabel.slice(0, 1) }}
                      </span>
                    </div>
                    <div class="character-target-info">
                      <span class="target-caption">适配角色</span>
                      <span :class="['target-character-name', `element-${row.characterElement}`]">
                        {{ row.characterDisplayLabel }}
                      </span>
                    </div>
                  </div>

                  <div class="character-target-delta">
                    <span class="roll-delta-tag">
                      <i class="up-arrow">↑</i> +{{ row.deltaWeightedRolls.toFixed(2) }}
                      <small>rolls</small>
                    </span>
                    <span class="roll-vs-detail">
                      {{ row.weightedRolls.toFixed(2) }} <small>vs</small>
                      {{
                        row.equippedWeightedRolls != null
                          ? row.equippedWeightedRolls.toFixed(2)
                          : "空槽"
                      }}
                    </span>
                  </div>
                </div>

                <!-- Substats Chips Preview -->
                <div v-if="row.item.substats && row.item.substats.length" class="substat-chips-row">
                  <span
                    v-for="(sub, idx) in row.item.substats.slice(0, 4)"
                    :key="idx"
                    :class="[
                      'substat-chip',
                      `is-${substatEffectiveTier(row.effectiveSubstatWeights, sub.key)}`,
                    ]"
                    :title="`${statLabel(sub.key)} +${formatStatValue(sub.key, sub.value)}（${formatSubstatWeightHint(row.effectiveSubstatWeights, sub.key)}）`"
                  >
                    <span class="substat-label">
                      <i
                        v-if="substatEffectiveTier(row.effectiveSubstatWeights, sub.key) === 'core'"
                        class="substat-eff-mark"
                        aria-hidden="true"
                        >✦</i
                      >
                      <i
                        v-else-if="
                          substatEffectiveTier(row.effectiveSubstatWeights, sub.key) === 'minor'
                        "
                        class="substat-eff-dot"
                        aria-hidden="true"
                      />
                      <span class="substat-label-text">{{ statLabel(sub.key) }}</span>
                    </span>
                    <em>+{{ formatStatValue(sub.key, sub.value) }}</em>
                  </span>
                </div>
              </article>
              <div
                v-if="remainingUpgradeCount > 0"
                ref="upgradeSentinelEl"
                class="upgrade-scroll-sentinel"
                aria-hidden="true"
              >
                向下滚动自动加载更多（剩余 {{ remainingUpgradeCount }} 件）
              </div>
            </div>
          </div>
          <div v-else-if="usefulnessDone && usefulnessScanned > 0" class="scanner-state success">
            未发现优于当前穿戴的 +15 未装备遗器（主属性、套装均匹配且词条分更高）。
          </div>
          <div v-else-if="usefulnessDone && usefulnessScanned === 0" class="scanner-state success">
            当前没有可分析的 +15 未装备遗器。
          </div>
          <div v-else class="scanner-intro">
            <div class="scanner-radar" aria-hidden="true"><i /><b>◈</b></div>
            <div>
              <p>准备就绪</p>
              <strong>{{
                mobile ? "轻触下方胶囊开始检索替换推荐" : "准备检索可替换的更优遗器"
              }}</strong>
              <small>比对已保存的培养方案，分析未装备遗器加权分增量。</small>
            </div>
          </div>
        </div>

        <!-- MAIN STAT MODE (主属性扫描) -->
        <div v-else key="mainStat" class="scanner-mode-pane">
          <p v-if="error" class="scanner-state error">{{ error }}</p>
          <LoadingState
            v-else-if="planCount === null"
            variant="page"
            compact
            label="正在读取培养方案…"
          />
          <div v-else-if="planCount === 0" class="scanner-state">
            {{
              mobile
                ? "请先在电脑端保存培养方案 / 毕业目标，再同步到手机。"
                : "请先在数据管理的角色档案中保存至少一个“培养方案 / 毕业目标”。"
            }}
          </div>
          <LoadingState
            v-else-if="loading"
            variant="page"
            label="正在比对培养方案并检索遗器…"
            hint="汇总无目标主词条的未装备遗器矩阵"
          />
          <div v-else-if="!result" class="scanner-intro">
            <div class="scanner-radar" aria-hidden="true"><i /><b>◈</b></div>
            <div>
              <p>等待指令</p>
              <strong>准备检索 {{ planCount }} 个培养方案</strong
              ><small>本次分析只读取数据，不会删除或标记任何遗器。</small>
            </div>
          </div>
          <div v-else-if="!result.groups.length" class="scanner-state success">
            未发现无目标主词条的未装备遗器。
          </div>
          <template v-else>
            <!-- Compact Single-Row Control Toolbar -->
            <div class="cleaning-header-compact">
              <div class="compact-left">
                <div class="compact-title-row">
                  <span class="compact-total"
                    ><b>{{ result.total }}</b> 件待复核</span
                  >
                  <span v-if="mobile && summaryStats" class="compact-sub-info">
                    (隧洞 <b>{{ summaryStats.cavernCount }}</b> 件 / 位面
                    <b>{{ summaryStats.planarCount }}</b> 件)
                  </span>
                </div>

                <!-- Quick Category Filters -->
                <div v-if="!mobile" class="category-tabs-group">
                  <button
                    :class="['cat-tab-btn', { active: categoryFilter === 'all' }]"
                    @click="categoryFilter = 'all'"
                  >
                    全部 ({{ result.total }})
                  </button>
                  <button
                    v-if="summaryStats"
                    :class="['cat-tab-btn', 'cavern', { active: categoryFilter === 'cavern' }]"
                    @click="categoryFilter = 'cavern'"
                  >
                    隧洞遗器 ({{ summaryStats.cavernCount }})
                  </button>
                  <button
                    v-if="summaryStats"
                    :class="['cat-tab-btn', 'planar', { active: categoryFilter === 'planar' }]"
                    @click="categoryFilter = 'planar'"
                  >
                    位面饰品 ({{ summaryStats.planarCount }})
                  </button>
                </div>
              </div>

              <ScannerFilterButton
                v-if="mobile"
                :filters="{ category: categoryFilter, slot: slotFilter, search: searchQuery }"
                :total="result?.total ?? 0"
                :cavern-count="summaryStats?.cavernCount ?? 0"
                :planar-count="summaryStats?.planarCount ?? 0"
                :disabled="!result?.groups.length || loading || usefulnessLoading"
                @apply="applyReviewFilters"
              />

              <div v-if="!mobile" class="compact-right">
                <!-- Slot Segment Filter -->
                <div class="slot-filter-select-wrapper">
                  <select v-model="slotFilter" class="slot-filter-select">
                    <option value="all">所有部位</option>
                    <option value="Body">躯干</option>
                    <option value="Feet">脚部</option>
                    <option value="PlanarSphere">位面球</option>
                    <option value="LinkRope">连结绳</option>
                    <option value="Head">头部</option>
                    <option value="Hands">手部</option>
                  </select>
                </div>

                <!-- Quick Search -->
                <div class="search-input-wrapper">
                  <svg
                    class="search-icon"
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="搜索套装..."
                    class="search-input"
                  />
                  <button v-if="searchQuery" class="clear-search-btn" @click="searchQuery = ''">
                    ✕
                  </button>
                </div>
              </div>
            </div>

            <!-- Filter Empty State -->
            <div v-if="!filteredGroups.length" class="scanner-state">
              没有匹配当前条件的待复核遗器。
            </div>

            <!-- MATRIX BOARD (二维矩阵热力看板) -->
            <div v-else class="scanner-review-results">
              <MainStatReviewCards v-if="mobile" :groups="filteredGroups" />
              <div class="matrix-board-container">
                <div class="matrix-table-wrapper">
                  <table class="modern-matrix-table" role="grid" aria-label="待复核遗器二维矩阵">
                    <thead>
                      <tr>
                        <th class="col-set-info">套装名称 / 类型</th>
                        <th
                          v-for="s in allSlots.filter(
                            (s) => slotFilter === 'all' || slotFilter === s.key,
                          )"
                          :key="s.key"
                          class="col-slot-header"
                        >
                          <span class="slot-header-icon">
                            <svg
                              v-if="s.key === 'Body'"
                              class="slot-svg-icon"
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <path d="M6 3h12l3 6-3 12H6L3 9z" />
                              <path d="M12 3v18" />
                              <path d="M8 9h8" />
                            </svg>
                            <svg
                              v-else-if="s.key === 'Feet'"
                              class="slot-svg-icon"
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <path
                                d="M4 16v-6a3 3 0 0 1 3-3h3l3 4h7a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4z"
                              />
                              <circle cx="8" cy="16" r="1" />
                            </svg>
                            <svg
                              v-else-if="s.key === 'PlanarSphere'"
                              class="slot-svg-icon"
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <circle cx="12" cy="12" r="7" />
                              <path d="M4.5 14.5c4.5 3 10.5 3 15 0" />
                              <path d="M4.5 9.5c4.5-3 10.5-3 15 0" />
                            </svg>
                            <svg
                              v-else-if="s.key === 'LinkRope'"
                              class="slot-svg-icon"
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <path d="M10 14l-2 2a3 3 0 1 1-4.24-4.24l2-2a3 3 0 0 1 4.24 0" />
                              <path d="M14 10l2-2a3 3 0 1 1 4.24 4.24l-2 2a3 3 0 0 1-4.24 0" />
                              <line x1="8" y1="16" x2="16" y2="8" />
                            </svg>
                            <svg
                              v-else-if="s.key === 'Head'"
                              class="slot-svg-icon"
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <path
                                d="M12 4a8 8 0 0 0-8 8v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a8 8 0 0 0-8-8z"
                              />
                              <path d="M4 14h16" />
                            </svg>
                            <svg
                              v-else-if="s.key === 'Hands'"
                              class="slot-svg-icon"
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" />
                              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
                              <path
                                d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8a7 7 0 0 0 7 7h1a7 7 0 0 0 7-7v-3.5"
                              />
                            </svg>
                          </span>
                          <span class="slot-header-name">{{ s.label }}</span>
                        </th>
                        <th class="col-total">待复核件数</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="setGroup in filteredGroups"
                        :key="setGroup.setId"
                        class="matrix-row"
                      >
                        <!-- 套装列 -->
                        <td class="cell-set-info">
                          <div class="matrix-set-cell">
                            <img
                              :src="getSetHeaderIcon(setGroup)"
                              :alt="setGroup.setName"
                              class="matrix-set-icon"
                            />
                            <div class="matrix-set-meta">
                              <span class="matrix-set-name">{{ setGroup.setName }}</span>
                              <span
                                :class="['set-type-tag', setGroup.isPlanar ? 'planar' : 'cavern']"
                              >
                                {{ setGroup.isPlanar ? "2件套" : "4件套" }}
                              </span>
                            </div>
                          </div>
                        </td>

                        <!-- 部位交叉单元格 -->
                        <td
                          v-for="s in allSlots.filter(
                            (s) => slotFilter === 'all' || slotFilter === s.key,
                          )"
                          :key="s.key"
                          class="cell-slot-data"
                        >
                          <template v-if="setGroup.parts.find((p) => p.slot === s.key)">
                            <div class="matrix-chip-list">
                              <div
                                v-for="stat in setGroup.parts.find((p) => p.slot === s.key)!.stats"
                                :key="stat.mainStat"
                                :class="[
                                  'modern-stat-chip',
                                  'matrix-chip',
                                  getStatThemeClass(stat.mainStat),
                                ]"
                              >
                                <span class="chip-stat-label">{{ statLabel(stat.mainStat) }}</span>
                                <span class="chip-count-pill">{{ stat.count }} 件</span>
                              </div>
                            </div>
                          </template>
                          <span v-else class="cell-empty">—</span>
                        </td>

                        <!-- 总计列 -->
                        <td class="cell-total">
                          <div class="set-total-badge matrix-badge">
                            <b>{{ setGroup.groupTotal }}</b> <small>件</small>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </template>
        </div>
      </Transition>
    </div>

    <!-- Mobile Floating Glass Capsule (Apple Music Style, hidden in unfolded-portrait) -->
    <Teleport v-if="mobile && pageActive" to="body">
      <Transition name="mobile-capsule-float" appear>
        <nav
          ref="capsuleEl"
          :class="[
            'mobile-glass-capsule',
            `is-${activeMode}`,
            { 'is-capsule-leaving': isCapsuleLeaving },
          ]"
          aria-label="分析视图切换"
        >
          <button
            type="button"
            class="capsule-arrow-btn prev"
            :disabled="loading || usefulnessLoading"
            aria-label="循环切换至上一模式"
            @click="prevMode()"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div
            class="capsule-center-body"
            role="button"
            tabindex="0"
            :style="capsuleDragStyle"
            :aria-label="
              activeMode === 'mainStat' ? '主属性扫描，点击刷新' : '替换推荐扫描，点击刷新'
            "
            @click="refreshCurrentMode()"
          >
            <Transition :name="`capsule-${transitionDirection}`" mode="out-in">
              <div :key="activeMode" class="capsule-titles">
                <span class="capsule-title-main">
                  {{ activeMode === "mainStat" ? "主属性扫描" : "替换推荐扫描" }}
                </span>
                <span v-if="loading || usefulnessLoading" class="capsule-title-sub is-loading">
                  <span class="capsule-loading-dot" aria-hidden="true" /> 分析中…
                </span>
                <span v-else-if="activeMode === 'mainStat'" class="capsule-title-sub">
                  {{
                    result?.total ? `${result.total} 件待复核 · 点击刷新` : "轻触刷新 · 左右滑动"
                  }}
                </span>
                <span v-else class="capsule-title-sub">
                  {{
                    usefulnessRows.length
                      ? `${usefulnessRows.length} 件可替换 · 点击刷新`
                      : "轻触刷新 · 左右滑动"
                  }}
                </span>
              </div>
            </Transition>
            <div class="capsule-dots" aria-hidden="true">
              <span :class="{ active: activeMode === 'mainStat' }" />
              <span :class="{ active: activeMode === 'upgrade' }" />
            </div>
          </div>

          <button
            type="button"
            class="capsule-arrow-btn next"
            :disabled="loading || usefulnessLoading"
            aria-label="循环切换至下一模式"
            @click="nextMode()"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </nav>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped src="./relic-main-stat-scanner.css"></style>
