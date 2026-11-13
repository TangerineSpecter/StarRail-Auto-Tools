<script setup lang="ts">
import { computed } from "vue";
import {
  equippedCharacterLabel,
  lightConeById,
  pathIconSrc,
  resolveCharacterCatalogue,
} from "@/shared/catalogue";
import { pathLabel } from "./options";
import type { LightConeListItem } from "@/types";

const props = defineProps<{ item: LightConeListItem }>();
const entry = computed(() => lightConeById.get(props.item.templateId));
const owner = computed(() =>
  resolveCharacterCatalogue({
    name: props.item.location,
    characterId: props.item.equippedCharacterId,
  }),
);
</script>

<template>
  <div class="inventory-lightcone-card">
    <div :class="['lightcone-card-cover', `rarity-${entry?.rarity ?? 0}`]">
      <img v-if="entry?.image" :src="entry.image" :alt="item.name" />
      <span v-else class="lightcone-card-cover-fallback">光锥</span>
      <span class="lightcone-cover-bar" aria-hidden="true" />
    </div>
    <div class="lightcone-card-main">
      <div class="lightcone-card-heading">
        <strong class="lightcone-card-name">{{ item.name }}</strong>
        <span :class="['lightcone-card-level', { 'is-max': item.level === 80 }]"
          >Lv.{{ item.level }}</span
        >
      </div>
      <div class="lightcone-card-meta">
        <span v-if="entry?.path" class="lightcone-card-path">
          <img :src="pathIconSrc(entry.path)" alt="" />{{ pathLabel(entry.path) }}
        </span>
        <span
          v-if="entry?.rarity"
          :class="['lightcone-card-stars', `rarity-${entry.rarity}`]"
          :aria-label="`${entry.rarity} 星`"
          >{{ "★".repeat(entry.rarity) }}</span
        >
        <span v-if="item.locked" class="lightcone-card-lock">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          已锁定
        </span>
      </div>
      <div class="lightcone-card-footer">
        <span :class="['lightcone-card-rank', { 'is-max': item.superimposition === 5 }]">
          <span>叠影</span><b>{{ item.superimposition }}</b>
        </span>
        <span v-if="item.location" class="lightcone-card-owner">
          <img v-if="owner?.image" :src="owner.image" alt="" />
          <span class="lightcone-owner-name">{{
            equippedCharacterLabel(item.location, item.equippedCharacterId)
          }}</span>
        </span>
        <span v-else class="lightcone-card-unequipped">未装备</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inventory-lightcone-card {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: stretch;
  gap: 12px;
  width: 100%;
  min-width: 0;
}
.lightcone-card-cover {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 86px;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(28, 49, 80, 0.08);
  background: linear-gradient(155deg, #f3f6fb, #e5ebf5);
}
.lightcone-card-cover.rarity-5 {
  border-color: rgba(217, 147, 44, 0.28);
  background: linear-gradient(155deg, #fff8eb 0%, #f7e6c4 100%);
}
.lightcone-card-cover.rarity-4 {
  border-color: rgba(124, 92, 219, 0.24);
  background: linear-gradient(155deg, #f8f4ff 0%, #eadffd 100%);
}
.lightcone-card-cover.rarity-3 {
  border-color: rgba(60, 131, 206, 0.22);
  background: linear-gradient(155deg, #f1f7fe 0%, #dcebfb 100%);
}
.lightcone-card-cover img {
  width: 92%;
  height: 92%;
  object-fit: contain;
  filter: drop-shadow(0 3px 6px rgba(24, 38, 62, 0.14));
}
.lightcone-card-cover-fallback {
  color: var(--muted);
  font-size: 12px;
}
.lightcone-cover-bar {
  position: absolute;
  inset: auto 0 0 0;
  height: 3px;
  background: #9fb0c6;
}
.lightcone-card-cover.rarity-5 .lightcone-cover-bar {
  background: linear-gradient(90deg, #d98c24, #f4c86a);
}
.lightcone-card-cover.rarity-4 .lightcone-cover-bar {
  background: linear-gradient(90deg, #7756d6, #ae92f5);
}
.lightcone-card-cover.rarity-3 .lightcone-cover-bar {
  background: linear-gradient(90deg, #3c83ce, #78b7f0);
}
.lightcone-card-main {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}
.lightcone-card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.lightcone-card-name {
  min-width: 0;
  color: var(--ink);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.lightcone-card-level {
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
.lightcone-card-level.is-max {
  background: linear-gradient(135deg, #f3a430, #e17f18);
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(225, 127, 24, 0.24);
}
.lightcone-card-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 7px;
}
.lightcone-card-path {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px 2px 5px;
  border-radius: 6px;
  background: #f4f7fb;
  color: #4a607a;
  font-size: 11px;
  font-weight: 600;
}
.lightcone-card-path img {
  width: 12px;
  height: 12px;
  object-fit: contain;
  filter: brightness(0) opacity(0.65);
}
.lightcone-card-stars {
  color: #d68e1c;
  font-size: 11px;
  letter-spacing: 0.5px;
  line-height: 1;
}
.lightcone-card-stars.rarity-4 {
  color: #845ed7;
}
.lightcone-card-stars.rarity-3 {
  color: #3f84ce;
}
.lightcone-card-lock {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 6px;
  color: #2f5b8f;
  background: #eaf2fc;
  font-size: 10px;
  font-weight: 600;
}
.lightcone-card-lock svg {
  width: 10px;
  height: 10px;
}
.lightcone-card-footer {
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
.lightcone-card-rank {
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
.lightcone-card-rank b {
  color: #1f4e8e;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.lightcone-card-rank.is-max {
  background: linear-gradient(135deg, #fcebd0, #f8dca9);
  color: #87520b;
}
.lightcone-card-rank.is-max b {
  color: #7d4906;
}
.lightcone-card-owner {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 100%;
  padding: 2px 8px 2px 3px;
  border-radius: 999px;
  border: 1px solid rgba(28, 49, 80, 0.08);
  background: #ffffff;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}
.lightcone-card-owner img {
  flex-shrink: 0;
  width: 19px;
  height: 19px;
  border-radius: 50%;
  object-fit: cover;
  background: #f0f3f7;
}
.lightcone-owner-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lightcone-card-unequipped {
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(114, 128, 148, 0.1);
  color: #758498;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
</style>
