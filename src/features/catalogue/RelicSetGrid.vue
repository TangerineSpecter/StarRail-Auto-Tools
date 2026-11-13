<script setup lang="ts">
import { useMobileView } from "@/shared/contracts/mobile-view";
import { useMobileSubMode } from "@/shared/contracts/mobile-sub-mode";
import { useMobileTopHeaderTarget } from "@/shared/contracts/mobile-top-header";
import { useCapsuleSwipe } from "@/shared/ui/useCapsuleSwipe";
import { useMobileListWindow } from "@/shared/ui/useMobileListWindow";
import MobileFarmingList from "./MobileFarmingList.vue";
import { catalogueCapsuleHostKey } from "./catalogue-capsule-host";
import { computed, inject, onActivated, onDeactivated, onUnmounted, ref, watch } from "vue";
import { buildPlanApi } from "@/shared/api/build-plan";
import type { RelicSetCatalogueEntry, RelicSetFarmingProfile, RelicSetTargetCount } from "@/types";
import { ownedCountOf } from "./owned-counts";
import {
  farmingPriorityClass,
  formatFarmingCoverage,
  formatFarmingPriority,
  formatFarmingQuality,
  scoreRelicSetsForFarming,
} from "./relic-farming-score";
import { sortRelicSetsByTargetCount } from "./relic-target-chart";

defineOptions({ name: "RelicSetGrid" });

const props = defineProps<{
  sets: RelicSetCatalogueEntry[];
  ownedCounts: Map<number, number>;
  inventoryRevision?: number;
  preview?: boolean;
  active?: boolean;
}>();
const emit = defineEmits<{ select: [set: RelicSetCatalogueEntry] }>();

const mobile = useMobileView();
const viewMode = ref<"cards" | "chart" | "farmingScore">("cards");
const viewModes = ["cards", "chart", "farmingScore"] as const;
type ViewMode = (typeof viewModes)[number];
const viewTransitionDirection = ref<"next" | "prev">("next");

function setViewMode(next: ViewMode, direction?: "next" | "prev") {
  if (next === viewMode.value) return;
  if (direction) {
    viewTransitionDirection.value = direction;
  } else {
    const curIdx = viewModes.indexOf(viewMode.value);
    const nextIdx = viewModes.indexOf(next);
    viewTransitionDirection.value = nextIdx > curIdx ? "next" : "prev";
  }
  viewMode.value = next;
}

function nextViewMode() {
  const curIdx = viewModes.indexOf(viewMode.value);
  const nextIdx = (curIdx + 1) % viewModes.length;
  setViewMode(viewModes[nextIdx], "next");
}

function prevViewMode() {
  const curIdx = viewModes.indexOf(viewMode.value);
  const prevIdx = (curIdx - 1 + viewModes.length) % viewModes.length;
  setViewMode(viewModes[prevIdx], "prev");
}

const currentModeLabel = computed(() => {
  switch (viewMode.value) {
    case "cards":
      return `${setKindLabel.value}图鉴`;
    case "chart":
      return "目标分布";
    case "farmingScore":
      return "刷取评分";
    default:
      return "";
  }
});

const currentModeSubLabel = computed(() => {
  switch (viewMode.value) {
    case "cards":
      return `共 ${props.sets.length} 套 · 左右滑动`;
    case "chart":
      return chartLoading.value ? "数据加载中…" : `${chartItems.value.length} 套 · 按目标人数`;
    case "farmingScore":
      return farmingLoading.value ? "评估穿戴中…" : `${farmingItems.value.length} 套 · 低分优先`;
    default:
      return "";
  }
});

const capsuleEl = ref<HTMLElement | null>(null);
const { dragStyle: capsuleDragStyle } = useCapsuleSwipe({
  element: capsuleEl,
  enabled: computed(() => mobile),
  onNext: nextViewMode,
  onPrev: prevViewMode,
});

const revisited = ref(false);
const targetCounts = ref<RelicSetTargetCount[]>([]);
const loadedTargetRevision = ref<number | undefined>(undefined);
const chartLoading = ref(false);
const chartError = ref("");
const farmingProfiles = ref<RelicSetFarmingProfile[]>([]);
const loadedFarmingRevision = ref<number | undefined>(undefined);
const farmingLoading = ref(false);
const farmingError = ref("");
let targetCountRequestId = 0;
let farmingRequestId = 0;

const chartItems = computed(() => sortRelicSetsByTargetCount(props.sets, targetCounts.value));
const maxTargetCount = computed(() => chartItems.value[0]?.targetCount ?? 0);
const farmingItems = computed(() => scoreRelicSetsForFarming(props.sets, farmingProfiles.value));
const setKindLabel = computed(() => (props.sets[0]?.kind === "planar" ? "位面饰品" : "遗器"));

async function loadTargetCounts(force = false) {
  if (
    !force &&
    targetCounts.value.length > 0 &&
    loadedTargetRevision.value === props.inventoryRevision
  ) {
    return;
  }
  const currentRequestId = ++targetCountRequestId;
  if (targetCounts.value.length === 0) chartLoading.value = true;
  chartError.value = "";
  try {
    const counts = await buildPlanApi.relicSetTargetCounts();
    if (currentRequestId !== targetCountRequestId) return;
    targetCounts.value = counts;
    loadedTargetRevision.value = props.inventoryRevision;
  } catch (cause) {
    if (currentRequestId !== targetCountRequestId) return;
    chartError.value = String(cause);
  } finally {
    if (currentRequestId === targetCountRequestId) chartLoading.value = false;
  }
}

async function loadFarmingProfiles(force = false) {
  if (
    !force &&
    farmingProfiles.value.length > 0 &&
    loadedFarmingRevision.value === props.inventoryRevision
  ) {
    return;
  }
  const currentRequestId = ++farmingRequestId;
  if (farmingProfiles.value.length === 0) farmingLoading.value = true;
  farmingError.value = "";
  try {
    const profiles = await buildPlanApi.relicSetFarmingProfiles();
    if (currentRequestId !== farmingRequestId) return;
    farmingProfiles.value = profiles;
    loadedFarmingRevision.value = props.inventoryRevision;
  } catch (cause) {
    if (currentRequestId !== farmingRequestId) return;
    farmingError.value = String(cause);
  } finally {
    if (currentRequestId === farmingRequestId) farmingLoading.value = false;
  }
}

watch(viewMode, (mode) => {
  if (mode === "chart") void loadTargetCounts();
  if (mode === "farmingScore") void loadFarmingProfiles();
});
const subMode = useMobileSubMode();
const capsuleHost = inject(catalogueCapsuleHostKey, undefined);
const teleportTarget = computed(() => capsuleHost?.value ?? null);
const keptAlive = ref(!props.preview);
const isActive = computed(() => !props.preview && keptAlive.value && (props.active ?? true));
const { host: topHeaderHost, enabled: useTopHeader } = useMobileTopHeaderTarget(
  "catalogue",
  isActive,
);
const {
  visibleItems: windowedSets,
  sentinel,
  hasMore,
} = useMobileListWindow({
  items: computed(() => props.sets),
  enabled: computed(() => mobile && !props.preview && viewMode.value === "cards"),
  active: isActive,
  rowHeight: 156,
  step: 10,
});
const visibleSets = computed(() => (props.preview ? props.sets.slice(0, 12) : windowedSets.value));
const topModeLabel = computed(() => {
  switch (viewMode.value) {
    case "cards":
      return "套装图鉴";
    case "chart":
      return "目标分布";
    case "farmingScore":
      return "刷取评分";
    default:
      return "";
  }
});

let cleanupSubMode: (() => void) | null = null;
function registerSubMode() {
  if (mobile && isActive.value) {
    cleanupSubMode?.();
    cleanupSubMode =
      subMode?.register({
        pageId: "catalogue",
        prev: prevViewMode,
        next: nextViewMode,
      }) ?? null;
  }
}
function unregisterSubMode() {
  cleanupSubMode?.();
  cleanupSubMode = null;
}

watch(
  isActive,
  (active) => {
    if (active) registerSubMode();
    else unregisterSubMode();
  },
  { immediate: true },
);

onActivated(() => {
  if (props.preview) return;
  keptAlive.value = true;
  if (viewMode.value === "chart") void loadTargetCounts();
  if (viewMode.value === "farmingScore") void loadFarmingProfiles();
});
onDeactivated(() => {
  if (props.preview) return;
  keptAlive.value = false;
  revisited.value = true;
});
watch(
  () => props.inventoryRevision,
  () => {
    if (!isActive.value) return;
    if (viewMode.value === "chart") void loadTargetCounts(true);
    if (viewMode.value === "farmingScore") void loadFarmingProfiles(true);
  },
);
onUnmounted(() => {
  unregisterSubMode();
  targetCountRequestId += 1;
  farmingRequestId += 1;
});

const ownedCount = (setId: number) => ownedCountOf(props.ownedCounts, setId);
</script>
<template>
  <div :class="['relic-catalogue-section', { 'is-revisited': revisited || preview }]">
    <Teleport v-if="mobile && useTopHeader && topHeaderHost" :to="topHeaderHost">
      <div class="mobile-relic-submode-bar" aria-live="polite">
        <button
          type="button"
          class="mobile-relic-submode-btn"
          :aria-label="`当前展示：${topModeLabel}，点击切换下一项`"
          @click="nextViewMode()"
        >
          <span>{{ topModeLabel }}</span>
          <span class="mobile-relic-submode-dots" aria-hidden="true">
            <i
              v-for="(mode, idx) in viewModes"
              :key="mode"
              :class="{ active: idx === viewModes.indexOf(viewMode) }"
            />
          </span>
        </button>
      </div>
    </Teleport>
    <div v-if="!mobile" class="relic-catalogue-toolbar">
      <div>
        <p class="relic-catalogue-kicker">SET TARGET PULSE</p>
        <strong>{{
          viewMode === "cards"
            ? `${setKindLabel}套装图鉴`
            : viewMode === "chart"
              ? "目标角色分布"
              : "刷取优先级"
        }}</strong>
      </div>
      <div class="relic-view-switch" role="group" :aria-label="`${setKindLabel}展示方式`">
        <button
          type="button"
          :class="{ active: viewMode === 'cards' }"
          :aria-pressed="viewMode === 'cards'"
          @click="setViewMode('cards')"
        >
          图鉴
        </button>
        <button
          type="button"
          :class="{ active: viewMode === 'chart' }"
          :aria-pressed="viewMode === 'chart'"
          @click="setViewMode('chart')"
        >
          目标分布
        </button>
        <button
          type="button"
          :class="{ active: viewMode === 'farmingScore' }"
          :aria-pressed="viewMode === 'farmingScore'"
          @click="setViewMode('farmingScore')"
        >
          刷取评分
        </button>
      </div>
    </div>

    <!-- 视图内容视口，支持移动端左右滑动过渡动效 -->
    <div class="relic-view-viewport">
      <Transition :name="mobile ? `slide-${viewTransitionDirection}` : undefined" mode="out-in">
        <!-- 按目标角色数量排序的套装柱状图 -->
        <div
          v-if="viewMode === 'chart'"
          key="chart"
          class="relic-target-chart"
          role="region"
          :aria-label="`${setKindLabel}目标角色数量`"
        >
          <div class="relic-target-chart-heading">
            <div>
              <p class="eyebrow">BUILD PLAN TARGETS</p>
              <h3>{{ setKindLabel }} · 设置为目标的角色数量</h3>
            </div>
            <small>数量倒序 · 共 {{ chartItems.length }} 套</small>
          </div>
          <p v-if="chartLoading" class="relic-target-chart-state">正在整理目标角色数据…</p>
          <p v-else-if="chartError" class="relic-target-chart-state error">{{ chartError }}</p>
          <p v-else-if="!chartItems.length" class="relic-target-chart-state">
            当前分类暂无套装数据。
          </p>
          <div v-else class="relic-target-chart-list">
            <button
              v-for="(item, index) in chartItems"
              :key="item.set.id"
              type="button"
              class="relic-target-bar-row"
              :style="{ '--bar-i': index }"
              :aria-label="`查看${item.set.name}，${item.targetCount}名目标角色`"
              @click="emit('select', item.set)"
            >
              <span class="relic-target-bar-rank">{{ String(index + 1).padStart(2, "0") }}</span>
              <span class="relic-target-bar-icon">
                <img v-if="item.set.image" :src="item.set.image" :alt="item.set.name" />
                <span v-else>◇</span>
              </span>
              <span class="relic-target-bar-name" :title="item.set.name">{{ item.set.name }}</span>
              <span class="relic-target-bar-track">
                <i
                  :style="{
                    width: `${maxTargetCount ? (item.targetCount / maxTargetCount) * 100 : 0}%`,
                  }"
                />
              </span>
              <b class="relic-target-bar-count">{{ item.targetCount }}<small>名</small></b>
              <span class="relic-target-bar-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <!-- 结合目标人数与当前穿戴质量的刷取优先分柱状图 -->
        <div
          v-else-if="viewMode === 'farmingScore'"
          key="farmingScore"
          class="relic-farming-viewport"
        >
          <MobileFarmingList
            v-if="mobile"
            :items="farmingItems"
            :kind-label="setKindLabel"
            :loading="farmingLoading"
            :error="farmingError"
            @select="emit('select', $event)"
            @retry="loadFarmingProfiles"
          />
          <div
            v-else
            class="relic-farming-chart"
            role="region"
            :aria-label="`${setKindLabel}刷取评分`"
          >
            <div class="relic-target-chart-heading relic-farming-chart-heading">
              <div>
                <p class="eyebrow">FARMING PRIORITY</p>
                <h3>{{ setKindLabel }} · 刷取优先分</h3>
              </div>
              <small>低分优先 · 共 {{ farmingItems.length }} 套</small>
            </div>
            <p class="relic-farming-chart-note">
              低分表示目标角色更多、当前套装质量更低，优先提升收益更高；柱长代表收益机会。
            </p>
            <p v-if="farmingLoading" class="relic-target-chart-state">正在评估当前穿戴质量…</p>
            <p v-else-if="farmingError" class="relic-target-chart-state error">
              {{ farmingError }}
            </p>
            <p v-else-if="!farmingItems.length" class="relic-target-chart-state">
              当前分类暂无套装数据。
            </p>
            <div v-else class="relic-target-chart-list">
              <button
                v-for="(item, index) in farmingItems"
                :key="item.set.id"
                type="button"
                :class="[
                  'relic-target-bar-row',
                  'relic-farming-bar-row',
                  `priority-${farmingPriorityClass(item.priorityScore)}`,
                ]"
                :style="{ '--bar-i': index }"
                :aria-label="`查看${item.set.name}，刷取优先分${formatFarmingPriority(item)}，${item.targetCount}名目标角色，当前质量${formatFarmingQuality(item)}`"
                @click="emit('select', item.set)"
              >
                <span class="relic-target-bar-rank">{{ String(index + 1).padStart(2, "0") }}</span>
                <span class="relic-target-bar-icon">
                  <img v-if="item.set.image" :src="item.set.image" :alt="item.set.name" />
                  <span v-else>◇</span>
                </span>
                <span class="relic-target-bar-name relic-farming-bar-name" :title="item.set.name">
                  <b>{{ item.set.name }}</b>
                </span>
                <span class="relic-target-bar-track">
                  <i :style="{ width: `${item.opportunityPct}%` }" />
                </span>
                <span class="relic-farming-bar-metrics">
                  <em
                    ><b>{{ item.targetCount }}</b> 名目标</em
                  >
                  <em
                    >质量 <b>{{ formatFarmingQuality(item) }}</b></em
                  >
                  <em
                    >覆盖 <b>{{ formatFarmingCoverage(item) }}</b> 件</em
                  >
                </span>
                <b class="relic-target-bar-count relic-farming-bar-score">
                  {{ formatFarmingPriority(item) }}<small>分</small>
                </b>
                <span class="relic-target-bar-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 现代星铁质感遗器网格 -->
        <div v-else class="catalogue-grid">
          <button
            v-for="(set, index) in visibleSets"
            :key="set.id"
            :class="['catalogue-card', `catalogue-card-${set.kind}`]"
            :style="{ '--row-i': Math.floor(index / 3) }"
            type="button"
            aria-haspopup="dialog"
            :aria-label="`查看推荐使用${set.name}的角色`"
            @click="emit('select', set)"
          >
            <!-- 头部行：左侧图标+标题，右侧持有Badge -->
            <div class="catalogue-card-top">
              <div class="catalogue-card-media">
                <div class="catalogue-media-box">
                  <img v-if="set.image" :src="set.image" :alt="set.name" />
                  <span v-else class="catalogue-placeholder">◇</span>
                </div>
                <div class="catalogue-title-wrap">
                  <h4>{{ set.name }}</h4>
                  <span class="catalogue-kind-badge">{{
                    set.kind === "planar" ? "位面饰品" : "隧洞遗器"
                  }}</span>
                </div>
                <small :class="['catalogue-owned', { empty: ownedCount(set.id) === 0 }]">
                  <template v-if="ownedCount(set.id) > 0"
                    >持有 <b>{{ ownedCount(set.id) }}</b> 件</template
                  >
                  <template v-else>未持有</template>
                </small>
              </div>
            </div>

            <!-- 效果描述全宽行列表 -->
            <div class="relic-effects-list">
              <div class="relic-effect-row">
                <span class="relic-piece-tag piece-2">2 件</span>
                <p class="relic-effect-desc">{{ set.effects.twoPiece }}</p>
              </div>
              <div v-if="set.effects.fourPiece" class="relic-effect-row">
                <span class="relic-piece-tag piece-4">4 件</span>
                <p class="relic-effect-desc">{{ set.effects.fourPiece }}</p>
              </div>
            </div>
          </button>
          <div v-if="hasMore" ref="sentinel" class="catalogue-window-sentinel" aria-hidden="true" />
        </div>
      </Transition>
    </div>

    <!-- Mobile Floating Glass Capsule (Apple Music Style Translucent Pill, hidden in unfolded-portrait) -->
    <Teleport :to="teleportTarget ?? 'body'" :disabled="!teleportTarget">
      <nav
        v-if="mobile && !preview && isActive"
        ref="capsuleEl"
        :class="['mobile-glass-capsule', `is-${viewMode}`]"
        aria-label="图鉴展示模式切换"
      >
        <button
          type="button"
          class="capsule-arrow-btn prev"
          aria-label="循环切换至上一模式"
          @click="prevViewMode()"
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
          :aria-label="`${currentModeLabel}，点击切换模式`"
          @click="nextViewMode()"
        >
          <Transition :name="`capsule-${viewTransitionDirection}`" mode="out-in">
            <div :key="viewMode" class="capsule-titles">
              <span class="capsule-title-main">{{ currentModeLabel }}</span>
              <span class="capsule-title-sub">{{ currentModeSubLabel }}</span>
            </div>
          </Transition>
          <div class="capsule-dots" aria-hidden="true">
            <span :class="{ active: viewMode === 'cards' }" />
            <span :class="{ active: viewMode === 'chart' }" />
            <span :class="{ active: viewMode === 'farmingScore' }" />
          </div>
        </div>

        <button
          type="button"
          class="capsule-arrow-btn next"
          aria-label="循环切换至下一模式"
          @click="nextViewMode()"
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
    </Teleport>
  </div>
</template>
