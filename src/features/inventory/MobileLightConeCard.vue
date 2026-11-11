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
    </div>
    <div class="lightcone-card-info">
      <div class="lightcone-card-heading">
        <strong class="lightcone-card-name">{{ item.name }}</strong>
        <span class="lightcone-card-level">Lv.{{ item.level }}</span>
      </div>
      <div class="lightcone-card-meta">
        <span v-if="entry?.path" class="lightcone-card-path">
          <img :src="pathIconSrc(entry.path)" alt="" />{{ pathLabel(entry.path) }}
        </span>
        <span
          v-if="entry?.rarity"
          class="lightcone-card-stars"
          :aria-label="`${entry.rarity} 星`"
          >{{ "★".repeat(entry.rarity) }}</span
        >
        <span v-if="item.locked" class="lightcone-card-lock">已锁定</span>
      </div>
    </div>
    <div class="lightcone-card-footer">
      <span :class="['lightcone-card-rank', { 'is-max': item.superimposition === 5 }]">
        <span>叠影</span><b>{{ item.superimposition }}</b>
      </span>
      <span v-if="item.location" class="lightcone-card-owner">
        <img v-if="owner?.image" :src="owner.image" alt="" />
        {{ equippedCharacterLabel(item.location, item.equippedCharacterId) }}
      </span>
      <span v-else class="lightcone-card-unequipped">未装备</span>
    </div>
  </div>
</template>

<style scoped>
.inventory-lightcone-card {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  gap: 10px 12px;
  width: 100%;
  min-width: 0;
}
.lightcone-card-cover {
  grid-row: 1 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 84px;
  overflow: hidden;
  border-radius: 9px;
  background: #eef2f7;
}
.lightcone-card-cover.rarity-5 {
  background: #faf0df;
}
.lightcone-card-cover.rarity-4 {
  background: #f0eafb;
}
.lightcone-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.lightcone-card-cover-fallback {
  color: var(--muted);
  font-size: 12px;
}
.lightcone-card-info {
  min-width: 0;
}
.lightcone-card-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.lightcone-card-name {
  min-width: 0;
  color: var(--ink);
  font-size: 15px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.lightcone-card-level {
  flex-shrink: 0;
  color: #526071;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.lightcone-card-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 8px;
  margin-top: 6px;
}
.lightcone-card-path {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #526071;
  font-size: 12px;
}
.lightcone-card-path img {
  width: 13px;
  height: 13px;
  object-fit: contain;
  filter: brightness(0) opacity(0.65);
}
.lightcone-card-stars {
  color: #9b6514;
  font-size: 10px;
  letter-spacing: 0.5px;
}
.lightcone-card-lock {
  padding: 2px 5px;
  border-radius: 4px;
  color: #476488;
  background: #edf3fa;
  font-size: 10px;
}
.lightcone-card-footer {
  display: flex;
  align-items: center;
  align-self: end;
  flex-wrap: wrap;
  gap: 6px 10px;
  min-width: 0;
}
.lightcone-card-rank {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: #f0f3f7;
  color: #526071;
  font-size: 11px;
  white-space: nowrap;
}
.lightcone-card-rank b {
  color: var(--ink);
  font-size: 13px;
}
.lightcone-card-rank.is-max {
  background: #fcf0d9;
  color: #8a5a12;
}
.lightcone-card-rank.is-max b {
  color: #8a5a12;
}
.lightcone-card-owner {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  color: #526071;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.lightcone-card-owner img {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  background: #f0f3f7;
}
.lightcone-card-unequipped {
  color: var(--muted);
  font-size: 12px;
}
</style>
