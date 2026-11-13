<script setup lang="ts">
import { computed } from "vue";
import { characterDisplayName, pathIconSrc, resolveCharacterCatalogue } from "@/shared/catalogue";
import { pathLabel } from "./options";
import type { CharacterListItem } from "@/types";

const props = defineProps<{ item: CharacterListItem }>();

const AVATAR_COLORS = ["#1ea2e8", "#e84a4a", "#8740e5", "#33b061", "#f0a21d", "#e0427f"];

const entry = computed(() =>
  resolveCharacterCatalogue({
    characterId: props.item.characterId,
    name: props.item.name,
    path: props.item.path,
  }),
);
const label = computed(() =>
  characterDisplayName({
    characterId: props.item.characterId,
    name: props.item.name,
    path: props.item.path,
  }),
);
const rarity = computed(() => entry.value?.rarity ?? 5);
const eidolonTone = computed(() => {
  if (props.item.eidolon >= 6) return "is-max";
  if (props.item.eidolon > 0) return "is-active";
  return "";
});
const fallbackColor = computed(() => {
  let hash = 0;
  for (let index = 0; index < props.item.name.length; index += 1) {
    hash = props.item.name.charCodeAt(index) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
});
</script>

<template>
  <div class="inventory-character-mobile-card">
    <div :class="['character-card-cover', `rarity-${rarity}`]">
      <img
        v-if="entry?.image"
        :src="entry.image"
        :alt="`${label} 头像`"
        class="character-card-portrait"
      />
      <span v-else class="character-card-fallback" :style="{ background: fallbackColor }">
        {{ item.name.charAt(0) }}
      </span>
      <span class="character-cover-bar" aria-hidden="true" />
    </div>

    <div class="character-card-main">
      <div class="character-card-heading">
        <strong class="character-card-title">{{ label }}</strong>
        <span :class="['character-card-level', { 'is-max': item.level === 80 }]">
          Lv.{{ item.level }}
        </span>
      </div>

      <div class="character-card-meta">
        <span v-if="entry?.element" :class="['character-card-element', `elem-${entry.element}`]">
          <img v-if="entry.elementIcon" :src="entry.elementIcon" :alt="entry.element" />
          <span>{{ entry.element }}</span>
        </span>
        <span class="character-card-path">
          <img :src="pathIconSrc(item.path)" alt="" />
          <span>{{ pathLabel(item.path) }}</span>
        </span>
        <span :class="['character-card-stars', `rarity-${rarity}`]" :aria-label="`${rarity} 星`">
          {{ "★".repeat(rarity) }}
        </span>
      </div>

      <div class="character-card-footer">
        <span :class="['character-card-eidolon', eidolonTone]">
          <span>星魂</span><b>E{{ item.eidolon }}</b>
        </span>
        <span v-if="item.hasBuildPlan" class="character-card-plan is-configured"> ✓ 已设目标 </span>
        <span v-else class="character-card-detail-hint">档案详情 ›</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inventory-character-mobile-card {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
}
.character-card-cover {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 76px;
  overflow: hidden;
  border-radius: 11px;
  border: 1px solid rgba(28, 49, 80, 0.08);
  background: linear-gradient(155deg, #f3f6fb, #e5ebf5);
}
.character-card-cover.rarity-5 {
  border-color: rgba(217, 147, 44, 0.3);
  background: linear-gradient(155deg, #fff9ec 0%, #f7e6c4 100%);
}
.character-card-cover.rarity-4 {
  border-color: rgba(124, 92, 219, 0.24);
  background: linear-gradient(155deg, #f8f4ff 0%, #eadffd 100%);
}
.character-card-portrait {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
}
.character-card-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #ffffff;
  font-size: 26px;
  font-weight: 700;
}
.character-cover-bar {
  position: absolute;
  inset: auto 0 0 0;
  height: 3px;
  background: #9fb0c6;
}
.character-card-cover.rarity-5 .character-cover-bar {
  background: linear-gradient(90deg, #d98c24, #f4c86a);
}
.character-card-cover.rarity-4 .character-cover-bar {
  background: linear-gradient(90deg, #7756d6, #ae92f5);
}
.character-card-main {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}
.character-card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.character-card-title {
  min-width: 0;
  color: var(--ink);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.character-card-level {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 999px;
  background: #edf2f8;
  color: #465b75;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
}
.character-card-level.is-max {
  background: linear-gradient(135deg, #f3a430, #e17f18);
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(225, 127, 24, 0.24);
}
.character-card-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 6px;
}
.character-card-element {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 19px;
  padding: 0 7px 0 5px;
  border-radius: 999px;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  background: #64748b;
}
.character-card-element img {
  width: 11px;
  height: 11px;
  object-fit: contain;
  filter: brightness(0) invert(1);
}
.character-card-element.elem-物理 {
  background: linear-gradient(135deg, #7c8899, #566373);
}
.character-card-element.elem-火 {
  background: linear-gradient(135deg, #f24d35, #d12a14);
}
.character-card-element.elem-冰 {
  background: linear-gradient(135deg, #3aa3e8, #1877bd);
}
.character-card-element.elem-雷 {
  background: linear-gradient(135deg, #9b58d9, #7432b5);
}
.character-card-element.elem-风 {
  background: linear-gradient(135deg, #2ecc88, #169b61);
}
.character-card-element.elem-量子 {
  background: linear-gradient(135deg, #5c6be3, #3c4ab5);
}
.character-card-element.elem-虚数 {
  background: linear-gradient(135deg, #e5b02c, #be8812);
}
.character-card-path {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 19px;
  padding: 0 7px 0 5px;
  border-radius: 6px;
  background: #f4f7fb;
  color: #4a607a;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.character-card-path img {
  width: 12px;
  height: 12px;
  object-fit: contain;
  filter: brightness(0) opacity(0.65);
}
.character-card-stars {
  color: #d68e1c;
  font-size: 11px;
  letter-spacing: 0.5px;
  line-height: 1;
}
.character-card-stars.rarity-4 {
  color: #845ed7;
}
.character-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding: 5px 8px;
  border-radius: 9px;
  border: 1px solid rgba(36, 86, 166, 0.08);
  background: #f5f8fd;
}
.character-card-eidolon {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 6px;
  background: #e7eef8;
  color: #3d5675;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.character-card-eidolon b {
  color: #1f4e8e;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.character-card-eidolon.is-active {
  background: #fef3dc;
  color: #93580a;
}
.character-card-eidolon.is-active b {
  color: #884e04;
}
.character-card-eidolon.is-max {
  background: linear-gradient(135deg, #fcebd0, #f8dca9);
  color: #87520b;
}
.character-card-eidolon.is-max b {
  color: #7d4906;
}
.character-card-plan.is-configured {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e8f7f0;
  color: #13794b;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.character-card-detail-hint {
  color: #73859d;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
</style>
