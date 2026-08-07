<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import {
  estimateTbp,
  qualityTagFromScore,
  resolvePlanWeights,
  rerollPotential,
  scoreRelic,
  type EstTbpResult,
  type ScoreRelicInput,
} from "@/shared/utils/relic-score";
import type { CharacterBuildPlan } from "@/types";
import type { RelicDetailData } from "./detail-types";

const props = defineProps<{
  detail: RelicDetailData;
  plan?: CharacterBuildPlan | null;
  planLabel?: string;
}>();

const tbpEnabled = ref(false);
const tbpBusy = ref(false);
const tbpResult = ref<EstTbpResult | null>(null);
let tbpRequestId = 0;

const relicInput = computed<ScoreRelicInput>(() => ({
  slot: props.detail.slot,
  mainStat: props.detail.mainStat,
  rarity: props.detail.rarity,
  level: props.detail.level,
  setId: props.detail.setId,
  substats: props.detail.substats,
}));

const weights = computed(() =>
  resolvePlanWeights({
    substatWeights: props.plan?.substatWeights,
    effectiveSubstats: props.plan?.effectiveSubstats,
  }),
);

const score = computed(() =>
  scoreRelic(relicInput.value, weights.value, {
    allowedMainStats: props.plan?.mainStats,
  }),
);

const reroll = computed(() => rerollPotential(relicInput.value, weights.value));

const tag = computed(() =>
  qualityTagFromScore(score.value, {
    minPotentialPct: props.plan?.minPotentialPct ?? 40,
  }),
);

const tagLabel: Record<string, string> = {
  lock: "建议锁定",
  farm: "可继续刷",
  "discard-candidate": "分解候选",
};

watch(
  () => [props.detail.itemId, props.plan?.characterId, weights.value] as const,
  () => {
    tbpEnabled.value = false;
    tbpResult.value = null;
    tbpBusy.value = false;
    tbpRequestId += 1;
  },
);

function formatDays(days: number): string {
  if (!Number.isFinite(days)) return "∞";
  if (days < 1) return `${(days * 24).toFixed(0)} 小时`;
  return `${days.toFixed(1)} 天`;
}

async function computeTbp() {
  const requestId = ++tbpRequestId;
  tbpBusy.value = true;
  tbpEnabled.value = true;
  try {
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });
    if (requestId !== tbpRequestId) return;
    tbpResult.value = estimateTbp(relicInput.value, weights.value, {
      allowedMainStats: props.plan?.mainStats,
    });
  } finally {
    if (requestId === tbpRequestId) tbpBusy.value = false;
  }
}
</script>

<template>
  <section class="character-data-section score-panel relic-score-panel" aria-label="词条质量评分">
    <header>
      <div>
        <p class="eyebrow">STAT SCORE</p>
        <h3>词条质量</h3>
      </div>
      <b class="score-grade">{{ score.letterGrade ?? "—" }}</b>
    </header>
    <p class="score-disclaimer">
      评分衡量词条期望与稀有度，<strong>不是</strong>战斗伤害。{{
        planLabel ? `权重：${planLabel}` : "使用默认 / 方案权重。"
      }}
    </p>
    <div class="score-metric-grid score-metric-grid--4">
      <div>
        <span>潜力</span><b>{{ score.potentialPct.toFixed(1) }}%</b>
      </div>
      <div>
        <span>加权 Rolls</span><b>{{ score.weightedRolls.toFixed(2) }}</b>
      </div>
      <div>
        <span>完美度</span><b>{{ score.perfectionPct.toFixed(1) }}%</b>
      </div>
      <div>
        <span>标签</span><b>{{ tagLabel[tag] ?? tag }}</b>
      </div>
      <div>
        <span>主属性</span
        ><b>{{
          score.mainStatCorrect === null ? "未绑定方案" : score.mainStatCorrect ? "符合" : "不符"
        }}</b>
      </div>
    </div>
    <div class="score-subblock">
      <div class="score-subhead">
        <h4>预计开拓力（升级成本）</h4>
        <button type="button" class="score-action" :disabled="tbpBusy" @click="computeTbp">
          {{ tbpBusy ? "计算中…" : tbpEnabled ? "重新计算" : "计算刷本成本" }}
        </button>
      </div>
      <p v-if="!tbpEnabled" class="score-hint">
        完整 Estimated TBP 计算量较大，默认不自动运行，避免打开详情卡顿。
      </p>
      <div v-else-if="tbpResult" class="score-metric-grid score-metric-grid--4">
        <div>
          <span>升级期望</span><b>{{ formatDays(tbpResult.days) }}</b>
        </div>
        <div>
          <span>预计开拓力</span
          ><b>{{
            Number.isFinite(tbpResult.estTbp) ? Math.round(tbpResult.estTbp).toLocaleString() : "∞"
          }}</b>
        </div>
        <div>
          <span>刷本建议</span><b>{{ tbpResult.advice }}</b>
        </div>
        <div>
          <span>当前加权分</span><b>{{ tbpResult.scoreToBeat.toFixed(2) }}</b>
        </div>
      </div>
    </div>
    <div class="score-reroll">
      <span>重塑期望</span>
      <b :class="{ down: reroll.deltaPct < 0, up: reroll.deltaPct > 0 }"
        >{{ reroll.deltaPct >= 0 ? "+" : "" }}{{ reroll.deltaPct.toFixed(1) }}%</b
      >
      <small>{{ reroll.summary }}</small>
    </div>
    <ul v-if="score.breakdown.length" class="score-breakdown">
      <li v-for="row in score.breakdown" :key="row.key">
        <span>{{ statLabel(row.key) }}</span>
        <em>{{ row.rolls }} roll · w {{ row.weight.toFixed(2) }}</em>
        <b>{{ row.contribution.toFixed(2) }}</b>
      </li>
    </ul>
    <p v-else class="score-hint">当前权重下没有计入的副属性。</p>
    <p class="score-footer-meta">{{ slotLabel(detail.slot) }} · {{ statLabel(detail.mainStat) }}</p>
  </section>
</template>
