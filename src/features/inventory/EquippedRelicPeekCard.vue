<script setup lang="ts">
import { computed } from "vue";
import { relicImage } from "@/shared/catalogue";
import { formatStatValue, slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import {
  enhancementHitsOnLine,
  formatEnhancementHitBadge,
  usesEnhancementHitCount,
} from "@/shared/utils/relic-score";
import type { RelicDetailData } from "./detail-types";

const props = defineProps<{
  relic: RelicDetailData;
  letterGrade?: string | null;
  potentialPct?: number | null;
}>();

const enhancementMode = computed(() => usesEnhancementHitCount(props.relic.substats));

const substatRows = computed(() =>
  (props.relic.substats ?? []).map((stat, index) => {
    const hits = enhancementHitsOnLine(stat, { enhancementHits: enhancementMode.value });
    return {
      stat,
      index,
      hits,
      badge: formatEnhancementHitBadge(hits),
    };
  }),
);
</script>

<template>
  <article class="equipped-relic-peek" :aria-label="`${slotLabel(relic.slot)}当前装备`">
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
          <span class="detail-slot-tag">+{{ relic.level }}</span>
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
            { auxiliary: row.stat.kind !== 'normal' },
          ]"
        >
          <span class="detail-substat-name">{{ statLabel(row.stat.key) }}</span>
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
