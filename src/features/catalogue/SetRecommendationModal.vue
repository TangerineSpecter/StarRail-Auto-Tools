<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { buildPlanApi } from "@/shared/api/build-plan";
import { resolveCharacterCatalogue } from "@/shared/catalogue";
import { slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import { summarizeSetTargets } from "./set-target-summary";
import type {
  CharacterCatalogueEntry,
  RelicSetCatalogueEntry,
  RelicSetRecommendedCharacter,
} from "@/types";

const props = defineProps<{
  set: RelicSetCatalogueEntry;
  characters: CharacterCatalogueEntry[];
}>();
const emit = defineEmits<{
  close: [];
  openCharacter: [character: CharacterCatalogueEntry];
}>();

const recommendedCharacters = ref<RelicSetRecommendedCharacter[]>([]);
const loading = ref(false);
const error = ref("");
let requestId = 0;

const recommendations = computed(() =>
  recommendedCharacters.value.map((character) => ({
    ...character,
    catalogue: resolveCharacterCatalogue({
      characterId: character.characterId,
      name: character.name,
    }),
  })),
);
const targetSummary = computed(() =>
  summarizeSetTargets(props.set.kind, recommendedCharacters.value),
);

async function loadRecommendations(setId: number) {
  const currentRequestId = ++requestId;
  recommendedCharacters.value = [];
  error.value = "";
  loading.value = true;
  try {
    const characters = await buildPlanApi.recommendedCharactersForSet(setId);
    if (currentRequestId !== requestId) return;
    recommendedCharacters.value = characters;
  } catch (cause) {
    if (currentRequestId !== requestId) return;
    error.value = String(cause);
  } finally {
    if (currentRequestId === requestId) loading.value = false;
  }
}

watch(
  () => props.set.id,
  (setId) => void loadRecommendations(setId),
  { immediate: true },
);

onUnmounted(() => {
  requestId += 1;
});
</script>

<template>
  <div class="catalogue-character-modal-backdrop" @click.self="emit('close')">
    <section
      class="set-recommendation-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="`${set.name}的推荐角色`"
    >
      <button
        class="catalogue-character-modal-close"
        type="button"
        aria-label="关闭推荐角色"
        @click="emit('close')"
      >
        ×
      </button>
      <header class="set-recommendation-header">
        <img v-if="set.image" :src="set.image" alt="" />
        <span v-else>◇</span>
        <div>
          <p class="eyebrow">BUILD PLAN TARGET</p>
          <h2>{{ set.name }}</h2>
          <small>{{ set.kind === "cavern" ? "遗器" : "位面饰品" }} · 已设置为目标的角色</small>
        </div>
      </header>
      <div class="set-recommendation-body">
        <p v-if="loading" class="set-recommendation-state">正在查询培养方案…</p>
        <p v-else-if="error" class="set-recommendation-state error">{{ error }}</p>
        <p v-else-if="!recommendations.length" class="set-recommendation-state">
          尚未有角色将此套装设为毕业目标。
        </p>
        <template v-else>
          <section class="set-target-summary" aria-label="保留词条汇总">
            <header>
              <div>
                <p class="eyebrow">KEEP AT A GLANCE</p>
                <h3>建议保留词条</h3>
              </div>
              <small>汇总 {{ recommendations.length }} 名目标角色</small>
            </header>
            <div class="set-target-summary-row">
              <b>副词条</b>
              <div v-if="targetSummary.substats.length" class="set-target-chip-list">
                <span v-for="stat in targetSummary.substats" :key="stat">{{
                  statLabel(stat)
                }}</span>
              </div>
              <small v-else>暂未设置有效副词条</small>
            </div>
            <div
              v-for="group in targetSummary.mainStats"
              :key="group.slot"
              class="set-target-summary-row"
            >
              <b>{{ slotLabel(group.slot) }}主属性</b>
              <div v-if="group.stats.length" class="set-target-chip-list">
                <span v-for="stat in group.stats" :key="stat">{{ statLabel(stat) }}</span>
              </div>
              <small v-else>暂未设置</small>
            </div>
            <p class="set-target-summary-note">头部与手部主属性固定，未在此列出。</p>
          </section>
          <section class="set-target-characters">
            <header>
              <div>
                <p class="eyebrow">BUILD PLAN TARGET</p>
                <h3>设为目标的角色</h3>
              </div>
            </header>
            <div class="set-recommendation-grid">
              <button
                v-for="character in recommendations"
                :key="character.characterId"
                type="button"
                class="set-recommendation-character"
                :class="{ unavailable: !character.catalogue }"
                :disabled="!character.catalogue"
                @click="character.catalogue && emit('openCharacter', character.catalogue)"
              >
                <img
                  v-if="character.catalogue?.image"
                  :src="character.catalogue.image"
                  :alt="character.name"
                />
                <span v-else>{{ character.name.slice(0, 1) }}</span>
                <div>
                  <b>{{ character.name }}</b>
                  <small v-if="character.catalogue"
                    >{{ character.catalogue.element }} · {{ character.catalogue.path }}</small
                  >
                  <small v-else>角色图鉴数据暂缺</small>
                </div>
                <i v-if="character.catalogue" aria-hidden="true">→</i>
              </button>
            </div>
          </section>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.set-recommendation-modal {
  position: relative;
  width: min(580px, 100%);
  overflow: hidden;
  border: 1px solid rgba(196, 164, 94, 0.7);
  border-radius: 12px;
  background: #f6f9fd;
  box-shadow: 0 28px 70px rgba(8, 19, 39, 0.38);
  animation: catalogue-modal-in 200ms ease-out;
}
.set-recommendation-header {
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
.set-recommendation-header > img,
.set-recommendation-header > span {
  flex: 0 0 auto;
  width: 76px;
  height: 76px;
  object-fit: contain;
}
.set-recommendation-header > span {
  display: grid;
  place-items: center;
  border: 1px dashed rgba(255, 255, 255, 0.56);
  font-size: 28px;
}
.set-recommendation-header p,
.set-recommendation-header h2,
.set-recommendation-header small {
  margin: 0;
}
.set-recommendation-header .eyebrow {
  color: #f1d48a;
  font-size: 10px;
}
.set-recommendation-header h2 {
  margin: 5px 0 7px;
  font-size: 23px;
}
.set-recommendation-header small {
  color: rgba(255, 255, 255, 0.74);
  font-size: 11px;
}
.set-recommendation-body {
  max-height: min(610px, calc(100vh - 190px));
  overflow-y: auto;
  padding: 20px 28px 24px;
}
.set-recommendation-state {
  margin: 0;
  padding: 20px 0;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}
.set-recommendation-state.error {
  color: var(--danger, #b54848);
}
.set-target-summary,
.set-target-characters {
  border: 1px solid rgba(46, 80, 123, 0.16);
  border-radius: 9px;
  background: #fff;
}
.set-target-summary {
  padding: 15px;
  box-shadow: inset 3px 0 #c69e4c;
}
.set-target-summary > header,
.set-target-characters > header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 11px;
}
.set-target-summary h3,
.set-target-summary .eyebrow,
.set-target-characters h3,
.set-target-characters .eyebrow {
  margin: 0;
}
.set-target-summary h3,
.set-target-characters h3 {
  color: var(--ink);
  font-size: 15px;
}
.set-target-summary .eyebrow,
.set-target-characters .eyebrow {
  color: #9a7839;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.13em;
}
.set-target-summary > header small {
  color: var(--muted);
  font-size: 10px;
}
.set-target-summary-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 8px 0;
  border-top: 1px solid rgba(46, 80, 123, 0.11);
}
.set-target-summary-row > b {
  padding-top: 4px;
  color: var(--ink-soft);
  font-size: 11px;
}
.set-target-summary-row > small {
  padding-top: 3px;
  color: var(--muted);
  font-size: 11px;
}
.set-target-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.set-target-chip-list > span {
  padding: 3px 7px;
  border-radius: 4px;
  color: #28588d;
  background: #eaf2fc;
  font-size: 10px;
  font-weight: 700;
}
.set-target-summary-note {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 10px;
}
.set-target-characters {
  margin-top: 14px;
  padding: 15px;
}
.set-recommendation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.set-recommendation-character {
  display: grid;
  grid-template-columns: 45px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink);
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 160ms ease,
    transform 160ms ease;
}
.set-recommendation-character:hover,
.set-recommendation-character:focus-visible {
  border-color: var(--blue);
  outline: none;
  transform: translateY(-1px);
}
.set-recommendation-character > img,
.set-recommendation-character > span {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  object-fit: cover;
  background: #eaf0f8;
}
.set-recommendation-character > span {
  display: grid;
  place-items: center;
  color: var(--blue);
  font-weight: 700;
}
.set-recommendation-character b,
.set-recommendation-character small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.set-recommendation-character b {
  font-size: 13px;
}
.set-recommendation-character small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 10px;
}
.set-recommendation-character i {
  color: var(--blue);
  font-size: 17px;
  font-style: normal;
}
.set-recommendation-character.unavailable {
  cursor: default;
  opacity: 0.68;
}
@media (max-width: 520px) {
  .set-recommendation-body {
    padding: 16px;
  }
  .set-recommendation-grid {
    grid-template-columns: 1fr;
  }
  .set-target-summary,
  .set-target-characters {
    padding: 12px;
  }
  .set-target-summary-row {
    grid-template-columns: 76px minmax(0, 1fr);
  }
}
</style>
