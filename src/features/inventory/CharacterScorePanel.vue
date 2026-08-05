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
  planQualityCompletion,
  planTargetSetIdsForSlot,
  rankSlotReplacements,
  resolvePlanWeights,
  spdBreakpointHelper,
  type ScoreRelicInput,
} from "@/shared/utils/relic-score";
import type { CharacterBuildPlan, RelicListItem } from "@/types";
import type { CharacterDetailData, RelicDetailData } from "./detail-types";
import EquippedRelicPeekCard from "./EquippedRelicPeekCard.vue";

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
  top: number;
  left: number;
  placeAbove: boolean;
} | null>(null);
const peekPopoverEl = ref<HTMLElement | null>(null);
let farmRequestId = 0;

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

async function openPeek(
  event: MouseEvent,
  piece: { slot: string; letterGrade: string | null; potentialPct: number },
) {
  const relic = equippedBySlot.value.get(piece.slot);
  if (!relic) return;
  if (peek.value?.slot === piece.slot) {
    closePeek();
    return;
  }

  const trigger = event.currentTarget as HTMLElement;
  const rect = trigger.getBoundingClientRect();
  const width = 320;
  const gap = 8;
  const preferredBelowHeight = 220;
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const spaceBelow = window.innerHeight - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  const placeAbove = spaceBelow < preferredBelowHeight && spaceAbove > spaceBelow;

  peek.value = {
    slot: piece.slot,
    relic,
    letterGrade: piece.letterGrade,
    potentialPct: piece.potentialPct,
    top: placeAbove ? rect.top - gap : rect.bottom + gap,
    left,
    placeAbove,
  };

  await nextTick();
  const popoverEl = peekPopoverEl.value;
  if (!popoverEl || !peek.value) return;
  const height = popoverEl.getBoundingClientRect().height;
  if (peek.value.placeAbove) {
    const minBottom = 12 + height;
    if (peek.value.top < minBottom) {
      peek.value = { ...peek.value, top: minBottom };
    }
  } else {
    const maxTop = window.innerHeight - height - 12;
    if (peek.value.top > maxTop) {
      peek.value = { ...peek.value, top: Math.max(12, maxTop) };
    }
  }
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!peek.value) return;
  const target = event.target as Element | null;
  if (target?.closest(".score-piece, .equipped-relic-peek-popover")) return;
  closePeek();
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") closePeek();
}

function onWindowScrollOrResize(event: Event) {
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
      substats: item.substats,
      itemId: item.itemId,
      name: item.name,
      setName: item.setName,
      setId: item.setId,
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
        >平均潜力 {{ summary.averagePotentialPct.toFixed(1) }}% · 启发式非伤害</small
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
        下方六格为各部位字母评级与潜力%；点击可查看当前装备遗器。仅<strong>潜力最低的短板部位</strong>会标「短板」（与等级字母无关）。
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
          :aria-label="`查看${slotLabel(piece.slot)}当前装备`"
          :disabled="!equippedBySlot.get(piece.slot)"
          @click="openPeek($event, piece)"
        >
          <div class="score-piece-top">
            <span>{{ slotLabel(piece.slot) }}</span>
            <em v-if="piece.slot === summary.weakSlot" class="score-piece-badge">短板</em>
          </div>
          <b>{{ piece.letterGrade ?? "—" }}</b>
          <small>潜力 {{ piece.potentialPct.toFixed(0) }}%</small>
        </button>
      </div>

      <div class="score-subblock">
        <div class="score-subhead">
          <h4>刷本优先级（预计开拓力）</h4>
          <button
            type="button"
            class="score-action"
            :disabled="farmBusy"
            @click="computeFarmPriority"
          >
            {{ farmBusy ? "计算中…" : farmEnabled ? "重新计算" : "计算刷本成本" }}
          </button>
        </div>
        <p v-if="!farmEnabled" class="score-hint">
          完整 Estimated TBP 计算量较大，点击后再估算各部位期望天数。
        </p>
        <template v-else-if="farmRows.length">
          <div class="score-priority-table">
            <div class="score-priority-head">
              <span>部位</span><span>等级</span><span>加权</span><span>期望</span><span>建议</span>
            </div>
            <div v-for="row in farmRows" :key="row.slot" class="score-priority-row">
              <span>{{ slotLabel(row.slot) }}</span>
              <span>{{ row.letterGrade ?? "—" }}</span>
              <span>{{ row.weightedRolls.toFixed(2) }}</span>
              <span>{{ formatDays(row.days) }}</span>
              <span>{{ row.advice }}</span>
            </div>
          </div>
          <p v-if="farmInvestment" class="score-hint">
            瓶颈：{{
              farmInvestment.bottleneckSlot ? slotLabel(farmInvestment.bottleneckSlot) : "—"
            }}
            （{{ formatDays(farmInvestment.bottleneckDays) }}）· 角色级投入估
            {{ formatDays(farmInvestment.estimateDays) }}
          </p>
        </template>
      </div>

      <div class="score-subblock">
        <h4>速度断点（目标速度阈值）</h4>
        <p class="score-hint">
          「断点」= 你想达到的<strong>总速度门槛</strong>（如 134 / 143 / 160），用来估算还差多少速度副词条，<strong>不是</strong>「速度永远越高越好」。低速反击角色（克拉拉/云璃等）通常不必用此工具，权重模板请选「低速反击输出」。
        </p>
        <div class="score-spd">
          <label>
            <span>目标速度阈值</span>
            <InputNumber v-model="localSpdTarget" :min="0" :max="300" :step="1" />
          </label>
          <div v-if="spdHelp" class="score-spd-result">
            <p v-if="spdHelp.mode === 'total'">
              当前站街 <b>{{ currentSpdForHelper.toFixed(1) }}</b> · 目标
              <b>{{ spdHelp.targetSpd }}</b>
              <small v-if="relicSpdBonus > 0">（遗器约 +{{ relicSpdBonus.toFixed(1) }}）</small>
            </p>
            <p v-else>
              目标缺口 <b>{{ spdHelp.targetSpd }}</b> 速（gap-only）
            </p>
            <p>{{ spdHelp.note }}</p>
          </div>
          <p v-else class="score-hint">
            填写目标阈值，或在培养方案中设置 SPD 属性目标 / 速度断点字段。
          </p>
        </div>
      </div>

      <div class="score-subblock">
        <div class="score-subhead">
          <h4>短板部位替换</h4>
          <button
            type="button"
            class="score-action"
            :disabled="inventoryBusy"
            @click="loadInventoryPool"
          >
            {{
              inventoryBusy ? "检索中…" : inventoryLoaded ? "已加载候选" : "从背包检索可替换遗器"
            }}
          </button>
        </div>
        <p class="score-hint">
          仅同部位、同主属性且加权分更高的件。
          <template v-if="replacementSetNames.length">
            已限制为培养方案目标套装：{{ replacementSetNames.join("、") }}。
          </template>
          <template v-else>方案未配置目标套装时，在背包同部位中检索。</template>
        </p>
        <ul v-if="replacements.length" class="score-replace-list">
          <li v-for="item in replacements" :key="item.relic.itemId">
            <span>#{{ item.relic.itemId }} {{ item.relic.setName || item.relic.name }}</span>
            <em>+{{ item.deltaWeightedRolls.toFixed(2) }}</em>
            <b>{{ item.score.letterGrade ?? "—" }}</b>
          </li>
        </ul>
        <p v-else-if="inventoryLoaded" class="score-hint">
          未找到符合条件的候选（同部位
          {{ replacementSetFilter?.length ? "· 目标套装" : "" }} · 主属性 · 更高加权分）。
        </p>
      </div>
    </template>

    <Teleport to="body">
      <div
        v-if="peek"
        ref="peekPopoverEl"
        id="equipped-relic-peek-dialog"
        class="equipped-relic-peek-popover"
        :class="{ 'place-above': peek.placeAbove }"
        role="dialog"
        aria-modal="false"
        :aria-label="`${slotLabel(peek.slot)}当前装备`"
        :style="{ top: `${peek.top}px`, left: `${peek.left}px` }"
      >
        <EquippedRelicPeekCard
          :relic="peek.relic"
          :letter-grade="peek.letterGrade"
          :potential-pct="peek.potentialPct"
        />
      </div>
    </Teleport>
  </section>
</template>
