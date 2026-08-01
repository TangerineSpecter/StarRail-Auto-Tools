<script setup lang="ts">
import { lightConeById } from "@/shared/catalogue";
import { formatBaseStat, formatTime } from "@/shared/utils/display";
import { pathLabel } from "./options";
import type { LightConeDetailData } from "./detail-types";
const props = defineProps<{ detail: LightConeDetailData }>();
const catalogueEntry = () => lightConeById.get(props.detail.templateId);
const baseStats = () => catalogueEntry()?.baseStats;
</script>
<template>
  <section class="character-detail-card">
    <div class="character-identity">
      <img
        v-if="catalogueEntry()?.image"
        class="lightcone-detail-avatar"
        :src="catalogueEntry()?.image ?? undefined"
        :alt="detail.name"
      />
      <div v-else class="path-seal">{{ pathLabel(catalogueEntry()?.path ?? "").slice(0, 1) }}</div>
      <div>
        <p>{{ pathLabel(catalogueEntry()?.path ?? "") }} · PATH</p>
        <h3>{{ detail.name }}</h3>
      </div>
      <b :class="{ 'is-max': detail.level === 80 }">Lv.{{ detail.level }}</b>
    </div>
    <div class="detail-rarity-stars">
      <i v-for="value in lightConeById.get(detail.templateId)?.rarity ?? 5" :key="value">✦</i>
    </div>
    <div class="character-metrics">
      <div>
        <span>突破</span><b>{{ detail.ascension }}</b>
      </div>
      <div>
        <span>叠影</span><b>{{ detail.superimposition }}</b>
      </div>
      <div>
        <span>状态</span><b>{{ detail.locked ? "已锁定" : "正常" }}</b>
      </div>
    </div>
    <section v-if="baseStats()" class="character-data-section">
      <header>
        <div>
          <p class="eyebrow">LEVEL 80 · MAX ASCENSION</p>
          <h3>基础属性</h3>
        </div>
        <small>满级</small>
      </header>
      <div class="lightcone-base-stat-grid">
        <div>
          <span>生命值</span><b>{{ formatBaseStat(baseStats()!.hp) }}</b>
        </div>
        <div>
          <span>攻击力</span><b>{{ formatBaseStat(baseStats()!.attack) }}</b>
        </div>
        <div>
          <span>防御力</span><b>{{ formatBaseStat(baseStats()!.defense) }}</b>
        </div>
      </div>
    </section>
    <footer class="relic-detail-footer">
      <div>
        <span>装备归属</span><b>{{ detail.location || "未装备" }}</b>
      </div>
      <div>
        <span>更新于</span><b>{{ formatTime(detail.updatedAt) }}</b>
      </div>
      <div>
        <span>数据来源</span><b>{{ detail.source === "network" ? "游戏同步" : "识别导入" }}</b>
      </div>
    </footer>
  </section>
</template>
