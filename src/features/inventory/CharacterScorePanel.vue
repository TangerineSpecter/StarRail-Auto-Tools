<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import InputNumber from "primevue/inputnumber";
import { inventoryApi } from "@/shared/api/inventory";
import { relicCatalogue } from "@/shared/catalogue";
import { slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import {
  averageCharacterPotential,
  characterFarmInvestment,
  farmingPriorityRows,
  letterGradeFromPotential,
  planQualityCompletion,
  planTargetSetIdsForSlot,
  rankSlotReplacements,
  resolvePlanWeights,
  scoreRelic,
  spdBreakpointHelper,
  type RelicScoreResult,
  type ScoreRelicInput,
} from "@/shared/utils/relic-score";
import type { CharacterBuildPlan, RelicListItem } from "@/types";
import type { CharacterDetailData, RelicDetailData } from "./detail-types";
import EquippedRelicPeekCard from "./EquippedRelicPeekCard.vue";
import RelicReplaceComparePopover from "./RelicReplaceComparePopover.vue";

const props = defineProps<{
  detail: CharacterDetailData;
  plan?: CharacterBuildPlan | null;
  /** Full character SPD from standing stats when available (not relic-only bonus). */
  currentSpd?: number | null;
}>();

const inventoryRelics = ref<RelicListItem[]>([]);
const inventoryLoaded = ref(false);
const inventoryBusy = ref(false);
const localSpdTarget = ref(0);
const farmEnabled = ref(false);
const farmBusy = ref(false);
const farmRows = ref<
  Array<{
    slot: string;
    letterGrade: string | null;
    weightedRolls: number;
    days: number;
    advice: string;
  }>
>([]);
const farmInvestment = ref<{
  bottleneckSlot: string | null;
  bottleneckDays: number;
  estimateDays: number;
} | null>(null);
const peek = ref<{
  slot: string;
  relic: RelicDetailData;
  letterGrade: string | null;
  potentialPct: number;
  weightedRolls: number;
} | null>(null);
const peekPopoverEl = ref<HTMLElement | null>(null);
const replaceCompare = ref<{
  itemId: number;
  current: RelicDetailData;
  currentScore: RelicScoreResult;
  candidate: RelicDetailData;
  candidateScore: RelicScoreResult;
  deltaWeightedRolls: number;
} | null>(null);
let farmRequestId = 0;

function listItemToDetail(item: RelicListItem): RelicDetailData {
  return {
    itemId: item.itemId,
    setId: item.setId,
    name: item.name,
    setName: item.setName,
    slot: item.slot,
    rarity: item.rarity,
    level: item.level,
    mainStat: item.mainStat,
    mainStatValue: item.mainStatValue,
    location: item.location,
    equippedCharacterId: item.equippedCharacterId,
    locked: item.locked,
    discard: item.discard,
    updatedAt: item.updatedAt,
    substats: item.substats,
  };
}

function candidateToDetail(
  relic: ScoreRelicInput & {
    itemId?: number;
    name?: string;
    setName?: string;
    setId?: number;
    mainStatValue?: number;
    location?: string;
    equippedCharacterId?: number | null;
    locked?: boolean;
    discard?: boolean;
    updatedAt?: number;
  },
): RelicDetailData {
  return {
    itemId: relic.itemId ?? 0,
    setId: relic.setId ?? 0,
    name: relic.name ?? "未知遗器",
    setName: relic.setName ?? "",
    slot: relic.slot,
    rarity: relic.rarity ?? 5,
    level: relic.level ?? 0,
    mainStat: relic.mainStat,
    mainStatValue: relic.mainStatValue ?? 0,
    location: relic.location ?? "",
    equippedCharacterId: relic.equippedCharacterId ?? null,
    locked: relic.locked ?? false,
    discard: relic.discard ?? false,
    updatedAt: relic.updatedAt ?? 0,
    substats: (relic.substats ?? []).map((stat, index) => ({
      kind: stat.kind ?? "normal",
      position: index,
      key: stat.key,
      value: stat.value ?? 0,
      count: stat.count ?? 0,
      step: stat.step ?? 0,
    })),
  };
}

watch(
  () => props.plan?.spdTarget,
  (value) => {
    localSpdTarget.value = value && value > 0 ? value : 0;
  },
  { immediate: true },
);

watch(
  () => props.detail.characterId,
  () => {
    farmRequestId += 1;
    farmEnabled.value = false;
    farmBusy.value = false;
    farmRows.value = [];
    farmInvestment.value = null;
    inventoryLoaded.value = false;
    inventoryRelics.value = [];
    closePeek();
    closeReplaceCompare();
  },
);

const weights = computed(() =>
  resolvePlanWeights({
    substatWeights: props.plan?.substatWeights,
    effectiveSubstats: props.plan?.effectiveSubstats,
  }),
);

const equippedInputs = computed<ScoreRelicInput[]>(() =>
  (props.detail.equippedRelics ?? []).map((relic) => ({
    slot: relic.slot,
    mainStat: relic.mainStat,
    rarity: relic.rarity,
    level: relic.level,
    setId: relic.setId,
    substats: relic.substats,
  })),
);

const summary = computed(() =>
  averageCharacterPotential(equippedInputs.value, weights.value, {
    allowedMainStats: props.plan?.mainStats,
  }),
);

const averageLetterGrade = computed(() =>
  letterGradeFromPotential(summary.value.averagePotentialPct),
);

const completion = computed(() =>
  planQualityCompletion(equippedInputs.value, weights.value, {
    allowedMainStats: props.plan?.mainStats,
    minPotentialPct: props.plan?.minPotentialPct ?? 40,
  }),
);

const equippedBySlot = computed(() => {
  const map = new Map<string, RelicDetailData>();
  for (const relic of props.detail.equippedRelics ?? []) {
    if (relic.slot) map.set(relic.slot, relic);
  }
  return map;
});

function closePeek() {
  peek.value = null;
}

function closeReplaceCompare() {
  replaceCompare.value = null;
}

function applySpdPreset(preset: number) {
  localSpdTarget.value = preset;
}

function gradeBadgeClass(grade: string | null): string {
  if (!grade) return "grade-none";
  if (grade.startsWith("SSS")) return "grade-sss";
  if (grade.startsWith("SS")) return "grade-ss";
  if (grade.startsWith("S+")) return "grade-sp";
  if (grade.startsWith("S")) return "grade-s";
  if (grade.startsWith("A")) return "grade-a";
  if (grade.startsWith("B")) return "grade-b";
  return "grade-c";
}

function adviceClass(advice: string): string {
  if (advice === "可停刷") return "is-stop";
  if (advice === "主属性不符") return "is-mismatch";
  if (advice === "优先刷") return "is-priority";
  return "is-continue";
}

const spdHelpIsMet = computed(() => {
  if (!spdHelp.value) return false;
  return spdHelp.value.note.includes("已达到") || spdHelp.value.note.includes("超过");
});

const spdHelpStatusClass = computed(() => {
  if (!spdHelp.value) return "";
  return spdHelpIsMet.value ? "is-met" : "is-gap";
});

function closeAllOverlays() {
  closePeek();
  closeReplaceCompare();
}


async function openPeek(
  event: MouseEvent,
  piece: {
    slot: string;
    letterGrade: string | null;
    potentialPct: number;
    weightedRolls: number;
  },
) {
  const relic = equippedBySlot.value.get(piece.slot);
  if (!relic) return;
  if (peek.value?.slot === piece.slot) {
    closePeek();
    return;
  }

  closeReplaceCompare();
  peek.value = {
    slot: piece.slot,
    relic,
    letterGrade: piece.letterGrade,
    potentialPct: piece.potentialPct,
    weightedRolls: piece.weightedRolls,
  };
}

function openReplaceCompare(item: {
  relic: ScoreRelicInput & {
    itemId?: number;
    name?: string;
    setName?: string;
    setId?: number;
    mainStatValue?: number;
    location?: string;
    equippedCharacterId?: number | null;
    locked?: boolean;
    discard?: boolean;
    updatedAt?: number;
  };
  score: RelicScoreResult;
  deltaWeightedRolls: number;
}) {
  const itemId = item.relic.itemId;
  if (itemId == null) return;
  if (replaceCompare.value?.itemId === itemId) {
    closeReplaceCompare();
    return;
  }

  const weakSlot = summary.value.weakSlot;
  if (!weakSlot) return;
  const current = equippedBySlot.value.get(weakSlot);
  if (!current) return;

  closePeek();
  const scoreOptions = { allowedMainStats: props.plan?.mainStats };
  const currentScore = scoreRelic(
    {
      slot: current.slot,
      mainStat: current.mainStat,
      rarity: current.rarity,
      level: current.level,
      setId: current.setId,
      substats: current.substats,
    },
    weights.value,
    scoreOptions,
  );

  // Prefer full list row when available (richer display fields).
  const listRow = inventoryRelics.value.find((row) => row.itemId === itemId);
  const candidate = listRow ? listItemToDetail(listRow) : candidateToDetail(item.relic);

  replaceCompare.value = {
    itemId,
    current,
    currentScore,
    candidate,
    candidateScore: item.score,
    deltaWeightedRolls: item.deltaWeightedRolls,
  };
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!peek.value && !replaceCompare.value) return;
  const target = event.target as Element | null;
  if (
    target?.closest(
      ".score-piece, .score-replace-item, .equipped-relic-peek-popover, .relic-replace-compare-popover",
    )
  ) {
    return;
  }
  // Backdrop of the centered compare modal.
  if (target?.closest(".relic-replace-compare-root")) {
    closeReplaceCompare();
    return;
  }
  closeAllOverlays();
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && !event.isComposing) {
    if (peek.value || replaceCompare.value) {
      event.stopPropagation();
      closeAllOverlays();
    }
  }
}

function onWindowScrollOrResize(event: Event) {
  // Centered compare modal stays put; only the equip-peek popover tracks viewport.
  if (!peek.value) return;
  // Capture-phase scroll fires for any scroller; keep popover open when scrolling its content.
  if (event.type === "scroll") {
    const target = event.target;
    if (target instanceof Element && target.closest(".equipped-relic-peek-popover")) {
      return;
    }
    if (target instanceof Node && peekPopoverEl.value?.contains(target)) {
      return;
    }
  }
  closePeek();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
  window.addEventListener("scroll", onWindowScrollOrResize, true);
  window.addEventListener("resize", onWindowScrollOrResize);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
  window.removeEventListener("scroll", onWindowScrollOrResize, true);
  window.removeEventListener("resize", onWindowScrollOrResize);
});

const relicSpdBonus = computed(() => {
  let spd = 0;
  for (const relic of props.detail.equippedRelics ?? []) {
    if (relic.mainStat === "SPD") spd += relic.mainStatValue ?? 0;
    for (const sub of relic.substats ?? []) {
      if ((!sub.kind || sub.kind === "normal") && sub.key === "SPD") spd += sub.value ?? 0;
    }
  }
  return spd;
});

const hasFullSpd = computed(
  () => typeof props.currentSpd === "number" && Number.isFinite(props.currentSpd),
);

const currentSpdForHelper = computed(() =>
  hasFullSpd.value ? (props.currentSpd as number) : relicSpdBonus.value,
);

const spdHelp = computed(() => {
  const target =
    localSpdTarget.value > 0
      ? localSpdTarget.value
      : (props.plan?.targets.find((t) => t.statKey === "SPD")?.target ?? 0);
  if (target <= 0) return null;
  if (hasFullSpd.value) {
    return {
      ...spdBreakpointHelper(currentSpdForHelper.value, target),
      mode: "total" as const,
    };
  }
  return {
    ...spdBreakpointHelper(0, target),
    mode: "gap-only" as const,
    note: `站街速度不可用：按「还差 ${target.toFixed(1)} 速」估算（约 ${Math.ceil(target / 2.6)} 条高 roll）。请装备满级光锥并同步基础属性以使用总速度对比。`,
  };
});

const replacementSetFilter = computed(() => {
  if (!summary.value.weakSlot) return null;
  return planTargetSetIdsForSlot(props.plan, summary.value.weakSlot);
});

const replacementSetNames = computed(() => {
  const ids = replacementSetFilter.value;
  if (!ids?.length) return [] as string[];
  return ids.map((id) => relicCatalogue.sets.find((set) => set.id === id)?.name ?? `套装#${id}`);
});

const replacements = computed(() => {
  if (!inventoryLoaded.value || !summary.value.weakSlot) return [];
  const weak = props.detail.equippedRelics?.find((r) => r.slot === summary.value.weakSlot);
  if (!weak) return [];
  const equipped: ScoreRelicInput = {
    slot: weak.slot,
    mainStat: weak.mainStat,
    substats: weak.substats,
  };
  const allowedSets = replacementSetFilter.value;
  const candidates = inventoryRelics.value
    .filter((item) => item.slot === weak.slot)
    .filter((item) => (allowedSets ? allowedSets.includes(item.setId) : true))
    .map((item) => ({
      slot: item.slot,
      mainStat: item.mainStat,
      rarity: item.rarity,
      level: item.level,
      setId: item.setId,
      substats: item.substats,
      itemId: item.itemId,
      name: item.name,
      setName: item.setName,
      mainStatValue: item.mainStatValue,
      location: item.location,
      equippedCharacterId: item.equippedCharacterId,
      locked: item.locked,
      discard: item.discard,
      updatedAt: item.updatedAt,
    }));
  return rankSlotReplacements(equipped, candidates, weights.value, {
    allowedMainStats: props.plan?.mainStats,
    requireSameMain: true,
    limit: 3,
  });
});

async function loadInventoryPool() {
  if (inventoryLoaded.value || inventoryBusy.value) return;
  inventoryBusy.value = true;
  try {
    const page = await inventoryApi.listRelics({ page: 1, pageSize: 200 });
    inventoryRelics.value = page.items;
    inventoryLoaded.value = true;
  } catch {
    inventoryLoaded.value = true;
  } finally {
    inventoryBusy.value = false;
  }
}

function formatDays(days: number): string {
  if (!Number.isFinite(days)) return "∞";
  return `${days.toFixed(1)} 天`;
}

/** Expensive Estimated TBP — only on demand so opening character detail stays fast. */
async function computeFarmPriority() {
  if (farmBusy.value || !equippedInputs.value.length) return;
  const requestId = ++farmRequestId;
  farmBusy.value = true;
  farmEnabled.value = true;
  try {
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });
    if (requestId !== farmRequestId) return;
    const rows = farmingPriorityRows(equippedInputs.value, weights.value, {
      allowedMainStats: props.plan?.mainStats,
    });
    if (requestId !== farmRequestId) return;
    farmRows.value = rows.map((row) => ({
      slot: row.slot,
      letterGrade: row.letterGrade,
      weightedRolls: row.weightedRolls,
      days: row.days,
      advice: row.advice,
    }));
    farmInvestment.value = characterFarmInvestment(
      rows.map((row) => ({ slot: row.slot, days: row.days })),
    );
  } finally {
    if (requestId === farmRequestId) farmBusy.value = false;
  }
}
</script>

<template>
  <section class="character-data-section score-panel" aria-label="词条质量与刷本分析">
    <header>
      <div>
        <p class="eyebrow">STAT SCORE</p>
        <h3>六件词条质量</h3>
      </div>
      <small v-if="equippedInputs.length"
        >{{ averageLetterGrade }} · 平均潜力 {{ summary.averagePotentialPct.toFixed(1) }}% ·
        启发式非伤害</small
      >
      <small v-else>需装备遗器</small>
    </header>

    <p class="score-disclaimer">
      词条评分衡量期望与稀有度，<strong>不是</strong>战斗伤害。刷本天数需手动计算，避免打开详情时卡顿。
    </p>

    <div v-if="!equippedInputs.length" class="score-empty">未装备遗器，无法汇总质量分。</div>
    <template v-else>
      <div class="score-metric-grid">
        <div>
          <span>平均评级</span>
          <b>{{ averageLetterGrade }}</b>
        </div>
        <div>
          <span>平均潜力</span>
          <b>{{ summary.averagePotentialPct.toFixed(1) }}%</b>
        </div>
        <div>
          <span>短板部位</span>
          <b>{{ summary.weakSlot ? slotLabel(summary.weakSlot) : "—" }}</b>
        </div>
        <div>
          <span>主属性正确</span>
          <b>{{ completion.mainStatCorrectCount }}/{{ completion.mainStatTotal }}</b>
        </div>
        <div>
          <span>质量达标</span>
          <b>{{ completion.qualityPassCount }}/{{ completion.qualityTotal }}</b>
        </div>
        <div>
          <span>综合完成</span>
          <b>{{ (completion.combinedRatio * 100).toFixed(0) }}%</b>
        </div>
      </div>

      <p class="score-hint">
        下方六格为各部位字母评级、潜力%与加权 Rolls；点击可查看当前装备遗器。仅<strong
          >潜力最低的短板部位</strong
        >会标「短板」（与等级字母无关）。
      </p>
      <div class="score-piece-grid">
        <button
          v-for="piece in summary.pieces"
          :key="piece.slot"
          type="button"
          :class="[
            'score-piece',
            {
              'is-weak-slot': piece.slot === summary.weakSlot,
              'is-open': peek?.slot === piece.slot,
            },
          ]"
          :aria-expanded="peek?.slot === piece.slot"
          aria-haspopup="dialog"
          :aria-controls="peek?.slot === piece.slot ? 'equipped-relic-peek-dialog' : undefined"
          :aria-label="`查看${slotLabel(piece.slot)}当前装备，${piece.letterGrade ?? '无评级'}，潜力 ${piece.potentialPct.toFixed(0)}%，加权 ${piece.weightedRolls.toFixed(2)}`"
          :disabled="!equippedBySlot.get(piece.slot)"
          @click="openPeek($event, piece)"
        >
          <div class="score-piece-top">
            <span>{{ slotLabel(piece.slot) }}</span>
            <em v-if="piece.slot === summary.weakSlot" class="score-piece-badge">短板</em>
          </div>
          <b>{{ piece.letterGrade ?? "—" }}</b>
          <small class="score-piece-metrics">
            <span>潜力 {{ piece.potentialPct.toFixed(0) }}%</span>
            <span>加权 {{ piece.weightedRolls.toFixed(2) }}</span>
          </small>
        </button>
      </div>

      <!-- Sub-block 1: 副本优先级（预计开拓力） -->
      <div class="score-subblock score-farm-block">
        <div class="score-subhead">
          <div class="score-subhead-title">
            <div>
              <h4>副本优先级（预计开拓力）</h4>
              <p class="score-subhead-desc">基于期望开销估算各部位优化收益与投入成本</p>
            </div>
          </div>
          <button
            type="button"
            class="score-action"
            :disabled="farmBusy"
            @click="computeFarmPriority"
          >
            <span v-if="farmBusy" class="score-spinner"></span>
            <span>{{ farmBusy ? "计算中…" : farmEnabled ? "重新计算" : "计算刷本成本" }}</span>
          </button>
        </div>

        <div v-if="!farmEnabled" class="score-notice-card">
          <p>完整 Estimated TBP 计算量较大，点击「计算刷本成本」后估算各部位期望天数。</p>
        </div>

        <template v-else-if="farmRows.length">
          <div class="score-priority-table-wrapper">
            <div class="score-priority-table" role="table" aria-label="刷本优先级">
              <div class="score-priority-head" role="row">
                <span role="columnheader">部位</span>
                <span role="columnheader">当前评级</span>
                <span role="columnheader">加权分</span>
                <span role="columnheader">期望天数</span>
                <span role="columnheader">培养建议</span>
              </div>
              <div
                v-for="row in farmRows"
                :key="row.slot"
                class="score-priority-row"
                :class="{ 'is-bottleneck': farmInvestment?.bottleneckSlot === row.slot }"
                role="row"
              >
                <span role="cell" class="score-cell-slot">
                  <span class="slot-dot"></span>
                  {{ slotLabel(row.slot) }}
                </span>
                <span role="cell">
                  <span :class="['score-grade-badge', gradeBadgeClass(row.letterGrade)]">
                    {{ row.letterGrade ?? "—" }}
                  </span>
                </span>
                <span role="cell" class="score-cell-weighted">
                  {{ row.weightedRolls.toFixed(2) }}
                </span>
                <span role="cell" class="score-cell-days">
                  {{ formatDays(row.days) }}
                </span>
                <span role="cell">
                  <span :class="['score-advice-pill', adviceClass(row.advice)]">
                    <i v-if="row.advice === '可停刷'">✓</i>
                    <i v-else-if="row.advice === '主属性不符'">✕</i>
                    <i v-else-if="row.advice === '优先刷'">↑</i>
                    <i v-else>↻</i>
                    {{ row.advice }}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div v-if="farmInvestment" class="score-farm-summary">
            <div class="summary-chip summary-chip--bottleneck">
              <span class="chip-label">瓶颈部位</span>
              <strong class="chip-value">
                {{ farmInvestment.bottleneckSlot ? slotLabel(farmInvestment.bottleneckSlot) : "—" }}
                ({{ formatDays(farmInvestment.bottleneckDays) }})
              </strong>
            </div>
            <div class="summary-chip summary-chip--estimate">
              <span class="chip-label">角色级预计投入</span>
              <strong class="chip-value">{{ formatDays(farmInvestment.estimateDays) }}</strong>
            </div>
          </div>
        </template>
      </div>

      <!-- Sub-block 2: 速度断点（目标速度阈值） -->
      <div class="score-subblock score-spd-block">
        <div class="score-subhead">
          <div class="score-subhead-title">
            <div>
              <h4>速度断点（目标速度阈值）</h4>
              <p class="score-subhead-desc">估算目标速度门槛所缺的副词条数量</p>
            </div>
          </div>
        </div>

        <div class="score-spd-content">
          <div class="score-spd-input-group">
            <div class="score-spd-field">
              <label>目标速度阈值 (SPD)</label>
              <InputNumber v-model="localSpdTarget" :min="0" :max="300" :step="1" placeholder="例如 134" />
            </div>

            <div class="score-spd-presets">
              <span class="presets-label">常用断点快捷选择：</span>
              <div class="presets-buttons">
                <button
                  v-for="preset in [120, 134, 143, 160]"
                  :key="preset"
                  type="button"
                  :class="['score-spd-preset-btn', { 'is-active': localSpdTarget === preset }]"
                  @click="applySpdPreset(preset)"
                >
                  {{ preset }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="spdHelp" class="score-spd-result-card" :class="spdHelpStatusClass">
            <div class="spd-result-header">
              <div class="spd-result-main">
                <template v-if="spdHelp.mode === 'total'">
                  <div class="spd-result-stats">
                    <span>当前站街 <b>{{ currentSpdForHelper.toFixed(1) }}</b></span>
                    <span class="spd-divider">/</span>
                    <span>目标 <b>{{ spdHelp.targetSpd }}</b></span>
                    <small v-if="relicSpdBonus > 0">（遗器约 +{{ relicSpdBonus.toFixed(1) }}）</small>
                  </div>
                </template>
                <template v-else>
                  <div class="spd-result-stats">
                    <span>目标缺口 <b>{{ spdHelp.targetSpd }}</b> 速（gap-only）</span>
                  </div>
                </template>
              </div>
            </div>
            <p class="spd-result-note">{{ spdHelp.note }}</p>
          </div>
          <div v-else class="score-notice-card">
            <p>填写目标阈值，或在培养方案中设置 SPD 属性目标 / 速度断点字段。</p>
          </div>

          <details class="score-spd-explanation">
            <summary>什么是速度断点？</summary>
            <p>
              「断点」= 你想达到的<strong>总速度门槛</strong>（如 134 / 143 / 160），用来估算还差多少速度副词条，<strong>不是</strong>「速度永远越高越好」。低速反击角色（克拉拉/云璃等）通常不必用此工具，权重模板请选「低速反击输出」。
            </p>
          </details>
        </div>
      </div>

      <!-- Sub-block 3: 短板部位替换 -->
      <div class="score-subblock score-replace-block">
        <div class="score-subhead">
          <div class="score-subhead-title">
            <div>
              <h4>短板部位替换</h4>
              <p class="score-subhead-desc">
                检索同部位、同主属性且加权分更高的候选遗器
              </p>
            </div>
          </div>
          <button
            type="button"
            class="score-action"
            :disabled="inventoryBusy"
            @click="loadInventoryPool"
          >
            <span v-if="inventoryBusy" class="score-spinner"></span>
            <span>
              {{
                inventoryBusy ? "检索中…" : inventoryLoaded ? "已加载候选" : "从背包检索可替换遗器"
              }}
            </span>
          </button>
        </div>

        <div v-if="replacementSetNames.length" class="score-filter-badge-bar">
          <span class="filter-tag">
            已限制目标套装：{{ replacementSetNames.join("、") }}
          </span>
        </div>

        <ul v-if="replacements.length" class="score-replace-list">
          <li v-for="item in replacements" :key="item.relic.itemId">
            <button
              type="button"
              class="score-replace-item"
              :class="{ 'is-open': replaceCompare?.itemId === item.relic.itemId }"
              :aria-expanded="replaceCompare?.itemId === item.relic.itemId"
              aria-haspopup="dialog"
              :aria-controls="
                replaceCompare?.itemId === item.relic.itemId
                  ? 'relic-replace-compare-dialog'
                  : undefined
              "
              :aria-label="`对比${slotLabel(summary.weakSlot ?? '')}当前装备与候选 #${item.relic.itemId}，加权 +${item.deltaWeightedRolls.toFixed(2)}，${item.score.letterGrade ?? '无评级'}`"
              @click="openReplaceCompare(item)"
            >
              <div class="replace-item-main">
                <span class="replace-item-id">#{{ item.relic.itemId }}</span>
                <span class="replace-item-name">{{ item.relic.setName || item.relic.name }}</span>
              </div>
              <div class="replace-item-metrics">
                <span class="delta-badge">+{{ item.deltaWeightedRolls.toFixed(2) }} ↑</span>
                <span :class="['score-grade-badge', gradeBadgeClass(item.score.letterGrade)]">
                  {{ item.score.letterGrade ?? "—" }}
                </span>
                <span class="compare-action-hint">对比 ➔</span>
              </div>
            </button>
          </li>
        </ul>
        <div v-else-if="inventoryLoaded" class="score-notice-card">
          <p>
            未找到符合条件的候选（同部位
            {{ replacementSetFilter?.length ? "· 目标套装" : "" }} · 主属性 · 更高加权分）。
          </p>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div
        v-if="peek"
        class="equipped-relic-peek-root"
        role="presentation"
        @pointerdown.self="closePeek"
      >
        <div
          id="equipped-relic-peek-dialog"
          ref="peekPopoverEl"
          class="equipped-relic-peek-popover"
          role="dialog"
          aria-modal="true"
          :aria-label="`${slotLabel(peek.slot)}当前装备`"
        >
          <EquippedRelicPeekCard
            :relic="peek.relic"
            :letter-grade="peek.letterGrade"
            :potential-pct="peek.potentialPct"
            :weighted-rolls="peek.weightedRolls"
            :effective-substats="plan?.effectiveSubstats ?? []"
          />
        </div>
      </div>
      <div
        v-if="replaceCompare"
        class="relic-replace-compare-root"
        role="presentation"
        @pointerdown.self="closeReplaceCompare"
      >
        <div
          id="relic-replace-compare-dialog"
          class="relic-replace-compare-popover"
          role="dialog"
          aria-modal="true"
          :aria-label="`${slotLabel(replaceCompare.current.slot)}替换对比`"
        >
          <RelicReplaceComparePopover
            :current="replaceCompare.current"
            :current-score="replaceCompare.currentScore"
            :candidate="replaceCompare.candidate"
            :candidate-score="replaceCompare.candidateScore"
            :delta-weighted-rolls="replaceCompare.deltaWeightedRolls"
            :effective-substats="plan?.effectiveSubstats ?? []"
          />
        </div>
      </div>
    </Teleport>
  </section>
</template>
