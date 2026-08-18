<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from "vue";
import { characterCatalogue, lightConeCatalogue, relicCatalogue } from "@/shared/catalogue";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import RelicSetGrid from "./RelicSetGrid.vue";
import LightConeGrid from "./LightConeGrid.vue";
import CharacterGrid from "./CharacterGrid.vue";
import CharacterStatsModal from "./CharacterStatsModal.vue";
import LightConeStatsModal from "./LightConeStatsModal.vue";
import SetRecommendationModal from "./SetRecommendationModal.vue";
import { ownedCountOf } from "./owned-counts";
import { useCatalogueOwnedCounts } from "./useCatalogueOwnedCounts";
import type {
  CharacterCatalogueEntry,
  LightConeCatalogueEntry,
  RelicSetCatalogueEntry,
} from "@/types";

defineOptions({ name: "CatalogueWorkspace" });
const { inventoryRevision } = useRuntimeContext();
const { relicCounts, lightConeCounts } = useCatalogueOwnedCounts(inventoryRevision);
const tab = ref<"cavern" | "planar" | "lightCone" | "character">("cavern");
const selectedCharacter = ref<CharacterCatalogueEntry | null>(null);
const selectedSet = ref<RelicSetCatalogueEntry | null>(null);
const selectedLightCone = ref<LightConeCatalogueEntry | null>(null);
const cavernSets = relicCatalogue.sets.filter((set) => set.kind === "cavern");
const planarSets = relicCatalogue.sets.filter((set) => set.kind === "planar");
const catalogueLightCones = [...lightConeCatalogue.lightCones].sort(
  (left, right) =>
    (right.rarity ?? 5) - (left.rarity ?? 5) || left.name.localeCompare(right.name, "zh-CN"),
);
const catalogueCharacters = [...characterCatalogue.characters].sort(
  (left, right) =>
    (right.rarity ?? 5) - (left.rarity ?? 5) || left.name.localeCompare(right.name, "zh-CN"),
);
const selectedLightConeOwned = computed(() =>
  selectedLightCone.value ? ownedCountOf(lightConeCounts.value, selectedLightCone.value.id) : 0,
);
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
    key: "lightCone" as const,
    label: "光锥",
    code: "CONE",
    count: lightConeCatalogue.lightCones.length,
    unit: "把",
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
  else if (selectedLightCone.value) selectedLightCone.value = null;
}
const removeEscapeListener = () => window.removeEventListener("keydown", onEscape);
onMounted(() => window.addEventListener("keydown", onEscape));
onActivated(() => window.addEventListener("keydown", onEscape));
onDeactivated(removeEscapeListener);
onBeforeUnmount(removeEscapeListener);
</script>
<template>
  <section class="catalogue-workspace">
    <header class="catalogue-heading">
      <div>
        <p class="eyebrow">LOCAL REFERENCE DATA</p>
        <h2>遗器、饰品与光锥图鉴</h2>
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
        <RelicSetGrid
          :sets="cavernSets"
          :owned-counts="relicCounts"
          @select="selectedSet = $event"
        />
      </section>
      <section v-show="tab === 'planar'" class="catalogue-group">
        <RelicSetGrid
          :sets="planarSets"
          :owned-counts="relicCounts"
          @select="selectedSet = $event"
        />
      </section>
      <section v-show="tab === 'lightCone'" class="catalogue-group">
        <LightConeGrid
          :light-cones="catalogueLightCones"
          :owned-counts="lightConeCounts"
          @select="selectedLightCone = $event"
        />
      </section>
      <section v-show="tab === 'character'" class="catalogue-group character-catalogue-group">
        <CharacterGrid :characters="catalogueCharacters" @select="selectedCharacter = $event" />
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
  <LightConeStatsModal
    v-if="selectedLightCone"
    :light-cone="selectedLightCone"
    :owned-count="selectedLightConeOwned"
    @close="selectedLightCone = null"
  />
</template>
