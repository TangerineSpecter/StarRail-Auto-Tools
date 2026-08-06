<script setup lang="ts">
import { computed } from "vue";
import { slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import type { RelicScoreResult } from "@/shared/utils/relic-score";
import type { RelicDetailData } from "./detail-types";
import EquippedRelicPeekCard from "./EquippedRelicPeekCard.vue";

const props = withDefaults(
  defineProps<{
    current: RelicDetailData;
    currentScore: RelicScoreResult;
    candidate: RelicDetailData;
    candidateScore: RelicScoreResult;
    deltaWeightedRolls: number;
    effectiveSubstats?: string[];
  }>(),
  { effectiveSubstats: () => [] },
);

const deltaPotential = computed(
  () => props.candidateScore.potentialPct - props.currentScore.potentialPct,
);

const allSubstatKeys = computed(() => {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of [
    ...props.currentScore.breakdown,
    ...props.candidateScore.breakdown,
  ]) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    keys.push(row.key);
  }
  // Preserve appearance order from current, then candidate-only keys.
  return keys;
});

const substatCompareRows = computed(() => {
  const currentMap = new Map(
    props.currentScore.breakdown.map((row) => [row.key, row.contribution]),
  );
  const candidateMap = new Map(
    props.candidateScore.breakdown.map((row) => [row.key, row.contribution]),
  );
  return allSubstatKeys.value.map((key) => {
    const current = currentMap.get(key) ?? 0;
    const candidate = candidateMap.get(key) ?? 0;
    return {
      key,
      current,
      candidate,
      delta: candidate - current,
      onlyCurrent: currentMap.has(key) && !candidateMap.has(key),
      onlyCandidate: candidateMap.has(key) && !currentMap.has(key),
    };
  });
});
</script>

<template>
  <div class="relic-replace-compare" role="document">
    <header class="relic-replace-compare-head">
      <div>
        <p class="eyebrow">REPLACE COMPARE</p>
        <h3>{{ slotLabel(current.slot) }}替换对比</h3>
      </div>
      <div class="relic-replace-compare-delta" aria-label="整体分差">
        <span>
          加权
          <b :class="{ up: deltaWeightedRolls > 0, down: deltaWeightedRolls < 0 }">
            {{ deltaWeightedRolls >= 0 ? "+" : "" }}{{ deltaWeightedRolls.toFixed(2) }}
          </b>
        </span>
        <span>
          潜力
          <b :class="{ up: deltaPotential > 0, down: deltaPotential < 0 }">
            {{ deltaPotential >= 0 ? "+" : "" }}{{ deltaPotential.toFixed(1) }}%
          </b>
        </span>
        <span>
          评级
          <b
            >{{ currentScore.letterGrade ?? "—" }} →
            {{ candidateScore.letterGrade ?? "—" }}</b
          >
        </span>
      </div>
    </header>

    <div class="relic-replace-compare-grid">
      <EquippedRelicPeekCard
        caption="当前装备"
        :relic="current"
        :letter-grade="currentScore.letterGrade"
        :potential-pct="currentScore.potentialPct"
        :weighted-rolls="currentScore.weightedRolls"
        :breakdown="currentScore.breakdown"
        :effective-substats="effectiveSubstats"
      />
      <EquippedRelicPeekCard
        caption="推荐替换"
        :relic="candidate"
        :letter-grade="candidateScore.letterGrade"
        :potential-pct="candidateScore.potentialPct"
        :weighted-rolls="candidateScore.weightedRolls"
        :breakdown="candidateScore.breakdown"
        :effective-substats="effectiveSubstats"
      />
    </div>

    <section
      v-if="substatCompareRows.length"
      class="relic-replace-compare-table"
      aria-label="词条评分横向对比"
    >
      <header>
        <h4>词条评分对比</h4>
        <small>加权贡献分 · 便于横向对照</small>
      </header>
      <div class="relic-replace-compare-table-head">
        <span>词条</span>
        <span>当前</span>
        <span>替换</span>
        <span>差值</span>
      </div>
      <div
        v-for="row in substatCompareRows"
        :key="row.key"
        class="relic-replace-compare-table-row"
      >
        <span>{{ statLabel(row.key) }}</span>
        <span :class="{ muted: row.onlyCandidate }">{{
          row.onlyCandidate ? "—" : row.current.toFixed(2)
        }}</span>
        <span :class="{ muted: row.onlyCurrent }">{{
          row.onlyCurrent ? "—" : row.candidate.toFixed(2)
        }}</span>
        <b :class="{ up: row.delta > 1e-6, down: row.delta < -1e-6 }">
          {{ row.delta >= 0 ? "+" : "" }}{{ row.delta.toFixed(2) }}
        </b>
      </div>
    </section>
  </div>
</template>
