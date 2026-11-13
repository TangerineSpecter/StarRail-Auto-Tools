<script setup lang="ts">
import { computed, inject, onDeactivated, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import Drawer from "primevue/drawer";
import { pathIconSrc } from "@/shared/catalogue";
import FilterCheckIcon from "@/features/inventory/FilterCheckIcon.vue";
import { catalogueRailHostKey } from "./catalogue-capsule-host";

const ELEMENT_COLORS: Record<string, string> = {
  物理: "#888888",
  火: "#f44336",
  冰: "#29b6f6",
  雷: "#ab47bc",
  风: "#26a69a",
  量子: "#26c6da",
  虚数: "#ffa726",
};

const props = withDefaults(
  defineProps<{
    active: boolean;
    unit: string;
    total: number;
    availablePaths: string[];
    availableElements?: string[];
    rarities: number[];
    showOwned?: boolean;
    searchPlaceholder?: string;
    ariaLabel?: string;
  }>(),
  {
    availableElements: undefined,
    showOwned: false,
    searchPlaceholder: "搜索名称",
    ariaLabel: "筛选图鉴",
  },
);

const path = defineModel<string>("path", { required: true });
const rarity = defineModel<number | "all">("rarity", { required: true });
const element = defineModel<string>("element", { default: "all" });
const owned = defineModel<"all" | "owned" | "unowned">("owned", { default: "all" });
const search = defineModel<string>("search", { default: "" });

const railHost = inject(catalogueRailHostKey, undefined);
const railTarget = computed(() => railHost?.value ?? null);
const drawerOpen = ref(false);

const draft = reactive({
  path: "all" as string,
  rarity: "all" as number | "all",
  element: "all" as string,
  owned: "all" as "all" | "owned" | "unowned",
  search: "",
});

const summaryParts = computed(() =>
  [
    path.value !== "all" ? path.value : "",
    props.availableElements && element.value !== "all" ? element.value : "",
    rarity.value !== "all" ? `${rarity.value}★` : "",
    props.showOwned && owned.value === "owned"
      ? "已持有"
      : props.showOwned && owned.value === "unowned"
        ? "未持有"
        : "",
    search.value.trim() ? `“${search.value.trim()}”` : "",
  ].filter(Boolean),
);

const activeCount = computed(() => summaryParts.value.length);

function syncDraftFromModel() {
  draft.path = path.value;
  draft.rarity = rarity.value;
  draft.element = element.value;
  draft.owned = owned.value;
  draft.search = search.value;
}

function openDrawer() {
  syncDraftFromModel();
  drawerOpen.value = true;
}

function resetDraft() {
  draft.path = "all";
  draft.rarity = "all";
  draft.element = "all";
  draft.owned = "all";
  draft.search = "";
}

function applyFilters() {
  path.value = draft.path;
  rarity.value = draft.rarity;
  element.value = draft.element;
  owned.value = draft.owned;
  search.value = draft.search.trim();
  drawerOpen.value = false;
}

function resetAll() {
  path.value = "all";
  rarity.value = "all";
  element.value = "all";
  owned.value = "all";
  search.value = "";
}

function togglePath(value: string) {
  draft.path = draft.path === value ? "all" : value;
}

function toggleElement(value: string) {
  draft.element = draft.element === value ? "all" : value;
}

function toggleRarity(value: number) {
  draft.rarity = draft.rarity === value ? "all" : value;
}

watch(
  () => props.active,
  (isActive) => {
    if (!isActive) drawerOpen.value = false;
  },
);
onDeactivated(() => {
  drawerOpen.value = false;
});
</script>

<template>
  <div class="mobile-catalogue-status">
    <p role="status">
      {{ total }} {{ unit
      }}<span v-if="summaryParts.length"> · {{ summaryParts.join(" · ") }}</span>
    </p>
    <div class="mobile-catalogue-status-actions">
      <button
        v-if="activeCount > 0"
        type="button"
        class="mobile-catalogue-reset-btn"
        @click="resetAll()"
      >
        重置
      </button>
      <button
        type="button"
        class="mobile-catalogue-inline-filter"
        :class="{ 'is-active': activeCount > 0 }"
        :aria-label="activeCount ? `${ariaLabel}，已选 ${activeCount} 项条件` : ariaLabel"
        @click="openDrawer()"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 17h16" />
          <circle cx="9" cy="7" r="2.5" />
          <circle cx="15" cy="17" r="2.5" />
        </svg>
        <span>筛选</span>
        <b v-if="activeCount">{{ activeCount }}</b>
      </button>
    </div>
  </div>

  <Teleport v-if="active" :to="railTarget ?? 'body'" :disabled="!railTarget">
    <div class="mobile-rail-tools" role="group" aria-label="图鉴筛选工具">
      <button
        type="button"
        class="mobile-rail-tool"
        :class="{ 'is-active': drawerOpen || activeCount > 0 }"
        aria-haspopup="dialog"
        :aria-expanded="drawerOpen"
        :aria-label="activeCount ? `${ariaLabel}，已选 ${activeCount} 项条件` : ariaLabel"
        @click="openDrawer()"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 17h16" />
          <circle cx="9" cy="7" r="2.5" />
          <circle cx="15" cy="17" r="2.5" />
        </svg>
        <span>筛选</span>
        <b v-if="activeCount">{{ activeCount }}</b>
      </button>
    </div>
  </Teleport>

  <Drawer
    v-if="active"
    v-model:visible="drawerOpen"
    position="bottom"
    block-scroll
    class="filter-drawer"
    aria-label="图鉴筛选条件"
  >
    <form @submit.prevent="applyFilters()">
      <header class="filter-drawer-heading">
        <div class="filter-drawer-title-row">
          <h2>筛选条件</h2>
          <Button
            class="mobile-filter-close"
            type="button"
            outlined
            aria-label="关闭筛选"
            @click="drawerOpen = false"
            >关闭</Button
          >
        </div>
        <small>点击可切换或取消 · 未选即全部</small>
      </header>
      <div class="filter-scroll">
        <fieldset class="filter-group filter-group-wide">
          <legend>关键词搜索</legend>
          <div class="mobile-catalogue-drawer-search">
            <input
              v-model="draft.search"
              type="search"
              :placeholder="searchPlaceholder"
              :aria-label="searchPlaceholder"
              enterkeyhint="done"
              autocomplete="off"
            />
            <button
              v-if="draft.search"
              type="button"
              aria-label="清空关键词"
              @click="draft.search = ''"
            >
              清空
            </button>
          </div>
        </fieldset>

        <fieldset class="filter-group filter-group-wide">
          <legend>
            命途 <em class="filter-count">{{ availablePaths.length }} 个</em>
          </legend>
          <div class="filter-chips filter-grid-3">
            <label v-for="item in availablePaths" :key="item" class="filter-chip filter-path-chip">
              <input type="checkbox" :checked="draft.path === item" @change="togglePath(item)" />
              <span>
                <img
                  v-if="pathIconSrc(item)"
                  :src="pathIconSrc(item)"
                  class="filter-chip-img"
                  alt=""
                />
                {{ item }}
                <FilterCheckIcon v-if="draft.path === item" />
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset v-if="availableElements" class="filter-group filter-group-wide">
          <legend>属性</legend>
          <div class="filter-chips filter-grid-3">
            <label
              v-for="elem in availableElements"
              :key="elem"
              class="filter-chip filter-element-chip"
            >
              <input
                type="checkbox"
                :checked="draft.element === elem"
                @change="toggleElement(elem)"
              />
              <span>
                <i
                  v-if="ELEMENT_COLORS[elem]"
                  class="filter-element-dot"
                  :style="{ backgroundColor: ELEMENT_COLORS[elem] }"
                />
                {{ elem }}
                <FilterCheckIcon v-if="draft.element === elem" />
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset class="filter-group filter-group-wide">
          <legend>星级</legend>
          <div class="filter-chips filter-grid-3">
            <label v-for="star in rarities" :key="star" class="filter-chip">
              <input
                type="checkbox"
                :checked="draft.rarity === star"
                @change="toggleRarity(star)"
              />
              <span>
                {{ star }}★
                <FilterCheckIcon v-if="draft.rarity === star" />
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset v-if="showOwned" class="filter-group filter-group-wide">
          <legend>持有状态</legend>
          <div class="filter-chips filter-grid-3">
            <label
              v-for="option in [
                { value: 'all', label: '全部' },
                { value: 'owned', label: '已持有' },
                { value: 'unowned', label: '未持有' },
              ] as const"
              :key="option.value"
              class="filter-chip"
            >
              <input
                type="checkbox"
                :checked="draft.owned === option.value"
                @change="draft.owned = option.value"
              />
              <span>
                {{ option.label }}
                <FilterCheckIcon v-if="draft.owned === option.value" />
              </span>
            </label>
          </div>
        </fieldset>
      </div>
      <div class="filter-actions">
        <Button class="filter-reset" type="button" outlined @click="resetDraft()">重置全部</Button>
        <Button class="filter-submit" type="submit">查看结果</Button>
      </div>
    </form>
  </Drawer>
</template>
