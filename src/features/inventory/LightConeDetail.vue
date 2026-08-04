<script setup lang="ts">
import { computed } from "vue";
import { lightConeById } from "@/shared/catalogue";
import { formatBaseStat, formatTime } from "@/shared/utils/display";
import { lightConeSkillEffect, staticSetStats } from "@/shared/utils/standing-stats";
import { pathLabel } from "./options";
import type { LightConeDetailData } from "./detail-types";

const props = defineProps<{ detail: LightConeDetailData }>();
const catalogueEntry = computed(() => lightConeById.get(props.detail.templateId));
const baseStats = computed(() => catalogueEntry.value?.baseStats);
const skillEffect = computed(() =>
  lightConeSkillEffect(catalogueEntry.value?.skill, props.detail.superimposition),
);
const standingBonuses = computed(() =>
  skillEffect.value ? staticSetStats([skillEffect.value]) : [],
);
const standingBonusLabel: Record<string, string> = {
  "HP%": "生命值",
  "ATK%": "攻击力",
  "DEF%": "防御力",
  "SPD%": "速度",
  "CRIT Rate": "暴击率",
  "CRIT DMG": "暴击伤害",
  "Effect Hit Rate": "效果命中",
  "Effect RES": "效果抵抗",
  "Break Effect": "击破特攻",
  "Outgoing Healing Boost": "治疗量加成",
  "Energy Regeneration Rate": "能量恢复效率",
  "Physical DMG Boost": "物理伤害提高",
  "Fire DMG Boost": "火属性伤害提高",
  "Ice DMG Boost": "冰属性伤害提高",
  "Lightning DMG Boost": "雷属性伤害提高",
  "Wind DMG Boost": "风属性伤害提高",
  "Quantum DMG Boost": "量子属性伤害提高",
  "Imaginary DMG Boost": "虚数属性伤害提高",
};
const formatStandingBonus = (key: string, value: number) => {
  const label = standingBonusLabel[key] ?? key;
  const percent = Math.round(value * 1000) / 10;
  const text = Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
  return `${label} +${text}%`;
};
</script>
<template>
  <section class="character-detail-card">
    <div class="character-identity">
      <img
        v-if="catalogueEntry?.image"
        class="lightcone-detail-avatar"
        :src="catalogueEntry.image ?? undefined"
        :alt="detail.name"
      />
      <div v-else class="path-seal">{{ pathLabel(catalogueEntry?.path ?? "").slice(0, 1) }}</div>
      <div>
        <p>{{ pathLabel(catalogueEntry?.path ?? "") }} · PATH</p>
        <h3>{{ detail.name }}</h3>
      </div>
      <b :class="{ 'is-max': detail.level === 80 }">Lv.{{ detail.level }}</b>
    </div>
    <div class="detail-rarity-stars">
      <i v-for="value in catalogueEntry?.rarity ?? 5" :key="value">✦</i>
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
    <section v-if="baseStats" class="character-data-section">
      <header>
        <div>
          <p class="eyebrow">LEVEL 80 · MAX ASCENSION</p>
          <h3>基础属性</h3>
        </div>
        <small>满级</small>
      </header>
      <div class="lightcone-base-stat-grid">
        <div>
          <span>生命值</span><b>{{ formatBaseStat(baseStats.hp) }}</b>
        </div>
        <div>
          <span>攻击力</span><b>{{ formatBaseStat(baseStats.attack) }}</b>
        </div>
        <div>
          <span>防御力</span><b>{{ formatBaseStat(baseStats.defense) }}</b>
        </div>
      </div>
    </section>
    <section v-if="skillEffect" class="character-data-section">
      <header>
        <div>
          <p class="eyebrow">LIGHT CONE SKILL</p>
          <h3>{{ catalogueEntry?.skill?.name || "光锥技能" }}</h3>
        </div>
        <small>叠影 {{ detail.superimposition }}</small>
      </header>
      <p class="lightcone-skill-effect">{{ skillEffect }}</p>
      <p v-if="standingBonuses.length" class="lightcone-standing-bonuses">
        站街计入：{{
          standingBonuses.map((stat) => formatStandingBonus(stat.key, stat.value)).join(" · ")
        }}
      </p>
      <p v-else class="lightcone-standing-bonuses muted">该叠影技能无自动计入的无条件站街加成。</p>
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
