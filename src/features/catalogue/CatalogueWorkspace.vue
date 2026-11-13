<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  provide,
  ref,
  watch,
} from "vue";
import { characterCatalogue, lightConeCatalogue, relicCatalogue } from "@/shared/catalogue";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import { useMobileTopHeaderTarget } from "@/shared/contracts/mobile-top-header";
import { useMobileView } from "@/shared/contracts/mobile-view";
import RelicSetGrid from "./RelicSetGrid.vue";
import LightConeGrid from "./LightConeGrid.vue";
import CharacterGrid from "./CharacterGrid.vue";
import CharacterStatsModal from "./CharacterStatsModal.vue";
import LightConeStatsModal from "./LightConeStatsModal.vue";
import SetRecommendationModal from "./SetRecommendationModal.vue";
import { catalogueCapsuleHostKey, catalogueRailHostKey } from "./catalogue-capsule-host";
import { useCatalogueTabPager } from "./useCatalogueTabPager";
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
const skipNextTransition = ref(false);

const workspaceEl = ref<HTMLElement | null>(null);
const pagerBody = ref<HTMLElement | null>(null);
const capsuleHostEl = ref<HTMLElement | null>(null);
const railHostEl = ref<HTMLElement | null>(null);
const pageActive = ref(true);
const { host: topHeaderHost, enabled: useTopHeader } = useMobileTopHeaderTarget(
  "catalogue",
  pageActive,
);
provide(catalogueCapsuleHostKey, capsuleHostEl);
provide(catalogueRailHostKey, railHostEl);

const selectedCharacter = ref<CharacterCatalogueEntry | null>(null);
const selectedSet = ref<RelicSetCatalogueEntry | null>(null);
const selectedLightCone = ref<LightConeCatalogueEntry | null>(null);

const tabsRowEl = ref<HTMLElement | null>(null);
const tabButtons = ref<Record<string, HTMLElement | null>>({});
const setTabButtonRef = (key: string, el: unknown) => {
  tabButtons.value[key] = (el as HTMLElement) ?? null;
};
const filteredSummaryByTab = ref<Partial<Record<TabKey, { total: number; filtered: boolean }>>>({});

const activeTabSummary = () => {
  const currentKey = mobile ? pager.visualTab.value : tab.value;
  const current = tabs.find((item) => item.key === currentKey) ?? tabs[0];
  const override = filteredSummaryByTab.value[current.key];
  return {
    count: override ? override.total : current.count,
    unit: current.unit,
    filtered: override?.filtered ?? false,
  };
};

function buttonIndicatorX(key: TabKey) {
  const el = tabButtons.value[key];
  return el ? el.offsetLeft + (el.offsetWidth - 18) / 2 : 0;
}

const indicatorX = ref(0);
const indicatorReady = ref(false);
function updateIndicator() {
  if (tabButtons.value[tab.value]) {
    indicatorX.value = buttonIndicatorX(tab.value);
    if (!indicatorReady.value) {
      void nextTick(() => {
        indicatorReady.value = true;
      });
    }
  }
}

const pager = useCatalogueTabPager<TabKey>({
  order: tabOrder,
  tab,
  surface: workspaceEl,
  body: pagerBody,
  enabled: computed(
    () => mobile && !selectedCharacter.value && !selectedSet.value && !selectedLightCone.value,
  ),
  async onCommit(next) {
    skipNextTransition.value = true;
    tab.value = next;
    await nextTick();
    await nextTick();
    window.scrollTo(0, 0);
    if (workspaceEl.value) workspaceEl.value.scrollTop = 0;
    skipNextTransition.value = false;
    void nextTick(updateIndicator);
  },
});

const activeIndicatorX = computed(() => {
  if (!pager.active.value) return indicatorX.value;
  const pos = Math.max(0, Math.min(tabOrder.length - 1, pager.position.value));
  const i0 = Math.floor(pos);
  const i1 = Math.min(tabOrder.length - 1, i0 + 1);
  const frac = pos - i0;
  return buttonIndicatorX(tabOrder[i0]) * (1 - frac) + buttonIndicatorX(tabOrder[i1]) * frac;
});

const capsuleHostStyle = computed(() => {
  if (
    !pager.active.value ||
    (pager.target.value !== "lightCone" && pager.target.value !== "character")
  ) {
    return undefined;
  }
  const progress = Math.min(
    1,
    Math.abs(pager.offset.value) / Math.max(1, pager.travel.value * 0.55),
  );
  return { opacity: String(1 - progress) };
});

function selectTab(nextTab: TabKey, explicitDirection?: "next" | "prev") {
  if (mobile) {
    void pager.goTo(nextTab);
    return;
  }
  pager.cancel();
  skipNextTransition.value = false;
  if (nextTab === tab.value) return;
  const oldIdx = tabOrder.indexOf(tab.value);
  const newIdx = tabOrder.indexOf(nextTab);
  transitionDirection.value = explicitDirection ?? (newIdx > oldIdx ? "next" : "prev");
  tab.value = nextTab;
  void nextTick(updateIndicator);
}

watch(tab, () => {
  void nextTick(updateIndicator);
});
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
let tabsResizeObserver: ResizeObserver | null = null;
const bindTabsObserver = () => {
  tabsResizeObserver?.disconnect();
  tabsResizeObserver = null;
  if (typeof ResizeObserver === "undefined" || !tabsRowEl.value) return;
  tabsResizeObserver = new ResizeObserver(() => {
    updateIndicator();
  });
  tabsResizeObserver.observe(tabsRowEl.value);
};
const onWindowResize = () => updateIndicator();
const removeListeners = () => {
  window.removeEventListener("keydown", onEscape);
  window.removeEventListener("resize", onWindowResize);
  tabsResizeObserver?.disconnect();
  tabsResizeObserver = null;
};
watch(useTopHeader, () => {
  void nextTick(() => {
    bindTabsObserver();
    updateIndicator();
  });
});
onMounted(() => {
  window.addEventListener("keydown", onEscape);
  window.addEventListener("resize", onWindowResize);
  void nextTick(() => {
    bindTabsObserver();
    updateIndicator();
  });
});
onActivated(() => {
  pageActive.value = true;
  window.addEventListener("keydown", onEscape);
  window.addEventListener("resize", onWindowResize);
  void nextTick(() => {
    bindTabsObserver();
    updateIndicator();
  });
});
onDeactivated(() => {
  pageActive.value = false;
  removeListeners();
});
onBeforeUnmount(removeListeners);
</script>
<template>
  <section ref="workspaceEl" class="catalogue-workspace">
    <header :class="['catalogue-heading', { 'is-teleported': useTopHeader }]">
      <div>
        <p class="eyebrow">LOCAL REFERENCE DATA</p>
        <h2>遗器、饰品与光锥图鉴</h2>
      </div>
      <Teleport :to="topHeaderHost ?? 'body'" :disabled="!useTopHeader">
        <div :class="{ 'mobile-catalogue-toolbar': mobile }">
          <div ref="tabsRowEl" class="catalogue-tabs">
            <button
              v-for="item in tabs"
              :key="item.key"
              :ref="(el) => setTabButtonRef(item.key, el)"
              :class="[
                'catalogue-tab-btn',
                { active: (mobile ? pager.visualTab.value : tab) === item.key },
              ]"
              :aria-pressed="(mobile ? pager.visualTab.value : tab) === item.key"
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
                transform: `translateX(${activeIndicatorX}px)`,
                transition: pager.active.value
                  ? `transform ${pager.duration.value}ms cubic-bezier(0.16, 1, 0.3, 1)`
                  : indicatorReady
                    ? undefined
                    : 'none',
              }"
              aria-hidden="true"
            />
          </div>
          <span
            v-if="mobile"
            :class="[
              'mobile-inventory-count-pill',
              'mobile-catalogue-count-pill',
              { 'is-filtered': activeTabSummary().filtered },
            ]"
            role="status"
          >
            <i class="mobile-inventory-count-pill-dot" aria-hidden="true" />
            <b>{{ activeTabSummary().count }}</b>
            <span>{{ activeTabSummary().unit }}</span>
          </span>
        </div>
      </Teleport>
    </header>
    <div
      class="catalogue-groups catalogue-pager"
      :class="{ 'is-interacting': pager.active.value }"
      :style="
        pager.active.value ? { minHeight: `${pager.top.value + pager.height.value}px` } : undefined
      "
    >
      <div
        ref="pagerBody"
        class="catalogue-pager-body"
        :style="pager.paneStyle.value"
        :inert="pager.settling.value"
        :aria-busy="pager.settling.value"
      >
        <Transition
          :name="
            skipNextTransition
              ? undefined
              : mobile
                ? `catalogue-slide-${transitionDirection}`
                : 'catalogue-panel'
          "
          :css="!skipNextTransition"
        >
          <KeepAlive>
            <RelicSetGrid
              v-if="tab === 'cavern'"
              key="cavern"
              :sets="cavernSets"
              :owned-counts="relicCounts"
              :inventory-revision="inventoryRevision"
              :active="tab === 'cavern'"
              @select="selectedSet = $event"
            />
            <RelicSetGrid
              v-else-if="tab === 'planar'"
              key="planar"
              :sets="planarSets"
              :owned-counts="relicCounts"
              :inventory-revision="inventoryRevision"
              :active="tab === 'planar'"
              @select="selectedSet = $event"
            />
            <LightConeGrid
              v-else-if="tab === 'lightCone'"
              key="lightCone"
              :light-cones="catalogueLightCones"
              :owned-counts="lightConeCounts"
              :active="tab === 'lightCone'"
              @summary="filteredSummaryByTab.lightCone = $event"
              @select="selectedLightCone = $event"
            />
            <CharacterGrid
              v-else-if="tab === 'character'"
              key="character"
              :characters="catalogueCharacters"
              :active="tab === 'character'"
              @summary="filteredSummaryByTab.character = $event"
              @select="selectedCharacter = $event"
            />
          </KeepAlive>
        </Transition>
      </div>
      <div
        v-if="pager.active.value && pager.target.value"
        class="catalogue-pager-preview"
        :style="pager.neighbourStyle.value"
        inert
        aria-hidden="true"
      >
        <RelicSetGrid
          v-if="pager.target.value === 'cavern'"
          :sets="cavernSets"
          :owned-counts="relicCounts"
          :inventory-revision="inventoryRevision"
          preview
        />
        <RelicSetGrid
          v-else-if="pager.target.value === 'planar'"
          :sets="planarSets"
          :owned-counts="relicCounts"
          :inventory-revision="inventoryRevision"
          preview
        />
        <LightConeGrid
          v-else-if="pager.target.value === 'lightCone'"
          :light-cones="catalogueLightCones"
          :owned-counts="lightConeCounts"
          preview
        />
        <CharacterGrid
          v-else-if="pager.target.value === 'character'"
          :characters="catalogueCharacters"
          preview
        />
      </div>
    </div>
    <div
      ref="capsuleHostEl"
      class="catalogue-capsule-host"
      :style="capsuleHostStyle"
      data-swipe-ignore
    />
    <div ref="railHostEl" class="mobile-catalogue-rail-host" data-swipe-ignore />
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
