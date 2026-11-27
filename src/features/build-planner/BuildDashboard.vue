<script setup lang="ts">
import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import Button from "primevue/button";
import Drawer from "primevue/drawer";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import { buildPlanApi } from "@/shared/api/build-plan";
import { characterDisplayName } from "@/shared/catalogue";
import { slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import { useMobileTopHeaderTarget } from "@/shared/contracts/mobile-top-header";
import { useMobileView } from "@/shared/contracts/mobile-view";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import { useReadOnlyView } from "@/shared/contracts/view-mode";
import InlineSpinner from "@/shared/ui/InlineSpinner.vue";
import LoadingState from "@/shared/ui/LoadingState.vue";
import MobileFloatingSearch from "@/shared/ui/MobileFloatingSearch.vue";
import MobileSegmentedControl from "@/shared/ui/MobileSegmentedControl.vue";
import { useSheetDragDismiss } from "@/shared/ui/useSheetDragDismiss";
import {
  extractGameVersion,
  formatPlanUpdatedDate,
  formatPlanUpdatedDateTime,
  formatPlanVersionTag,
  isBuildPlanOutdated,
} from "@/shared/utils/build-plan-meta";
import { loadDisabledTraceNodes } from "@/shared/utils/trace-settings";
import type { BuildDashboardEntry } from "@/types";
import BuildCardDetails from "./BuildCardDetails.vue";
import BuildHoverTip from "./BuildHoverTip.vue";
import {
  BUILD_SORT_OPTIONS as SORT_OPTIONS,
  BUILD_STATUS_OPTIONS as STATUS_OPTIONS,
  characterInitial,
  evaluateDashboardEntry,
  filterAndSortDashboardCards,
  getCompletionClass,
  getProgressClass,
  orderedEntryIdsForDrag,
  planNote,
  type BuildSortMode,
  type BuildStatusFilter,
} from "./dashboard-evaluation";
import { formatBuildProgressValue } from "./progress";
import { qualityMainStatTip, qualityPassCountTip } from "./quality-tips";
import RelicPotentialRadar from "./RelicPotentialRadar.vue";
import { useDashboardDrag } from "./useDashboardDrag";

const readOnly = useReadOnlyView();
const mobile = useMobileView();
const emit = defineEmits<{
  editBuild: [characterId: number];
}>();
const { notice, summary, inventoryRevision } = useRuntimeContext();

const entries = shallowRef<BuildDashboardEntry[]>([]);
const loading = ref(true);
const error = ref("");
const exportingExcel = ref(false);
const importingExcel = ref(false);
const currentGameVersion = computed(() => extractGameVersion(summary?.value?.protocolVersion));

const search = ref("");
const sort = ref<BuildSortMode>("urgent");
const statusFilter = ref<BuildStatusFilter>("all");
const pageActive = ref(true);
const searchOpen = ref(false);
const filterOpen = ref(false);
const draftSort = ref<BuildSortMode>("urgent");
const draftStatus = ref<BuildStatusFilter>("all");
const floatingSearchRef = ref<InstanceType<typeof MobileFloatingSearch> | null>(null);
const { host: topHeaderHost, enabled: useTopHeader } = useMobileTopHeaderTarget(
  "build",
  pageActive,
);
const actionCharacterId = ref<number | null>(null);
const dashboardElement = ref<HTMLElement | null>(null);
const disabledTraceNodes = loadDisabledTraceNodes();
const selectedCharacterId = ref<number | null>(null);
let dashboardRequestId = 0;

const mobileActiveCount = computed(
  () => Number(sort.value !== "urgent") + Number(statusFilter.value !== "all"),
);
const mobileDraftCount = computed(
  () => Number(draftSort.value !== "urgent") + Number(draftStatus.value !== "all"),
);
const filterSheetDrag = useSheetDragDismiss(() => {
  filterOpen.value = false;
});
watch(filterOpen, (open) => {
  if (!open) filterSheetDrag.reset();
});
const currentSortLabel = computed(
  () => SORT_OPTIONS.find((item) => item.value === sort.value)?.label ?? "最需提升",
);
const currentStatusLabel = computed(
  () => STATUS_OPTIONS.find((item) => item.value === statusFilter.value)?.label ?? "全部",
);

function toggleMobileSearch() {
  if (searchOpen.value) floatingSearchRef.value?.dismissSearch();
  else {
    filterOpen.value = false;
    searchOpen.value = true;
  }
}
function openMobileFilter() {
  searchOpen.value = false;
  draftSort.value = sort.value;
  draftStatus.value = statusFilter.value;
  filterOpen.value = true;
}
function resetMobileDraft() {
  draftSort.value = "urgent";
  draftStatus.value = "all";
}
function applyMobileFilter() {
  sort.value = draftSort.value;
  statusFilter.value = draftStatus.value;
  filterOpen.value = false;
}
function resetMobileFilters() {
  searchOpen.value = false;
  filterOpen.value = false;
  search.value = "";
  sort.value = "urgent";
  statusFilter.value = "all";
}
function openDetails(characterId: number, event?: KeyboardEvent) {
  if (!mobile || event?.isComposing) return;
  event?.preventDefault();
  selectedCharacterId.value = characterId;
}
function setDetailsVisible(characterId: number, visible: boolean) {
  if (visible) selectedCharacterId.value = characterId;
  else if (selectedCharacterId.value === characterId) selectedCharacterId.value = null;
}

onActivated(() => {
  pageActive.value = true;
});
onDeactivated(() => {
  pageActive.value = false;
  searchOpen.value = false;
  filterOpen.value = false;
  selectedCharacterId.value = null;
});
onBeforeUnmount(() => {
  dashboardRequestId += 1;
});

const canDrag = computed(() => !readOnly && !search.value.trim() && !loading.value && !error.value);

const evaluatedEntries = computed(() =>
  entries.value.map((entry) => evaluateDashboardEntry(entry, disabledTraceNodes)),
);

const standingWarnings = computed(() =>
  evaluatedEntries.value.flatMap(({ entry, state }) =>
    !state.available &&
    (state.reason.startsWith("缺少属性输入：") || state.reason.startsWith("装备来源规则尚未审核："))
      ? [
          {
            characterId: entry.character.characterId,
            name: entry.character.name,
            reason: state.reason,
          },
        ]
      : [],
  ),
);

const cards = computed(() =>
  filterAndSortDashboardCards(evaluatedEntries.value, {
    search: search.value,
    status: statusFilter.value,
    sort: sort.value,
  }),
);

async function reorderDraggedCard(sourceId: number, targetId: number, visibleOrderIds: number[]) {
  if (readOnly) return;
  const source = entries.value.find((entry) => entry.character.characterId === sourceId);
  const target = entries.value.find((entry) => entry.character.characterId === targetId);
  if (!source || !target || source.pinned !== target.pinned) {
    return;
  }
  const ordered = orderedEntryIdsForDrag(entries.value, visibleOrderIds);
  const from = ordered.indexOf(sourceId);
  const to = ordered.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  actionCharacterId.value = targetId;
  sort.value = "custom";
  try {
    await buildPlanApi.reorderDashboard(ordered);
    notice.value = "排序已保存";
    await loadDashboard();
  } catch (cause) {
    error.value = String(cause);
  } finally {
    actionCharacterId.value = null;
  }
}

const { draggedCharacterId, dragOverCharacterId, pointerDragStart } = useDashboardDrag({
  dashboardElement,
  canDrag: () => canDrag.value && actionCharacterId.value === null,
  items: () =>
    cards.value.map((card) => ({
      characterId: card.character.characterId,
      pinned: card.entry.pinned,
    })),
  onDrop: ({ sourceId, targetId, visibleOrderIds }) =>
    reorderDraggedCard(sourceId, targetId, visibleOrderIds),
});

async function togglePinned(card: (typeof cards.value)[number]) {
  if (readOnly) return;
  actionCharacterId.value = card.character.characterId;
  try {
    await buildPlanApi.setDashboardPinned(card.character.characterId, !card.entry.pinned);
    notice.value = card.entry.pinned ? "已取消置顶" : "已置顶";
    await loadDashboard();
  } catch (cause) {
    error.value = String(cause);
  } finally {
    actionCharacterId.value = null;
  }
}

async function loadDashboard() {
  const requestId = ++dashboardRequestId;
  loading.value = true;
  error.value = "";
  try {
    const next = await buildPlanApi.dashboard();
    if (requestId === dashboardRequestId) entries.value = next;
  } catch (cause) {
    if (requestId === dashboardRequestId) error.value = String(cause);
  } finally {
    if (requestId === dashboardRequestId) loading.value = false;
  }
}

async function exportExcel() {
  if (exportingExcel.value) return;
  exportingExcel.value = true;
  try {
    const path = await buildPlanApi.exportExcel();
    if (path) notice.value = "操作完成";
  } catch (cause) {
    error.value = String(cause);
  } finally {
    exportingExcel.value = false;
  }
}

async function importExcel() {
  if (importingExcel.value) return;
  importingExcel.value = true;
  try {
    const result = await buildPlanApi.importExcel();
    if (result) {
      notice.value = "操作完成";
      await loadDashboard();
    }
  } catch (cause) {
    error.value = String(cause);
  } finally {
    importingExcel.value = false;
  }
}

let loadedRevision: number | undefined;
if (inventoryRevision) {
  watch(inventoryRevision, (rev) => {
    if (loadedRevision !== undefined && rev !== loadedRevision && pageActive.value) {
      loadedRevision = rev;
      void loadDashboard();
    }
  });
}

onActivated(() => {
  if (
    inventoryRevision &&
    loadedRevision !== undefined &&
    inventoryRevision.value !== loadedRevision
  ) {
    loadedRevision = inventoryRevision.value;
    void loadDashboard();
  }
});

onMounted(() => {
  loadedRevision = inventoryRevision?.value;
  void loadDashboard();
});
defineExpose({ reload: loadDashboard });
</script>

<template>
  <section ref="dashboardElement" class="build-dashboard">
    <Teleport :to="topHeaderHost ?? 'body'" :disabled="!useTopHeader">
      <div v-if="mobile" class="mobile-build-toolbar">
        <p class="mobile-build-subtitle">追踪已配置角色的当前站街属性与毕业目标。</p>
        <div
          class="mobile-inventory-inline-tools mobile-build-inline-tools"
          role="group"
          aria-label="毕业列表快捷工具"
        >
          <button
            v-if="Boolean(search.trim()) || mobileActiveCount > 0"
            type="button"
            class="mobile-inline-tool-clear"
            aria-label="清空搜索与筛选"
            title="清空"
            @click="resetMobileFilters()"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="m14.8 9.2-5.6 5.6M9.2 9.2l5.6 5.6" />
            </svg>
          </button>
          <button
            type="button"
            :class="{ 'is-active': searchOpen || Boolean(search.trim()) }"
            :aria-expanded="searchOpen"
            aria-label="搜索毕业角色"
            title="搜索"
            @click="toggleMobileSearch()"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
          </button>
          <button
            type="button"
            :class="{ 'is-active': filterOpen || mobileActiveCount > 0 }"
            aria-haspopup="dialog"
            :aria-expanded="filterOpen"
            :aria-label="
              mobileActiveCount ? `筛选与排序，已调整 ${mobileActiveCount} 项` : '筛选与排序'
            "
            title="筛选"
            @click="openMobileFilter()"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 17h16" />
              <circle cx="9" cy="7" r="2.5" />
              <circle cx="15" cy="17" r="2.5" />
            </svg>
            <b v-if="mobileActiveCount">{{ mobileActiveCount }}</b>
          </button>
        </div>
      </div>
    </Teleport>
    <div
      v-if="mobile && (Boolean(search.trim()) || mobileActiveCount > 0)"
      class="mobile-inventory-status mobile-build-status"
    >
      <p role="status">
        {{ cards.length }} 位角色<span v-if="sort !== 'urgent'"> · {{ currentSortLabel }}</span
        ><span v-if="statusFilter !== 'all'"> · {{ currentStatusLabel }}</span
        ><span v-if="search.trim()"> · 搜索“{{ search.trim() }}”</span>
      </p>
      <button type="button" @click="resetMobileFilters()">重置</button>
    </div>
    <header v-if="!mobile" class="build-dashboard-heading">
      <div>
        <p class="eyebrow">BUILD MANAGEMENT</p>
        <h2>毕业管理</h2>
        <p>追踪已配置角色的当前站街属性与毕业目标。</p>
      </div>
      <div class="build-dashboard-tools">
        <div v-if="!readOnly" class="build-plan-transfer-actions" aria-label="角色目标 Excel 操作">
          <button
            type="button"
            class="build-plan-transfer export"
            :disabled="exportingExcel || importingExcel"
            @click="exportExcel"
          >
            <InlineSpinner v-if="exportingExcel" size="xs" />
            <span v-else class="build-plan-transfer-icon" aria-hidden="true">↓</span>
            <span>{{ exportingExcel ? "导出中…" : "导出 Excel" }}</span>
          </button>
          <button
            type="button"
            class="build-plan-transfer import"
            :disabled="exportingExcel || importingExcel"
            @click="importExcel"
          >
            <InlineSpinner v-if="importingExcel" size="xs" />
            <span v-else class="build-plan-transfer-icon" aria-hidden="true">↑</span>
            <span>{{ importingExcel ? "导入中…" : "导入 Excel" }}</span>
          </button>
        </div>
        <InputText v-model="search" placeholder="搜索角色" /><Select
          v-model="sort"
          :options="[...SORT_OPTIONS]"
          option-label="label"
          option-value="value"
        />
        <small v-if="!readOnly" class="build-sort-hint">
          {{ search.trim() ? "清除搜索后可拖拽排序" : "拖动左侧手柄调整顺序" }}
        </small>
      </div>
    </header>
    <aside
      v-if="!loading && !error && standingWarnings.length"
      class="build-standing-warnings"
      aria-label="站街属性数据待补全"
    >
      <p>以下角色的站街属性暂不可计算：</p>
      <ul>
        <li v-for="warning in standingWarnings" :key="warning.characterId">
          {{ warning.name }}：{{ warning.reason }}
        </li>
      </ul>
    </aside>
    <LoadingState v-if="loading" variant="cards" label="正在汇总毕业进度…" :rows="4" />
    <p v-else-if="error" class="dashboard-state error">{{ error }}</p>
    <p v-else-if="!cards.length" class="dashboard-state">暂无具备完整站街属性的毕业方案。</p>
    <div v-else class="build-card-list" aria-label="毕业进度列表">
      <article
        v-for="card in cards"
        :key="card.character.characterId"
        :class="[
          'build-progress-row',
          { dragging: draggedCharacterId === card.character.characterId },
          { 'drag-over': dragOverCharacterId === card.character.characterId },
        ]"
        :data-character-id="card.character.characterId"
        :role="mobile ? 'button' : 'article'"
        :tabindex="mobile ? 0 : undefined"
        :aria-label="mobile ? `查看${characterDisplayName(card.character)}培养详情` : undefined"
        :aria-expanded="mobile ? selectedCharacterId === card.character.characterId : undefined"
        :aria-haspopup="mobile ? 'dialog' : undefined"
        @click="openDetails(card.character.characterId)"
        @keydown.enter="openDetails(card.character.characterId, $event)"
        @keydown.space="openDetails(card.character.characterId, $event)"
      >
        <header v-if="mobile" class="mobile-build-card">
          <div class="mobile-build-card-top">
            <div class="build-character-avatar mobile-build-avatar">
              <img v-if="card.image" :src="card.image" :alt="`${card.character.name} 头像`" />
              <span v-else>{{ characterInitial(card.character.name) }}</span>
            </div>
            <div class="mobile-build-title-block">
              <div class="mobile-build-name-row">
                <p>{{ characterDisplayName(card.character) }}</p>
              </div>
              <div class="mobile-build-submeta">
                <span
                  :class="[
                    'mobile-build-target-badge',
                    {
                      'is-done': card.targets.length > 0 && card.completed >= card.targets.length,
                    },
                  ]"
                >
                  {{ card.completed }}/{{ card.targets.length }} 达标
                </span>
                <span v-if="card.equippedLightCone" class="mobile-build-cone">
                  {{ card.equippedLightCone.name }}·叠影{{ card.equippedLightCone.superimposition }}
                </span>
                <span v-else class="mobile-build-cone is-empty">未装备光锥</span>
              </div>
            </div>
            <div :class="['mobile-build-score', getCompletionClass(card.quality.combinedRatio)]">
              <strong>{{ (card.quality.combinedRatio * 100).toFixed(0) }}<small>%</small></strong>
              <span>综合完成</span>
            </div>
            <svg
              class="mobile-build-chevron"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </div>
          <div
            :class="['mobile-build-progress-track', getCompletionClass(card.quality.combinedRatio)]"
            aria-hidden="true"
          >
            <span
              :style="{
                width: `${Math.min(100, Math.max(0, card.quality.combinedRatio * 100))}%`,
              }"
            />
          </div>
          <div class="mobile-build-stats">
            <div class="mobile-build-stat">
              <span>有效词条</span>
              <b>{{ card.effectiveTotal }}</b>
            </div>
            <div class="mobile-build-stat">
              <span>及格件数</span>
              <b>{{ card.quality.qualityPassCount }}/{{ card.quality.qualityTotal }}</b>
            </div>
            <div v-if="card.weakSlot" class="mobile-build-stat is-weak">
              <span>短板位置</span>
              <b>{{ slotLabel(card.weakSlot) }}</b>
            </div>
          </div>
          <div
            v-if="planNote(card.entry.plan)"
            class="build-card-note mobile-build-note"
            :title="planNote(card.entry.plan)"
            role="note"
            :aria-label="`${card.character.name}的培养备注`"
          >
            <span class="build-card-note-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </span>
            <p class="build-card-note-text">{{ planNote(card.entry.plan) }}</p>
          </div>
        </header>
        <header v-else class="build-card-header">
          <div class="build-card-identity">
            <button
              v-if="!readOnly"
              type="button"
              class="build-drag-handle"
              :disabled="!canDrag || actionCharacterId !== null"
              :aria-label="`拖动调整${card.character.name}顺序`"
              title="拖动调整顺序"
              @pointerdown="
                pointerDragStart(
                  { characterId: card.character.characterId, pinned: card.entry.pinned },
                  $event,
                )
              "
            >
              ⠿
            </button>
            <div class="build-character-avatar">
              <img v-if="card.image" :src="card.image" :alt="`${card.character.name} 头像`" />
              <span v-else>{{ characterInitial(card.character.name) }}</span>
            </div>
            <div class="build-character-info">
              <div class="build-character-title">
                <p>{{ mobile ? characterDisplayName(card.character) : card.character.name }}</p>
                <button
                  v-if="!readOnly"
                  type="button"
                  :class="['build-pin-inline', { pinned: card.entry.pinned }]"
                  :disabled="actionCharacterId !== null"
                  :aria-label="
                    card.entry.pinned
                      ? `取消${card.character.name}置顶`
                      : `置顶${card.character.name}`
                  "
                  :aria-pressed="card.entry.pinned"
                  title="置顶"
                  @click="togglePinned(card)"
                >
                  <svg v-if="card.entry.pinned" viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                    />
                  </svg>
                  <svg
                    v-else
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polygon
                      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                    ></polygon>
                  </svg>
                </button>
              </div>
              <div class="build-character-actions">
                <b>{{ card.completed }} / {{ card.targets.length }} 项达标</b>
                <span
                  v-if="formatPlanVersionTag(card.entry.plan.gameVersion)"
                  :class="[
                    'build-plan-version-badge',
                    {
                      'is-outdated': isBuildPlanOutdated(
                        card.entry.plan.gameVersion,
                        currentGameVersion,
                      ),
                    },
                  ]"
                >
                  {{ formatPlanVersionTag(card.entry.plan.gameVersion)
                  }}<template
                    v-if="isBuildPlanOutdated(card.entry.plan.gameVersion, currentGameVersion)"
                  >
                    · 旧版</template
                  >
                </span>
                <span
                  v-if="formatPlanUpdatedDate(card.entry.plan.updatedAt)"
                  class="build-plan-updated-meta"
                  :title="
                    formatPlanUpdatedDateTime(card.entry.plan.updatedAt)
                      ? `方案更新于 ${formatPlanUpdatedDateTime(card.entry.plan.updatedAt)}`
                      : undefined
                  "
                >
                  更新于 {{ formatPlanUpdatedDate(card.entry.plan.updatedAt) }}
                </span>
                <button
                  v-if="!readOnly"
                  type="button"
                  class="build-target-edit"
                  :aria-label="`编辑${card.character.name}的毕业目标`"
                  @click="emit('editBuild', card.character.characterId)"
                >
                  <span aria-hidden="true">✎</span> 编辑目标
                </button>
              </div>
            </div>
          </div>
          <div
            v-if="planNote(card.entry.plan)"
            class="build-card-note"
            :title="planNote(card.entry.plan)"
            role="note"
            :aria-label="`${card.character.name}的培养备注`"
          >
            <span class="build-card-note-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </span>
            <p class="build-card-note-text">{{ planNote(card.entry.plan) }}</p>
          </div>
          <div class="build-card-metrics">
            <div class="metric-box">
              <strong>{{ (card.quality.combinedRatio * 100).toFixed(0) }}%</strong>
              <span>综合完成</span>
            </div>
            <div class="metric-box">
              <strong>{{ card.effectiveTotal }}</strong>
              <span>有效词条</span>
            </div>
            <div v-if="card.weakSlot" class="metric-box weak">
              <strong>{{ slotLabel(card.weakSlot) }}</strong>
              <span>短板位置</span>
            </div>
          </div>
        </header>

        <BuildCardDetails
          :model-value="selectedCharacterId === card.character.characterId"
          :title="characterDisplayName(card.character)"
          :avatar="card.image"
          :summary="`${card.completed} / ${card.targets.length} 项达标 · 有效词条 ${card.effectiveTotal}`"
          :completion-pct="`${(card.quality.combinedRatio * 100).toFixed(0)}%`"
          :completion-class="getCompletionClass(card.quality.combinedRatio)"
          :can-edit="!readOnly"
          @update:model-value="setDetailsVisible(card.character.characterId, $event)"
          @edit="emit('editBuild', card.character.characterId)"
        >
          <div class="build-card-body">
            <div class="build-card-main">
              <div class="build-card-equipment">
                <div class="build-card-section light-cone-section">
                  <h4 class="section-title">当前光锥</h4>
                  <div
                    v-if="card.equippedLightCone"
                    class="equipped-light-cone"
                    :aria-label="`${card.equippedLightCone.name} Lv.${card.equippedLightCone.level} 叠影${card.equippedLightCone.superimposition}`"
                  >
                    <img
                      v-if="card.equippedLightCone.image"
                      :src="card.equippedLightCone.image"
                      :alt="card.equippedLightCone.name"
                    />
                    <span v-else class="equipped-light-cone-fallback">光</span>
                    <p>
                      <b>{{ card.equippedLightCone.name }}</b>
                      <em
                        >Lv.{{ card.equippedLightCone.level }} · 叠影
                        {{ card.equippedLightCone.superimposition }}</em
                      >
                    </p>
                  </div>
                  <p v-else class="equipped-light-cone empty muted">未装备光锥</p>
                </div>

                <div class="build-card-section sets-section">
                  <h4 class="section-title">遗器套装状态</h4>
                  <div
                    v-for="item in card.recommendedSets"
                    :key="item.set.id"
                    class="recommended-set"
                  >
                    <img v-if="item.set.image" :src="item.set.image" :alt="item.set.name" />
                    <span v-else class="recommended-set-fallback">遗</span>
                    <p>
                      {{ item.set.name }}
                      <b>{{ item.pieces }}件</b>
                    </p>
                    <span
                      :class="['recommended-set-status', { matched: item.matched }]"
                      role="img"
                      :aria-label="
                        item.matched
                          ? `${item.set.name}已装备${item.pieces}件`
                          : `${item.set.name}未装备${item.pieces}件`
                      "
                      >{{
                        mobile ? (item.matched ? "✓ 已配齐" : "× 未配齐") : item.matched ? "✓" : "×"
                      }}</span
                    >
                  </div>
                </div>
              </div>

              <div class="build-card-section progress-section">
                <h4 class="section-title">属性目标进度</h4>
                <div
                  v-for="target in card.targets"
                  :key="target.statKey"
                  :class="['target-progress-row', getProgressClass(target.percent)]"
                >
                  <div class="target-progress-label">
                    <b>{{ statLabel(target.statKey) }}</b>
                    <span v-if="target.percent !== null"
                      >{{ formatBuildProgressValue(target.statKey, target.current ?? 0) }} /
                      {{ target.target }}</span
                    >
                    <span v-else>不可映射</span>
                  </div>
                  <i><em :style="{ width: `${Math.min(target.percent ?? 0, 100)}%` }" /></i>
                  <small>
                    {{
                      (target.percent ?? 0) >= 100
                        ? "达标"
                        : `${target.percent?.toFixed(0) ?? "--"}%`
                    }}
                  </small>
                </div>
              </div>
            </div>

            <div class="build-card-side">
              <div class="build-card-section quality-section">
                <h4 class="section-title">部位合格状况</h4>
                <div class="quality-visuals">
                  <BuildHoverTip title="主属性" :text="qualityMainStatTip()">
                    <div class="quality-row">
                      <span class="quality-label has-tip">主属性</span>
                      <div
                        class="quality-segments"
                        :aria-label="`主属性正确 ${card.quality.mainStatCorrectCount} / ${card.quality.mainStatTotal}`"
                      >
                        <i
                          v-for="n in card.quality.mainStatTotal"
                          :key="'main' + n"
                          :class="{ active: n <= card.quality.mainStatCorrectCount }"
                        ></i>
                      </div>
                      <span class="quality-count"
                        >{{ card.quality.mainStatCorrectCount }}/{{
                          card.quality.mainStatTotal
                        }}</span
                      >
                    </div>
                  </BuildHoverTip>
                  <BuildHoverTip title="及格件数" :text="qualityPassCountTip(card.minPotentialPct)">
                    <div class="quality-row">
                      <span class="quality-label has-tip">及格件数</span>
                      <div
                        class="quality-segments"
                        :aria-label="`质量达标 ${card.quality.qualityPassCount} / ${card.quality.qualityTotal}`"
                      >
                        <i
                          v-for="n in card.quality.qualityTotal"
                          :key="'qual' + n"
                          :class="{ active: n <= card.quality.qualityPassCount }"
                        ></i>
                      </div>
                      <span class="quality-count"
                        >{{ card.quality.qualityPassCount }}/{{ card.quality.qualityTotal }}</span
                      >
                    </div>
                  </BuildHoverTip>
                </div>
              </div>

              <div class="build-card-section affix-section">
                <h4 class="section-title">有效词条分布</h4>
                <div class="affix-tags">
                  <template v-if="card.effective.length">
                    <div v-for="item in card.effective" :key="item.key" class="affix-tag">
                      <span class="affix-name">{{
                        statLabel(item.key).replace("百分比", "%")
                      }}</span>
                      <span class="affix-val">{{ item.count }}</span>
                    </div>
                  </template>
                  <span v-else class="muted">暂无命中词条</span>
                </div>
              </div>
            </div>

            <div class="build-card-radar-panel">
              <div class="build-card-section radar-section">
                <div class="radar-section-heading">
                  <BuildHoverTip
                    title="六件词条潜力拆解"
                    :text="card.diagnosis.explanationTip"
                    :width="340"
                  >
                    <h4 class="section-title radar-title-tip">
                      <span>六件词条潜力</span>
                      <i class="radar-tip-badge" aria-hidden="true">?</i>
                    </h4>
                  </BuildHoverTip>
                </div>
                <RelicPotentialRadar
                  :pieces="card.pieces"
                  :weak-slot="card.weakSlot"
                  :average-potential-pct="card.averagePotentialPct"
                  :min-potential-pct="card.minPotentialPct"
                  :show-breakdown="mobile"
                />
              </div>
            </div>
          </div>
          <div
            v-if="card.diagnosis.suggestions.length"
            class="build-card-suggestions"
            aria-label="提升建议"
          >
            <span class="build-suggestions-heading">提升建议</span>
            <ul class="build-suggestions-list">
              <li
                v-for="(item, idx) in card.diagnosis.suggestions"
                :key="`${item.label}-${idx}`"
                :class="['build-suggestion-item', `tone-${item.tone}`]"
              >
                <span class="build-suggestion-tag">{{ item.label }}</span>
                <span class="build-suggestion-text">{{ item.text }}</span>
              </li>
            </ul>
          </div>
        </BuildCardDetails>
      </article>
    </div>
    <Teleport v-if="mobile && pageActive" to="body">
      <div class="mobile-rail-tools" role="group" aria-label="毕业列表快捷工具">
        <button
          v-if="Boolean(search.trim()) || mobileActiveCount > 0"
          type="button"
          class="mobile-rail-tool mobile-rail-tool-clear"
          aria-label="清空搜索与筛选"
          @click="resetMobileFilters()"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="m14.8 9.2-5.6 5.6M9.2 9.2l5.6 5.6" />
          </svg>
          <span>清空</span>
        </button>
        <button
          type="button"
          class="mobile-rail-tool"
          :class="{ 'is-active': searchOpen || Boolean(search.trim()) }"
          :aria-expanded="searchOpen"
          aria-label="搜索毕业角色"
          @click="toggleMobileSearch()"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <span>搜索</span>
        </button>
        <button
          type="button"
          class="mobile-rail-tool"
          :class="{ 'is-active': filterOpen || mobileActiveCount > 0 }"
          aria-haspopup="dialog"
          :aria-expanded="filterOpen"
          :aria-label="
            mobileActiveCount ? `筛选与排序，已调整 ${mobileActiveCount} 项` : '筛选与排序'
          "
          @click="openMobileFilter()"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M4 17h16" />
            <circle cx="9" cy="7" r="2.5" />
            <circle cx="15" cy="17" r="2.5" />
          </svg>
          <span>筛选</span>
          <b v-if="mobileActiveCount">{{ mobileActiveCount }}</b>
        </button>
      </div>
    </Teleport>
    <MobileFloatingSearch
      v-if="mobile"
      ref="floatingSearchRef"
      v-model="search"
      v-model:open="searchOpen"
      placeholder="搜索角色"
      aria-label="搜索角色"
    />
    <Drawer
      v-if="mobile && pageActive"
      v-model:visible="filterOpen"
      position="bottom"
      block-scroll
      class="filter-drawer"
      aria-label="毕业排序与筛选"
    >
      <form @submit.prevent="applyMobileFilter()">
        <header class="filter-drawer-heading" v-on="filterSheetDrag.handlers">
          <div class="filter-drawer-title-row">
            <h2>排序与筛选</h2>
            <span v-if="mobileDraftCount > 0" class="mobile-filter-count-pill">
              已选 {{ mobileDraftCount }} 项
            </span>
          </div>
        </header>
        <div class="filter-scroll">
          <fieldset class="filter-group filter-group-wide">
            <legend>排序方式</legend>
            <div class="mobile-filter-card">
              <div class="mobile-filter-row">
                <MobileSegmentedControl
                  v-model="draftSort"
                  :options="SORT_OPTIONS"
                  aria-label="排序方式"
                />
              </div>
            </div>
          </fieldset>
          <fieldset class="filter-group filter-group-wide">
            <legend>达标状态</legend>
            <div class="mobile-filter-card">
              <div class="mobile-filter-row">
                <MobileSegmentedControl
                  v-model="draftStatus"
                  :options="STATUS_OPTIONS"
                  aria-label="达标状态"
                />
              </div>
            </div>
          </fieldset>
        </div>
        <div class="filter-actions">
          <Button class="filter-reset" type="button" outlined @click="resetMobileDraft()"
            >重置全部</Button
          >
          <Button class="filter-submit" type="submit">查看结果</Button>
        </div>
      </form>
    </Drawer>
  </section>
</template>

<style scoped src="./build-dashboard.css"></style>
