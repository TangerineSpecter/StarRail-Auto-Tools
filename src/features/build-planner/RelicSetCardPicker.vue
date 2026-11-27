<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { relicSetById } from "@/shared/catalogue";
import type { RelicSetCatalogueEntry, RelicSetOption } from "@/types";
import { filterRelicSetOptions } from "./relic-set-search";
import RelicSetInfoModal from "./RelicSetInfoModal.vue";

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
const inspectedSet = ref<RelicSetCatalogueEntry | null>(null);
const inspectedFromDialog = ref(false);
const infoReturnFocus = ref<HTMLElement | null>(null);
const selectedSet = computed(() =>
  props.modelValue === null ? undefined : relicSetById.get(props.modelValue),
);
const optionDetails = computed(() =>
  props.options.map((option) => {
    const catalogue = relicSetById.get(option.setId);
    return { ...option, image: catalogue?.image, catalogue };
  }),
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
  inspectedSet.value = null;
  inspectedFromDialog.value = false;
  infoReturnFocus.value = null;
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

function openInfo(set: RelicSetCatalogueEntry, fromDialog: boolean, event: MouseEvent) {
  infoReturnFocus.value = event.currentTarget as HTMLElement | null;
  inspectedFromDialog.value = fromDialog;
  inspectedSet.value = set;
}

function closeInfo() {
  if (!inspectedSet.value) return;
  const returnTarget = infoReturnFocus.value;
  inspectedSet.value = null;
  inspectedFromDialog.value = false;
  infoReturnFocus.value = null;
  void nextTick(() => {
    if (returnTarget?.isConnected) returnTarget.focus();
    else if (open.value) searchInput.value?.focus();
    else trigger.value?.focus();
  });
}

function selectFromInfo(setId: number) {
  inspectedSet.value = null;
  inspectedFromDialog.value = false;
  infoReturnFocus.value = null;
  select(setId);
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (!open.value || inspectedSet.value) return;
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
    <div :class="['build-set-picker-control', { 'is-open': open }]">
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
      </button>
      <div class="build-set-picker-actions">
        <button
          v-if="selectedSet"
          type="button"
          class="build-set-info-btn build-set-picker-info"
          aria-haspopup="dialog"
          :aria-label="`查看${selectedSet.name}图鉴效果`"
          title="查看套装图鉴效果"
          @click="openInfo(selectedSet, false, $event)"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
            <circle cx="8" cy="4.4" r="1.15" />
            <rect x="7.1" y="7" width="1.8" height="5.4" rx="0.9" />
          </svg>
        </button>
        <button
          type="button"
          class="build-set-picker-change"
          tabindex="-1"
          aria-hidden="true"
          @click="showDialog"
        >
          更换
        </button>
      </div>
    </div>
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
          <div
            v-for="set in filteredOptionDetails"
            :key="set.setId"
            class="build-set-dialog-option-card"
            :class="{ selected: set.setId === modelValue }"
          >
            <button
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
            <button
              v-if="set.catalogue"
              type="button"
              class="build-set-info-btn build-set-dialog-option-info"
              aria-haspopup="dialog"
              :aria-label="`查看${set.name}图鉴效果`"
              title="查看套装图鉴效果"
              @click="openInfo(set.catalogue, true, $event)"
            >
              <svg
                viewBox="0 0 16 16"
                width="12"
                height="12"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="8" cy="4.4" r="1.15" />
                <rect x="7.1" y="7" width="1.8" height="5.4" rx="0.9" />
              </svg>
            </button>
          </div>
          <p v-if="!filteredOptionDetails.length" class="build-set-dialog-empty" role="status">
            未找到匹配的套装
          </p>
        </div>
      </section>
    </div>
  </Teleport>
  <RelicSetInfoModal
    v-if="inspectedSet"
    :set="inspectedSet"
    :selectable="inspectedFromDialog"
    :selected="inspectedSet.id === modelValue"
    @close="closeInfo"
    @select="selectFromInfo"
  />
</template>
