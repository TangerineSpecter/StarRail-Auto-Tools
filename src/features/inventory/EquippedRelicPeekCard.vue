<script setup lang="ts">
import { computed } from "vue";
import { relicImage } from "@/shared/catalogue";
import { formatStatValue, slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import {
  enhancementHitsOnLine,
  formatEnhancementHitBadge,
  usesEnhancementHitCount,
  type WeightedRollBreakdown,
} from "@/shared/utils/relic-score";
import type { RelicDetailData } from "./detail-types";

const props = withDefaults(
  defineProps<{
    relic: RelicDetailData;
    letterGrade?: string | null;
    potentialPct?: number | null;
    weightedRolls?: number | null;
    /** Per-substat score rows from scoreRelic().breakdown */
    breakdown?: WeightedRollBreakdown[];
    /** Plan “有效词条”; wanted lines get a flowing border (not a fill color). */
    effectiveSubstats?: string[];
    /** Optional column caption, e.g. 当前装备 / 推荐替换 */
    caption?: string;
  }>(),
  { effectiveSubstats: () => [], breakdown: () => [] },
);

const enhancementMode = computed(() => usesEnhancementHitCount(props.relic.substats));

const effectiveKeys = computed(() => new Set(props.effectiveSubstats ?? []));

const breakdownByKey = computed(() => {
  const map = new Map<string, WeightedRollBreakdown>();
  for (const row of props.breakdown ?? []) {
    map.set(row.key, row);
  }
  return map;
});

const hasScoreMetrics = computed(
  () =>
    props.letterGrade != null ||
    props.potentialPct != null ||
    props.weightedRolls != null,
);

const substatRows = computed(() =>
  (props.relic.substats ?? []).map((stat, index) => {
    const hits = enhancementHitsOnLine(stat, { enhancementHits: enhancementMode.value });
    const isEffective =
      (!stat.kind || stat.kind === "normal") && effectiveKeys.value.has(stat.key);
    const scoreRow =
      !stat.kind || stat.kind === "normal" ? breakdownByKey.value.get(stat.key) : undefined;
    return {
      stat,
      index,
      hits,
      badge: formatEnhancementHitBadge(hits),
      isEffective,
      contribution: scoreRow?.contribution ?? null,
      rolls: scoreRow?.rolls ?? null,
      weight: scoreRow?.weight ?? null,
    };
  }),
);

const showSubstatScore = computed(() => (props.breakdown?.length ?? 0) > 0);
</script>

<template>
  <article
    class="equipped-relic-peek"
    :class="{ 'has-substat-score': showSubstatScore }"
    :aria-label="caption ? `${caption} · ${slotLabel(relic.slot)}` : `${slotLabel(relic.slot)}当前装备`"
  >
    <p v-if="caption" class="equipped-relic-peek-caption">{{ caption }}</p>
    <header class="equipped-relic-peek-identity">
      <div :class="['detail-icon-box', `rarity-${relic.rarity}`]">
        <img
          v-if="relicImage(relic.setId, relic.slot)"
          :src="relicImage(relic.setId, relic.slot)"
          :alt="slotLabel(relic.slot)"
          class="detail-piece-image"
        />
        <span v-else>{{ slotLabel(relic.slot).slice(0, 1) }}</span>
      </div>
      <div class="equipped-relic-peek-text">
        <p class="detail-set-name">{{ relic.setName || "未知套装" }}</p>
        <h3>{{ relic.name }}</h3>
        <div class="detail-tags">
          <span class="detail-slot-tag">{{ slotLabel(relic.slot) }}</span>
          <span
            v-if="letterGrade != null || potentialPct != null"
            class="equipped-relic-peek-score"
          >
            {{ letterGrade ?? "—" }}
            <template v-if="potentialPct != null">
              · 潜力 {{ potentialPct.toFixed(0) }}%
            </template>
          </span>
        </div>
      </div>
      <b :class="['detail-relic-level', { 'is-max': relic.level === 15 }]">+{{ relic.level }}</b>
    </header>

    <div class="detail-rarity-stars equipped-relic-peek-stars" :aria-label="`${relic.rarity} 星`">
      <i v-for="value in relic.rarity" :key="value">✦</i>
    </div>

    <div v-if="hasScoreMetrics" class="equipped-relic-peek-metrics" aria-label="词条质量摘要">
      <div>
        <span>评级</span>
        <b>{{ letterGrade ?? "—" }}</b>
      </div>
      <div>
        <span>潜力</span>
        <b>{{ potentialPct != null ? `${potentialPct.toFixed(1)}%` : "—" }}</b>
      </div>
      <div>
        <span>加权分</span>
        <b>{{ weightedRolls != null ? weightedRolls.toFixed(2) : "—" }}</b>
      </div>
    </div>

    <section class="equipped-relic-peek-main">
      <div class="stat-header">
        <p>主属性 <span>MAIN STAT</span></p>
      </div>
      <div class="stat-body">
        <strong>{{ statLabel(relic.mainStat) }}</strong>
        <b>+{{ formatStatValue(relic.mainStat, relic.mainStatValue) }}</b>
      </div>
    </section>

    <section class="equipped-relic-peek-subs">
      <header>
        <div>
          <p class="eyebrow">SUB STATS</p>
          <h3>副属性</h3>
        </div>
        <small>{{ relic.substats?.length ?? 0 }} / 4</small>
      </header>
      <div v-if="substatRows.length" class="detail-substat-list">
        <div
          v-for="row in substatRows"
          :key="`${row.stat.kind}-${row.stat.key}-${row.index}`"
          :class="[
            'detail-substat-row',
            `hit-${row.hits}`,
            {
              auxiliary: row.stat.kind !== 'normal',
              'is-effective': row.isEffective,
            },
          ]"
        >
          <span class="detail-substat-name">
            {{ statLabel(row.stat.key) }}
            <i
              v-if="row.contribution != null"
              class="detail-substat-score-tag"
              :title="
                row.rolls != null && row.weight != null
                  ? `${row.rolls} roll · w ${row.weight.toFixed(2)}`
                  : undefined
              "
              >{{ row.contribution.toFixed(2) }}</i
            >
          </span>
          <b class="detail-substat-value"
            >+{{ formatStatValue(row.stat.key, row.stat.value) }}</b
          >
          <div class="detail-substat-meta">
            <i v-if="row.badge" class="detail-hit-badge">{{ row.badge }}</i>
            <em v-if="row.stat.kind !== 'normal'">{{
              row.stat.kind === "reroll" ? "重铸" : "预览"
            }}</em>
          </div>
        </div>
      </div>
      <div v-else class="detail-empty-substats">
        <p>该遗器尚未记录副属性数据。</p>
      </div>
    </section>
  </article>
</template>
