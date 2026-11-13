<script setup lang="ts">
import { computed } from "vue";
import { pathIconSrc } from "@/shared/catalogue";
import { useMobileView } from "@/shared/contracts/mobile-view";
import { useSheetDragDismiss } from "@/shared/ui/useSheetDragDismiss";
import { formatBaseStat } from "@/shared/utils/display";
import { lightConeSkillEffect } from "@/shared/utils/standing-stats";
import type { LightConeCatalogueEntry } from "@/types";
import { useCloseOnEscape } from "./close-on-escape";
import { formatOwnedCount } from "./owned-counts";

const props = defineProps<{
  lightCone: LightConeCatalogueEntry;
  ownedCount: number;
}>();
const mobile = useMobileView();
const emit = defineEmits<{ close: [] }>();
useCloseOnEscape(() => emit("close"));
const sheetDrag = useSheetDragDismiss(() => emit("close"));

const skillName = computed(() => props.lightCone.skill?.name ?? "");
const firstEffect = computed(() => lightConeSkillEffect(props.lightCone.skill, 1));
const maxEffect = computed(() => lightConeSkillEffect(props.lightCone.skill, 5));
</script>
<template>
  <div class="catalogue-character-modal-backdrop" @click.self="emit('close')">
    <section
      class="lightcone-catalogue-modal"
      :class="{ 'lightcone-modal-mobile': mobile }"
      role="dialog"
      aria-modal="true"
      :aria-label="`${lightCone.name}的图鉴信息`"
    >
      <button
        v-if="!mobile"
        class="catalogue-character-modal-close"
        type="button"
        @click="emit('close')"
      >
        ×
      </button>
      <header
        :class="['lightcone-catalogue-modal-header', `rarity-${lightCone.rarity}`]"
        v-on="mobile ? sheetDrag.handlers : {}"
      >
        <span v-if="mobile" class="catalogue-modal-grabber" aria-hidden="true" />
        <div :class="['lightcone-header-cover', `rarity-${lightCone.rarity}`]">
          <img v-if="lightCone.image" :src="lightCone.image" :alt="lightCone.name" />
          <span v-else class="lightcone-header-fallback">◇</span>
          <span v-if="mobile" class="lightcone-header-bar" aria-hidden="true" />
        </div>
        <div class="lightcone-header-info">
          <p v-if="!mobile" class="eyebrow">LIGHT CONE ARCHIVE</p>
          <h2>{{ lightCone.name }}</h2>
          <div v-if="mobile" class="lightcone-mobile-meta">
            <span class="lightcone-meta-path">
              <img :src="pathIconSrc(lightCone.path)" alt="" />{{ lightCone.path }}
            </span>
            <span
              :class="['lightcone-meta-stars', `rarity-${lightCone.rarity}`]"
              :aria-label="`${lightCone.rarity} 星`"
              >{{ "★".repeat(lightCone.rarity) }}</span
            >
            <span :class="['lightcone-meta-owned', { 'is-owned': ownedCount > 0 }]">
              {{ formatOwnedCount(ownedCount, "把") }}
            </span>
          </div>
          <small v-else>{{ lightCone.path }} · {{ "★".repeat(lightCone.rarity) }}</small>
        </div>
      </header>
      <div class="lightcone-catalogue-modal-body">
        <!-- 基础属性模块 -->
        <section class="lightcone-catalogue-section">
          <header class="lightcone-section-header">
            <div>
              <p v-if="!mobile" class="eyebrow">LEVEL 80 · MAX ASCENSION</p>
              <h3>基础属性</h3>
            </div>
            <span v-if="mobile" class="lightcone-level-pill">满级 Lv.80</span>
            <span v-else class="lightcone-catalogue-owned-badge">
              {{ formatOwnedCount(ownedCount, "把") }}
            </span>
          </header>

          <div v-if="lightCone.baseStats" class="lightcone-base-stat-grid">
            <div class="lightcone-stat-item">
              <span class="stat-label">生命值</span>
              <b class="stat-value">{{ formatBaseStat(lightCone.baseStats.hp) }}</b>
              <small v-if="!mobile" class="stat-abbr">HP</small>
            </div>
            <div class="lightcone-stat-item">
              <span class="stat-label">攻击力</span>
              <b class="stat-value">{{ formatBaseStat(lightCone.baseStats.attack) }}</b>
              <small v-if="!mobile" class="stat-abbr">ATK</small>
            </div>
            <div class="lightcone-stat-item">
              <span class="stat-label">防御力</span>
              <b class="stat-value">{{ formatBaseStat(lightCone.baseStats.defense) }}</b>
              <small v-if="!mobile" class="stat-abbr">DEF</small>
            </div>
          </div>
          <p v-else class="lightcone-stat-empty">该光锥的基础属性尚未同步。</p>
        </section>

        <!-- 光锥技能模块 -->
        <section v-if="skillName" class="lightcone-catalogue-skill">
          <header class="lightcone-section-header">
            <div>
              <p v-if="!mobile" class="eyebrow">LIGHT CONE SKILL</p>
              <h3>{{ skillName }}</h3>
            </div>
            <span v-if="mobile" class="lightcone-skill-badge">光锥技能</span>
          </header>
          <div class="lightcone-skill-effects">
            <div v-if="firstEffect" class="lightcone-skill-rank-box">
              <span class="rank-pill">叠影 1</span>
              <p>{{ firstEffect }}</p>
            </div>
            <div
              v-if="maxEffect && maxEffect !== firstEffect"
              class="lightcone-skill-rank-box is-max"
            >
              <span class="rank-pill">叠影 5</span>
              <p>{{ maxEffect }}</p>
            </div>
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
  position: relative;
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
.lightcone-header-cover {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 76px;
  height: 76px;
}
.lightcone-header-cover img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.lightcone-header-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border: 1px dashed rgba(255, 255, 255, 0.56);
  font-size: 28px;
}
.lightcone-header-info {
  min-width: 0;
  flex: 1;
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
.lightcone-skill-effects {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lightcone-skill-rank-box {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 10px;
}
.lightcone-skill-rank-box .rank-pill {
  flex-shrink: 0;
  margin-top: 2px;
  padding: 2px 7px;
  border-radius: 5px;
  background: #eaf2fc;
  color: var(--blue);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.lightcone-skill-rank-box.is-max .rank-pill {
  background: #fdf0d5;
  color: #8f5306;
}
.lightcone-skill-rank-box p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.58;
}
/* Mobile catalogue modal redesign */
.lightcone-modal-mobile {
  border: 1px solid rgba(28, 49, 80, 0.1);
  background: #f4f7fc;
}
.catalogue-modal-grabber {
  position: absolute;
  top: 7px;
  left: 50%;
  transform: translateX(-50%);
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: rgba(28, 49, 80, 0.16);
}
.lightcone-modal-mobile .lightcone-catalogue-modal-header {
  min-height: 0;
  padding: 20px 16px 14px;
  gap: 12px;
  color: var(--ink);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafe 100%);
  border-bottom: 1px solid rgba(28, 49, 80, 0.07);
}
.lightcone-modal-mobile .lightcone-catalogue-modal-header.rarity-5 {
  background: linear-gradient(180deg, #fffdf7 0%, #f9fafc 100%);
}
.lightcone-modal-mobile .lightcone-catalogue-modal-header.rarity-4 {
  background: linear-gradient(180deg, #fbf9ff 0%, #f8f9fc 100%);
}
.lightcone-modal-mobile .lightcone-header-cover {
  width: 60px;
  height: 80px;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(28, 49, 80, 0.1);
  background: linear-gradient(155deg, #f3f6fb, #e5ebf5);
}
.lightcone-modal-mobile .lightcone-header-cover.rarity-5 {
  border-color: rgba(217, 147, 44, 0.3);
  background: linear-gradient(155deg, #fff8eb 0%, #f7e6c4 100%);
}
.lightcone-modal-mobile .lightcone-header-cover.rarity-4 {
  border-color: rgba(124, 92, 219, 0.24);
  background: linear-gradient(155deg, #f8f4ff 0%, #eadffd 100%);
}
.lightcone-modal-mobile .lightcone-header-cover.rarity-3 {
  border-color: rgba(60, 131, 206, 0.22);
  background: linear-gradient(155deg, #f1f7fe 0%, #dcebfb 100%);
}
.lightcone-modal-mobile .lightcone-header-cover img {
  width: 90%;
  height: 90%;
  filter: drop-shadow(0 3px 6px rgba(24, 38, 62, 0.14));
}
.lightcone-header-bar {
  position: absolute;
  inset: auto 0 0 0;
  height: 3px;
  background: #9fb0c6;
}
.lightcone-header-cover.rarity-5 .lightcone-header-bar {
  background: linear-gradient(90deg, #d98c24, #f4c86a);
}
.lightcone-header-cover.rarity-4 .lightcone-header-bar {
  background: linear-gradient(90deg, #7756d6, #ae92f5);
}
.lightcone-header-cover.rarity-3 .lightcone-header-bar {
  background: linear-gradient(90deg, #3c83ce, #78b7f0);
}
.lightcone-modal-mobile .lightcone-catalogue-modal-header h2 {
  margin: 0 0 7px;
  color: var(--ink);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.28;
}
.lightcone-mobile-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.lightcone-meta-path {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 6px;
  border-radius: 6px;
  background: #edf2f8;
  color: #415873;
  font-size: 11px;
  font-weight: 600;
}
.lightcone-meta-path img {
  width: 12px;
  height: 12px;
  object-fit: contain;
  filter: brightness(0) opacity(0.65);
}
.lightcone-meta-stars {
  color: #d68e1c;
  font-size: 12px;
  letter-spacing: 0.5px;
  line-height: 1;
}
.lightcone-meta-stars.rarity-4 {
  color: #845ed7;
}
.lightcone-meta-stars.rarity-3 {
  color: #3f84ce;
}
.lightcone-meta-owned {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: #edf2f7;
  color: #65788f;
  font-size: 11px;
  font-weight: 600;
}
.lightcone-meta-owned.is-owned {
  background: #e6f0fc;
  color: #1655b3;
}
.lightcone-modal-mobile .lightcone-catalogue-modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: none;
  padding: 14px;
}
.lightcone-modal-mobile .lightcone-catalogue-section,
.lightcone-modal-mobile .lightcone-catalogue-skill {
  margin: 0;
  padding: 13px 14px;
  border: 1px solid rgba(28, 49, 80, 0.07);
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(24, 43, 74, 0.03);
}
.lightcone-modal-mobile .lightcone-section-header {
  align-items: center;
  margin-bottom: 10px;
}
.lightcone-modal-mobile .lightcone-section-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.lightcone-level-pill,
.lightcone-skill-badge {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.lightcone-level-pill {
  background: #fef3dc;
  color: #93580a;
}
.lightcone-skill-badge {
  background: #eef4fc;
  color: #2f5b8f;
}
.lightcone-modal-mobile .lightcone-base-stat-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  padding: 10px 0;
  border: 1px solid rgba(36, 86, 166, 0.08);
  border-radius: 11px;
  background: #f5f8fd;
}
.lightcone-modal-mobile .lightcone-stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  padding: 0 8px;
  border: 0;
  border-right: 1px solid rgba(36, 86, 166, 0.1);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transform: none;
}
.lightcone-modal-mobile .lightcone-base-stat-grid > :last-child {
  border-right: 0;
}
.lightcone-modal-mobile .lightcone-stat-item .stat-label {
  color: #5c7089;
  font-size: 12px;
  line-height: 1.3;
}
.lightcone-modal-mobile .lightcone-stat-item .stat-value {
  color: #1655b3;
  font-size: 17px;
  font-weight: 800;
  line-height: 1.25;
}
.lightcone-modal-mobile .lightcone-skill-rank-box {
  grid-template-columns: 1fr;
  gap: 6px;
  padding: 10px 11px;
  border-radius: 10px;
  border: 1px solid rgba(36, 86, 166, 0.08);
  background: #f6f9fe;
}
.lightcone-modal-mobile .lightcone-skill-rank-box.is-max {
  background: #fffaf1;
  border-color: rgba(217, 147, 44, 0.16);
}
.lightcone-modal-mobile .lightcone-skill-rank-box .rank-pill {
  justify-self: start;
  margin-top: 0;
}
.lightcone-modal-mobile .lightcone-skill-rank-box p {
  color: #364962;
  font-size: 13px;
  line-height: 1.62;
}
</style>
