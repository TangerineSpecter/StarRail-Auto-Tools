<script setup lang="ts">
import { computed } from "vue";
import { formatBaseStat } from "@/shared/utils/display";
import { lightConeSkillEffect } from "@/shared/utils/standing-stats";
import type { LightConeCatalogueEntry } from "@/types";
import { useCloseOnEscape } from "./close-on-escape";
import { formatOwnedCount } from "./owned-counts";

const props = defineProps<{
  lightCone: LightConeCatalogueEntry;
  ownedCount: number;
}>();
const emit = defineEmits<{ close: [] }>();
useCloseOnEscape(() => emit("close"));

const skillName = computed(() => props.lightCone.skill?.name ?? "");
const firstEffect = computed(() => lightConeSkillEffect(props.lightCone.skill, 1));
const maxEffect = computed(() => lightConeSkillEffect(props.lightCone.skill, 5));
</script>
<template>
  <div class="catalogue-character-modal-backdrop" @click.self="emit('close')">
    <section
      class="lightcone-catalogue-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="`${lightCone.name}的图鉴信息`"
    >
      <button class="catalogue-character-modal-close" type="button" @click="emit('close')">
        ×
      </button>
      <header class="lightcone-catalogue-modal-header">
        <img v-if="lightCone.image" :src="lightCone.image" :alt="lightCone.name" />
        <span v-else>◇</span>
        <div>
          <p class="eyebrow">LIGHT CONE ARCHIVE</p>
          <h2>{{ lightCone.name }}</h2>
          <small>{{ lightCone.path }} · {{ "★".repeat(lightCone.rarity) }}</small>
        </div>
      </header>
      <div class="lightcone-catalogue-modal-body">
        <!-- 基础属性模块 -->
        <section class="lightcone-catalogue-section">
          <header class="lightcone-section-header">
            <div>
              <p class="eyebrow">LEVEL 80 · MAX ASCENSION</p>
              <h3>基础属性</h3>
            </div>
            <span class="lightcone-catalogue-owned-badge">
              {{ formatOwnedCount(ownedCount, "把") }}
            </span>
          </header>

          <div v-if="lightCone.baseStats" class="lightcone-base-stat-grid">
            <div class="lightcone-stat-item">
              <span class="stat-label">生命值</span>
              <b class="stat-value">{{ formatBaseStat(lightCone.baseStats.hp) }}</b>
              <small class="stat-abbr">HP</small>
            </div>
            <div class="lightcone-stat-item">
              <span class="stat-label">攻击力</span>
              <b class="stat-value">{{ formatBaseStat(lightCone.baseStats.attack) }}</b>
              <small class="stat-abbr">ATK</small>
            </div>
            <div class="lightcone-stat-item">
              <span class="stat-label">防御力</span>
              <b class="stat-value">{{ formatBaseStat(lightCone.baseStats.defense) }}</b>
              <small class="stat-abbr">DEF</small>
            </div>
          </div>
          <p v-else class="lightcone-stat-empty">该光锥的基础属性尚未同步。</p>
        </section>

        <!-- 光锥技能模块 -->
        <section v-if="skillName" class="lightcone-catalogue-skill">
          <header class="lightcone-section-header">
            <div>
              <p class="eyebrow">LIGHT CONE SKILL</p>
              <h3>{{ skillName }}</h3>
            </div>
          </header>
          <div class="lightcone-skill-effects">
            <p v-if="firstEffect"><b>叠影 1</b>{{ firstEffect }}</p>
            <p v-if="maxEffect && maxEffect !== firstEffect"><b>叠影 5</b>{{ maxEffect }}</p>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.lightcone-catalogue-modal {
  position: relative;
  width: min(560px, 100%);
  overflow: hidden;
  border: 1px solid rgba(196, 164, 94, 0.7);
  border-radius: 12px;
  background: #f6f9fd;
  box-shadow: 0 28px 70px rgba(8, 19, 39, 0.38);
  animation: catalogue-modal-in 200ms ease-out;
}
.lightcone-catalogue-modal-header {
  display: flex;
  align-items: center;
  gap: 17px;
  min-height: 132px;
  padding: 24px 66px 24px 28px;
  color: #fff;
  background:
    linear-gradient(125deg, #1e3659, #315e99 64%, #467ec5),
    radial-gradient(circle at 80% 0%, rgba(237, 203, 120, 0.34), transparent 42%);
}
.lightcone-catalogue-modal-header > img,
.lightcone-catalogue-modal-header > span {
  flex: 0 0 auto;
  width: 76px;
  height: 76px;
  object-fit: contain;
}
.lightcone-catalogue-modal-header > span {
  display: grid;
  place-items: center;
  border: 1px dashed rgba(255, 255, 255, 0.56);
  font-size: 28px;
}
.lightcone-catalogue-modal-header p,
.lightcone-catalogue-modal-header h2,
.lightcone-catalogue-modal-header small {
  margin: 0;
}
.lightcone-catalogue-modal-header .eyebrow {
  color: #f1d48a;
  font-size: 10px;
}
.lightcone-catalogue-modal-header h2 {
  margin: 5px 0 7px;
  font-size: 23px;
}
.lightcone-catalogue-modal-header small {
  color: rgba(255, 255, 255, 0.74);
  font-size: 11px;
}
.lightcone-catalogue-modal-body {
  max-height: min(520px, calc(100vh - 190px));
  overflow-y: auto;
  padding: 20px 24px 24px;
}

/* 模块头部通用样式 */
.lightcone-catalogue-section {
  margin-bottom: 16px;
}
.lightcone-section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 10px;
}
.lightcone-section-header .eyebrow {
  margin: 0;
  color: #9a7839;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.13em;
}
.lightcone-section-header h3 {
  margin: 3px 0 0;
  color: var(--ink);
  font-size: 16px;
  font-weight: 600;
}
.lightcone-catalogue-owned-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  color: var(--blue-deep);
  background: var(--blue-soft);
  font: 700 11px/1.3 var(--font-ui);
  border: 1px solid rgba(36, 86, 166, 0.15);
}

/* 基础属性精致卡片网格 */
.lightcone-base-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.lightcone-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 12px 8px 10px;
  border: 1px solid rgba(46, 80, 123, 0.14);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 2px 6px rgba(35, 75, 128, 0.04);
  transition:
    border-color 160ms ease,
    transform 160ms ease;
}
.lightcone-stat-item:hover {
  border-color: rgba(36, 86, 166, 0.35);
  transform: translateY(-1px);
}
.stat-label {
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 500;
  text-decoration: none !important;
  border: none !important;
  outline: none !important;
  user-select: none;
}
.stat-value {
  color: var(--blue);
  font-size: 21px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
  text-decoration: none !important;
}
.stat-abbr {
  color: #9aa7b8;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-decoration: none !important;
}
.lightcone-stat-empty {
  margin: 0;
  padding: 14px;
  border: 1px dashed rgba(46, 80, 123, 0.2);
  border-radius: 8px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}

/* 光锥技能模块 */
.lightcone-catalogue-skill {
  padding: 14px 16px;
  border: 1px solid rgba(46, 80, 123, 0.14);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 2px 6px rgba(35, 75, 128, 0.04);
}
.lightcone-skill-effects p {
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.55;
}
.lightcone-skill-effects p:first-child {
  margin-top: 6px;
}
.lightcone-skill-effects p b {
  display: inline-block;
  width: 48px;
  color: var(--blue);
  font-weight: 700;
}
</style>
