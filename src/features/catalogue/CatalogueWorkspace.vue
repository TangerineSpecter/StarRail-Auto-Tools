<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from "vue";
import { characterCatalogue, lightConeCatalogue, relicCatalogue } from "@/shared/catalogue";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import { useMobileView } from "@/shared/contracts/mobile-view";
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
const mobile = useMobileView();
const { inventoryRevision } = useRuntimeContext();
const { relicCounts, lightConeCounts } = useCatalogueOwnedCounts(inventoryRevision);
const tab = ref<"cavern" | "planar" | "lightCone" | "character">("cavern");
const tabOrder = ["cavern", "planar", "lightCone", "character"] as const;
type TabKey = (typeof tabOrder)[number];
const transitionDirection = ref<"next" | "prev">("next");

const tabButtons = ref<Record<string, HTMLElement | null>>({});
const setTabButtonRef = (key: string, el: unknown) => {
  tabButtons.value[key] = (el as HTMLElement) ?? null;
};

const indicatorX = ref(0);
const indicatorReady = ref(false);
function updateIndicator() {
  const el = tabButtons.value[tab.value];
  if (el) {
    indicatorX.value = el.offsetLeft + (el.offsetWidth - 18) / 2;
    if (!indicatorReady.value) {
      void nextTick(() => {
        indicatorReady.value = true;
      });
    }
  }
}

function selectTab(nextTab: TabKey, explicitDirection?: "next" | "prev") {
  if (nextTab === tab.value) return;
  const oldIdx = tabOrder.indexOf(tab.value);
  const newIdx = tabOrder.indexOf(nextTab);
  transitionDirection.value = explicitDirection ?? (newIdx > oldIdx ? "next" : "prev");
  tab.value = nextTab;
  void nextTick(updateIndicator);
}

function nextTab() {
  const curIdx = tabOrder.indexOf(tab.value);
  const nextIdx = (curIdx + 1) % tabOrder.length;
  selectTab(tabOrder[nextIdx], "next");
}

function prevTab() {
  const curIdx = tabOrder.indexOf(tab.value);
  const prevIdx = (curIdx - 1 + tabOrder.length) % tabOrder.length;
  selectTab(tabOrder[prevIdx], "prev");
}

/* Horizontal swipe gesture on content area (matching inventory swipe feel) */
let touchStartX = 0;
let touchStartY = 0;
let isTrackingGesture = false;
let isHorizontalGesture = false;
let preventClickUntil = 0;

function onTouchStart(e: TouchEvent) {
  if (!mobile || e.touches.length !== 1) {
    isTrackingGesture = false;
    return;
  }
  const target = e.target as HTMLElement | null;
  // Ignore bottom floating capsule, scrollable tabs header and secondary tabs
  if (
    target?.closest(
      ".mobile-glass-capsule, .catalogue-tabs, .mobile-relic-secondary-tabs, [data-swipe-ignore]",
    )
  ) {
    isTrackingGesture = false;
    return;
  }

  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  isTrackingGesture = true;
  isHorizontalGesture = false;
}

function onTouchMove(e: TouchEvent) {
  if (!mobile || !isTrackingGesture || e.touches.length !== 1) return;
  const touch = e.touches[0];
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (!isHorizontalGesture) {
    if (absY >= 10 && absY >= absX) {
      isTrackingGesture = false;
      return;
    }
    if (absX >= 12 && absX >= absY * 1.15) {
      isHorizontalGesture = true;
    }
  }

  if (isHorizontalGesture) {
    preventClickUntil = Date.now() + 500;
  }
}

function onTouchEnd(e: TouchEvent) {
  if (!mobile || !isTrackingGesture || !isHorizontalGesture) {
    isTrackingGesture = false;
    isHorizontalGesture = false;
    return;
  }
  isTrackingGesture = false;
  isHorizontalGesture = false;
  if (!e.changedTouches.length) return;
  const touch = e.changedTouches[0];
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX > 32 && absX > absY * 1.15) {
    preventClickUntil = Date.now() + 500;
    if (deltaX < 0) {
      nextTab();
    } else {
      prevTab();
    }
  }
}

function onClickCapture(e: MouseEvent) {
  if (Date.now() < preventClickUntil) {
    e.preventDefault();
    e.stopPropagation();
  }
}

watch(tab, () => {
  void nextTick(updateIndicator);
});
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
const onWindowResize = () => updateIndicator();
const removeListeners = () => {
  window.removeEventListener("keydown", onEscape);
  window.removeEventListener("resize", onWindowResize);
};
onMounted(() => {
  window.addEventListener("keydown", onEscape);
  window.addEventListener("resize", onWindowResize);
  void nextTick(updateIndicator);
});
onActivated(() => {
  window.addEventListener("keydown", onEscape);
  window.addEventListener("resize", onWindowResize);
  void nextTick(updateIndicator);
});
onDeactivated(removeListeners);
onBeforeUnmount(removeListeners);
</script>
<template>
  <section
    class="catalogue-workspace"
    @touchstart.passive="onTouchStart"
    @touchmove="onTouchMove"
    @touchend.passive="onTouchEnd"
    @click.capture="onClickCapture"
  >
    <header class="catalogue-heading">
      <div>
        <p class="eyebrow">LOCAL REFERENCE DATA</p>
        <h2>遗器、饰品与光锥图鉴</h2>
      </div>
      <div class="catalogue-tabs">
        <button
          v-for="item in tabs"
          :key="item.key"
          :ref="(el) => setTabButtonRef(item.key, el)"
          :class="['catalogue-tab-btn', { active: tab === item.key }]"
          :aria-pressed="tab === item.key"
          @click="selectTab(item.key)"
        >
          <span
            ><small>{{ item.code }}</small
            >{{ item.label }}</span
          ><b
            >{{ item.count }} <small>{{ item.unit }}</small></b
          >
        </button>
        <span
          v-if="mobile"
          class="catalogue-tab-indicator"
          :style="{
            transform: `translateX(${indicatorX}px)`,
            transition: indicatorReady ? undefined : 'none',
          }"
          aria-hidden="true"
        />
      </div>
    </header>
    <div class="catalogue-groups">
      <Transition
        :name="mobile ? `catalogue-slide-${transitionDirection}` : 'catalogue-panel'"
        :mode="mobile ? 'out-in' : undefined"
      >
        <KeepAlive>
          <RelicSetGrid
            v-if="tab === 'cavern'"
            key="cavern"
            :sets="cavernSets"
            :owned-counts="relicCounts"
            :inventory-revision="inventoryRevision"
            @select="selectedSet = $event"
          />
          <RelicSetGrid
            v-else-if="tab === 'planar'"
            key="planar"
            :sets="planarSets"
            :owned-counts="relicCounts"
            :inventory-revision="inventoryRevision"
            @select="selectedSet = $event"
          />
          <LightConeGrid
            v-else-if="tab === 'lightCone'"
            key="lightCone"
            :light-cones="catalogueLightCones"
            :owned-counts="lightConeCounts"
            @select="selectedLightCone = $event"
          />
          <CharacterGrid
            v-else-if="tab === 'character'"
            key="character"
            :characters="catalogueCharacters"
            @select="selectedCharacter = $event"
          />
        </KeepAlive>
      </Transition>
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
