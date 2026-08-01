<script setup lang="ts">
import { relicImage } from "@/shared/catalogue";
import { formatTime } from "@/shared/utils/display";
import { formatStatValue, slotLabel, statLabel } from "./options";
import type { RelicDetailData } from "./detail-types";
defineProps<{ detail: RelicDetailData }>();
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
          <span class="detail-slot-tag">{{ slotLabel(detail.slot) }}</span
          ><span class="detail-id-tag">#{{ detail.itemId }}</span>
        </div>
      </div>
      <b :class="['detail-relic-level', { 'is-max': detail.level === 15 }]">+{{ detail.level }}</b>
    </div>
    <div class="detail-rarity-stars" :aria-label="`${detail.rarity} 星`">
      <i v-for="value in detail.rarity" :key="value">✦</i>
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
      <div v-if="detail.substats?.length" class="detail-substat-list">
        <div
          v-for="(stat, index) in detail.substats"
          :key="`${stat.kind}-${index}`"
          :class="[
            'detail-substat-row',
            `hit-${stat.count}`,
            { auxiliary: stat.kind !== 'normal' },
          ]"
        >
          <span class="detail-substat-name">{{ statLabel(stat.key) }}</span
          ><b class="detail-substat-value">+{{ formatStatValue(stat.key, stat.value) }}</b>
          <div class="detail-substat-meta">
            <i v-if="stat.count" class="detail-hit-badge">{{
              stat.count === 5 ? "MAX" : `+${stat.count}`
            }}</i
            ><em v-if="stat.kind !== 'normal'">{{ stat.kind === "reroll" ? "重铸" : "预览" }}</em>
          </div>
        </div>
      </div>
      <div v-else class="detail-empty-substats"><p>该遗器尚未记录副属性数据。</p></div>
    </section>
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
