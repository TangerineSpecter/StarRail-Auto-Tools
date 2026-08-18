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
        <p class="lightcone-catalogue-owned">{{ formatOwnedCount(ownedCount, "把") }}</p>
        <div v-if="lightCone.baseStats" class="lightcone-base-stat-grid">
          <div>
            <span>生命值</span><b>{{ formatBaseStat(lightCone.baseStats.hp) }}</b>
          </div>
          <div>
            <span>攻击力</span><b>{{ formatBaseStat(lightCone.baseStats.attack) }}</b>
          </div>
          <div>
            <span>防御力</span><b>{{ formatBaseStat(lightCone.baseStats.defense) }}</b>
          </div>
        </div>
        <section v-if="skillName" class="lightcone-catalogue-skill">
          <header>
            <p class="eyebrow">LIGHT CONE SKILL</p>
            <h3>{{ skillName }}</h3>
          </header>
          <p v-if="firstEffect"><b>叠影 1</b>{{ firstEffect }}</p>
          <p v-if="maxEffect && maxEffect !== firstEffect"><b>叠影 5</b>{{ maxEffect }}</p>
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
  padding: 20px 28px 24px;
}
.lightcone-catalogue-owned {
  margin: 0 0 14px;
  color: var(--blue);
  font-size: 13px;
  font-weight: 700;
}
.lightcone-base-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid rgba(46, 80, 123, 0.18);
  border-left: 1px solid rgba(46, 80, 123, 0.18);
}
.lightcone-base-stat-grid > div {
  display: grid;
  min-height: 72px;
  align-content: center;
  gap: 4px;
  padding: 10px;
  border-right: 1px solid rgba(46, 80, 123, 0.18);
  border-bottom: 1px solid rgba(46, 80, 123, 0.18);
}
.lightcone-base-stat-grid span {
  color: var(--ink-soft);
  font-size: 11px;
}
.lightcone-base-stat-grid b {
  color: var(--blue);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}
.lightcone-catalogue-skill {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid rgba(46, 80, 123, 0.16);
  border-radius: 9px;
  background: #fff;
}
.lightcone-catalogue-skill header {
  margin-bottom: 10px;
}
.lightcone-catalogue-skill .eyebrow,
.lightcone-catalogue-skill h3 {
  margin: 0;
}
.lightcone-catalogue-skill .eyebrow {
  color: #9a7839;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.13em;
}
.lightcone-catalogue-skill h3 {
  margin-top: 4px;
  color: var(--ink);
  font-size: 15px;
}
.lightcone-catalogue-skill p {
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.55;
}
.lightcone-catalogue-skill p b {
  display: inline-block;
  width: 48px;
  color: var(--blue);
}
</style>
