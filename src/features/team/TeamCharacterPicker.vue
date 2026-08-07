<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import InputText from "primevue/inputtext";
import { characterDisplayName, pathIconSrc, resolveCharacterCatalogue } from "@/shared/catalogue";
import { pathLabel } from "@/shared/catalogue/relic-options";
import type { CharacterListItem } from "@/types";
import { listAllOwnedCharacters } from "./list-owned-characters";
import {
  TEAM_ELEMENT_OPTIONS,
  TEAM_PATH_OPTIONS,
  filterTeamCharacters,
  toggleFilterValue,
} from "./team-utils";

const props = defineProps<{
  excludeIds: number[];
}>();
const emit = defineEmits<{
  select: [characterId: number];
  close: [];
}>();

const search = ref("");
const selectedPaths = ref<string[]>([]);
const selectedElements = ref<string[]>([]);
const allItems = ref<CharacterListItem[]>([]);
const loading = ref(false);
const error = ref("");
let requestId = 0;

const items = computed(() =>
  filterTeamCharacters(allItems.value, {
    search: search.value,
    paths: selectedPaths.value,
    elements: selectedElements.value,
    excludeIds: props.excludeIds,
  }),
);

const hasActiveFilters = computed(
  () =>
    search.value.trim().length > 0 ||
    selectedPaths.value.length > 0 ||
    selectedElements.value.length > 0,
);

async function load() {
  const currentRequest = ++requestId;
  loading.value = true;
  error.value = "";
  try {
    const items = await listAllOwnedCharacters();
    if (currentRequest !== requestId) return;
    allItems.value = items;
  } catch (cause) {
    if (currentRequest === requestId) error.value = String(cause);
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
}

function avatar(item: CharacterListItem) {
  return (
    resolveCharacterCatalogue({
      characterId: item.characterId,
      name: item.name,
      path: item.path,
    })?.image ?? undefined
  );
}

function displayName(item: Pick<CharacterListItem, "characterId" | "name" | "path">) {
  return characterDisplayName({
    characterId: item.characterId,
    name: item.name,
    path: item.path,
  });
}

function togglePath(value: string) {
  selectedPaths.value = toggleFilterValue(selectedPaths.value, value);
}

function toggleElement(value: string) {
  selectedElements.value = toggleFilterValue(selectedElements.value, value);
}

function resetFilters() {
  search.value = "";
  selectedPaths.value = [];
  selectedElements.value = [];
}

onMounted(() => void load());
</script>

<template>
  <div class="team-character-picker" @click.stop>
    <header class="team-picker-header">
      <div>
        <p class="eyebrow">OWNED CHARACTERS</p>
        <h3>选择角色</h3>
      </div>
      <button
        type="button"
        class="team-picker-close"
        aria-label="关闭角色选择"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <div class="team-picker-controls">
      <label class="team-picker-search">
        <span class="visually-hidden">搜索角色</span>
        <div class="team-picker-search-input-wrap">
          <svg class="team-picker-search-icon" viewBox="0 0 1024 1024" aria-hidden="true">
            <path
              d="M909.6 854.5 649.9 594.8C690.2 542.7 712 479 712 412c0-165.7-134.3-300-300-300S112 246.3 112 412s134.3 300 300 300c67 0 130.6-21.8 182.7-62l259.7 259.6a40.2 40.2 0 0 0 56.9 0 40.2 40.2 0 0 0-1.7-55.1ZM412 640c-125.9 0-228-102.1-228-228s102.1-228 228-228 228 102.1 228 228-102.1 228-228 228Z"
              fill="currentColor"
            />
          </svg>
          <InputText v-model="search" placeholder="搜索角色名称、命途或属性" />
        </div>
      </label>

      <div class="team-picker-filter-block">
        <div class="team-picker-filter-label">
          <span>命途</span>
          <em v-if="selectedPaths.length">{{ selectedPaths.length }}</em>
        </div>
        <div class="team-picker-chips" role="group" aria-label="命途筛选">
          <button
            v-for="path in TEAM_PATH_OPTIONS"
            :key="path.value"
            type="button"
            :class="['team-picker-chip', { active: selectedPaths.includes(path.value) }]"
            @click="togglePath(path.value)"
          >
            <img class="team-picker-chip-icon" :src="pathIconSrc(path.value)" :alt="path.label" />{{
              path.label
            }}
          </button>
        </div>
      </div>

      <div class="team-picker-filter-block">
        <div class="team-picker-filter-label">
          <span>属性</span>
          <em v-if="selectedElements.length">{{ selectedElements.length }}</em>
        </div>
        <div class="team-picker-chips" role="group" aria-label="属性筛选">
          <button
            v-for="element in TEAM_ELEMENT_OPTIONS"
            :key="element.label"
            type="button"
            :class="['team-picker-chip', { active: selectedElements.includes(element.label) }]"
            @click="toggleElement(element.label)"
          >
            <i class="team-picker-element-dot" :style="{ backgroundColor: element.color }" />{{
              element.label
            }}
          </button>
        </div>
      </div>

      <div class="team-picker-control-meta">
        <span class="team-picker-result-count">{{ items.length }} 名可选角色</span>
        <button
          v-if="hasActiveFilters"
          type="button"
          class="team-picker-reset"
          @click="resetFilters"
        >
          清空筛选
        </button>
      </div>
    </div>

    <p v-if="error" class="team-picker-error">{{ error }}</p>
    <div class="team-picker-list">
      <button
        v-for="item in items"
        :key="item.characterId"
        type="button"
        class="team-picker-item"
        @click="emit('select', item.characterId)"
      >
        <div class="team-picker-avatar-wrap">
          <img
            v-if="avatar(item)"
            class="team-picker-avatar"
            :src="avatar(item)"
            :alt="displayName(item)"
          />
          <div v-else class="team-picker-avatar-fallback">{{ item.name.slice(0, 1) }}</div>
          <img
            class="team-picker-path-icon"
            :src="pathIconSrc(item.path)"
            :alt="pathLabel(item.path)"
          />
        </div>
        <div class="team-picker-meta">
          <strong>{{ displayName(item) }}</strong>
          <small>
            <span>Lv.{{ item.level }}</span>
            <span class="team-picker-eidolon">E{{ item.eidolon }}</span>
          </small>
        </div>
      </button>
      <div v-if="!loading && !items.length" class="team-picker-empty">
        {{
          hasActiveFilters
            ? "没有匹配的角色"
            : allItems.length
              ? "可选角色已全部入队"
              : "背包中暂无角色，请先同步角色档案"
        }}
      </div>
      <div v-if="loading" class="team-picker-empty">正在加载角色…</div>
    </div>
  </div>
</template>
