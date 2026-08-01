<script setup lang="ts">
import { onActivated, onBeforeUnmount, onDeactivated, ref } from "vue";
import { characterCatalogue, relicCatalogue } from "@/shared/catalogue";
import RelicSetGrid from "./RelicSetGrid.vue";
import CharacterGrid from "./CharacterGrid.vue";
import CharacterStatsModal from "./CharacterStatsModal.vue";
import SetRecommendationModal from "./SetRecommendationModal.vue";
import type { CharacterCatalogueEntry, RelicSetCatalogueEntry } from "@/types";

defineOptions({ name: "CatalogueWorkspace" });
const tab = ref<"cavern" | "planar" | "character">("cavern");
const selectedCharacter = ref<CharacterCatalogueEntry | null>(null);
const selectedSet = ref<RelicSetCatalogueEntry | null>(null);
const cavernSets = relicCatalogue.sets.filter((set) => set.kind === "cavern");
const planarSets = relicCatalogue.sets.filter((set) => set.kind === "planar");
const tabs = [
  { key: "cavern" as const, label: "遗器", code: "CAVERN", count: cavernSets.length, unit: "套" },
  {
    key: "planar" as const,
    label: "位面饰品",
    code: "PLANAR",
    count: planarSets.length,
    unit: "套",
  },
  {
    key: "character" as const,
    label: "角色",
    code: "AVATAR",
    count: characterCatalogue.characters.length,
    unit: "名",
  },
];
function openRecommendedCharacter(character: CharacterCatalogueEntry) {
  selectedSet.value = null;
  selectedCharacter.value = character;
}
function onEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.isComposing) return;
  if (selectedCharacter.value) selectedCharacter.value = null;
  else if (selectedSet.value) selectedSet.value = null;
}
const removeEscapeListener = () => window.removeEventListener("keydown", onEscape);
onActivated(() => window.addEventListener("keydown", onEscape));
onDeactivated(removeEscapeListener);
onBeforeUnmount(removeEscapeListener);
</script>
<template>
  <section class="catalogue-workspace">
    <header class="catalogue-heading">
      <div>
        <p class="eyebrow">LOCAL REFERENCE DATA</p>
        <h2>遗器与位面饰品图鉴</h2>
      </div>
      <div class="catalogue-tabs">
        <button
          v-for="item in tabs"
          :key="item.key"
          :class="['catalogue-tab-btn', { active: tab === item.key }]"
          @click="tab = item.key"
        >
          <span
            ><small>{{ item.code }}</small
            >{{ item.label }}</span
          ><b
            >{{ item.count }} <small>{{ item.unit }}</small></b
          >
        </button>
      </div>
    </header>
    <div class="catalogue-groups">
      <section v-show="tab === 'cavern'" class="catalogue-group">
        <RelicSetGrid :sets="cavernSets" @select="selectedSet = $event" />
      </section>
      <section v-show="tab === 'planar'" class="catalogue-group">
        <RelicSetGrid :sets="planarSets" @select="selectedSet = $event" />
      </section>
      <section v-show="tab === 'character'" class="catalogue-group character-catalogue-group">
        <CharacterGrid
          :characters="characterCatalogue.characters"
          @select="selectedCharacter = $event"
        />
      </section>
    </div>
  </section>
  <CharacterStatsModal
    v-if="selectedCharacter"
    :character="selectedCharacter"
    @close="selectedCharacter = null"
  />
  <SetRecommendationModal
    v-if="selectedSet"
    :set="selectedSet"
    :characters="characterCatalogue.characters"
    @close="selectedSet = null"
    @open-character="openRecommendedCharacter"
  />
</template>
