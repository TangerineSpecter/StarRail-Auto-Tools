<script setup lang="ts">
import { computed } from "vue";
import { relicImage } from "@/shared/catalogue";
import { formatTime } from "@/shared/utils/display";
import {
  enhancementHitsOnLine,
  formatEnhancementHitBadge,
  usesEnhancementHitCount,
} from "@/shared/utils/relic-score";
import type { CharacterBuildPlan } from "@/types";
import { formatStatValue, slotLabel, statLabel } from "./options";
import type { RelicDetailData } from "./detail-types";
import RelicQualityCard from "./RelicQualityCard.vue";

const props = defineProps<{
  detail: RelicDetailData;
  plan?: CharacterBuildPlan | null;
  planLabel?: string;
}>();

const enhancementMode = computed(() => usesEnhancementHitCount(props.detail.substats));

const substatRows = computed(() =>
  (props.detail.substats ?? []).map((stat, index) => {
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
  <section class="relic-detail-card">
    <div class="relic-detail-identity">
      <div :class="['detail-icon-box', `rarity-${detail.rarity}`]">
        <img
          v-if="relicImage(detail.setId, detail.slot)"
          :src="relicImage(detail.setId, detail.slot)"
          :alt="slotLabel(detail.slot)"
          class="detail-piece-image"
        /><span v-else>{{ slotLabel(detail.slot).slice(0, 1) }}</span>
      </div>
      <div class="detail-identity-text">
        <p class="detail-set-name">{{ detail.setName }}</p>
        <h3>{{ detail.name }}</h3>
        <div class="detail-tags">
          <span class="detail-slot-tag">{{ slotLabel(detail.slot) }}</span>
          <div class="detail-rarity-stars detail-inline-stars" :aria-label="`${detail.rarity} 星`">
            <i v-for="value in detail.rarity" :key="value">✦</i>
          </div>
        </div>
      </div>
      <b :class="['detail-relic-level', { 'is-max': detail.level === 15 }]">+{{ detail.level }}</b>
    </div>
    <section class="detail-main-stat">
      <div class="stat-header">
        <p>主属性 <span>MAIN STAT</span></p>
      </div>
      <div class="stat-body">
        <strong>{{ statLabel(detail.mainStat) }}</strong
        ><b>+{{ formatStatValue(detail.mainStat, detail.mainStatValue) }}</b>
      </div>
    </section>
    <section class="detail-substats">
      <header>
        <div>
          <p class="eyebrow">SUB STATS</p>
          <h3>副属性</h3>
        </div>
        <small>{{ detail.substats?.length ?? 0 }} / 4</small>
      </header>
      <div v-if="substatRows.length" class="detail-substat-list">
        <div
          v-for="row in substatRows"
          :key="`${row.stat.kind}-${row.index}`"
          :class="[
            'detail-substat-row',
            `hit-${row.hits}`,
            { auxiliary: row.stat.kind !== 'normal' },
          ]"
        >
          <span class="detail-substat-name">{{ statLabel(row.stat.key) }}</span
          ><b class="detail-substat-value"
            >+{{ formatStatValue(row.stat.key, row.stat.value) }}</b
          >
          <div class="detail-substat-meta">
            <i v-if="row.badge" class="detail-hit-badge">{{ row.badge }}</i
            ><em v-if="row.stat.kind !== 'normal'">{{
              row.stat.kind === "reroll" ? "重铸" : "预览"
            }}</em>
          </div>
        </div>
      </div>
      <div v-else class="detail-empty-substats"><p>该遗器尚未记录副属性数据。</p></div>
    </section>
    <RelicQualityCard :detail="detail" :plan="plan" :plan-label="planLabel" />
    <footer class="relic-detail-footer">
      <div>
        <span>装备归属</span><b>{{ detail.location || "未装备" }}</b>
      </div>
      <div>
        <span>状态</span
        ><b>{{ detail.locked ? "已锁定" : detail.discard ? "已标记弃置" : "正常" }}</b>
      </div>
      <div>
        <span>更新于</span><b>{{ formatTime(detail.updatedAt) }}</b>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.detail-substats {
  margin-bottom: 24px;
}
</style>
