<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { relicCatalogue } from "@/shared/catalogue";
import type { RelicSetOption } from "@/types";
import { filterRelicSetOptions } from "./relic-set-search";

const props = defineProps<{
  modelValue: number | null;
  options: RelicSetOption[];
  label: string;
}>();
const emit = defineEmits<{ "update:modelValue": [setId: number] }>();

const open = ref(false);
const query = ref("");
const trigger = ref<HTMLButtonElement>();
const dialog = ref<HTMLElement>();
const searchInput = ref<HTMLInputElement>();
const setById = new Map(relicCatalogue.sets.map((set) => [set.id, set]));
const selectedSet = computed(() =>
  props.modelValue === null ? undefined : setById.get(props.modelValue),
);
const optionDetails = computed(() =>
  props.options.map((option) => ({ ...option, image: setById.get(option.setId)?.image })),
);
const filteredOptionDetails = computed(() => {
  const matchingIds = new Set(
    filterRelicSetOptions(props.options, query.value).map((option) => option.setId),
  );
  return optionDetails.value.filter((option) => matchingIds.has(option.setId));
});

function close() {
  if (!open.value) return;
  open.value = false;
  query.value = "";
  void nextTick(() => trigger.value?.focus());
}

function showDialog() {
  open.value = true;
  void nextTick(() => searchInput.value?.focus());
}

function select(setId: number) {
  emit("update:modelValue", setId);
  close();
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (!open.value) return;
  if (event.key === "Escape" && !event.isComposing) {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  );
  if (!focusable.length) return;
  const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
  const nextIndex = event.shiftKey ? focusable.length - 1 : 0;
  if (
    currentIndex === -1 ||
    (event.shiftKey ? currentIndex === 0 : currentIndex === focusable.length - 1)
  ) {
    event.preventDefault();
    event.stopPropagation();
    focusable[nextIndex].focus();
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleDocumentKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleDocumentKeydown);
});
</script>

<template>
  <div class="build-set-picker">
    <span class="build-set-picker-label">{{ label }}</span>
    <button
      ref="trigger"
      class="build-set-picker-trigger"
      type="button"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="showDialog"
    >
      <img v-if="selectedSet?.image" :src="selectedSet.image" alt="" />
      <span v-else class="build-set-picker-placeholder">◇</span>
      <span>{{ selectedSet?.name ?? "请选择套装" }}</span>
      <small>更换</small>
    </button>
  </div>
  <Teleport to="body">
    <div v-if="open" class="build-set-dialog-backdrop" @click.self="close">
      <section
        ref="dialog"
        class="build-set-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="`选择${label}`"
      >
        <header>
          <div>
            <p>SET ARCHIVE</p>
            <h3>选择{{ label }}</h3>
            <span>从 {{ optionDetails.length }} 套装备中选择一套</span>
          </div>
          <button
            class="build-set-dialog-close"
            type="button"
            aria-label="关闭套装选择"
            @click="close"
          >
            ×
          </button>
        </header>
        <div class="build-set-dialog-search">
          <label :for="`build-set-search-${label}`">搜索{{ label }}</label>
          <input
            :id="`build-set-search-${label}`"
            ref="searchInput"
            v-model="query"
            type="search"
            placeholder="输入套装名称搜索"
            autocomplete="off"
          />
        </div>
        <div class="build-set-dialog-grid" role="listbox" :aria-label="`${label}选项`">
          <button
            v-for="set in filteredOptionDetails"
            :key="set.setId"
            type="button"
            class="build-set-dialog-option"
            :class="{ selected: set.setId === modelValue }"
            role="option"
            :aria-selected="set.setId === modelValue"
            @click="select(set.setId)"
          >
            <img v-if="set.image" :src="set.image" alt="" />
            <span v-else class="build-set-picker-placeholder">◇</span>
            <span>{{ set.name }}</span>
            <i v-if="set.setId === modelValue" aria-label="已选择">✓</i>
          </button>
          <p v-if="!filteredOptionDetails.length" class="build-set-dialog-empty" role="status">
            未找到匹配的套装
          </p>
        </div>
      </section>
    </div>
  </Teleport>
</template>
