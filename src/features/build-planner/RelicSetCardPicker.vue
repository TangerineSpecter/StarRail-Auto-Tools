<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { relicCatalogue } from "@/shared/catalogue";
import type { RelicSetOption } from "@/types";

const props = defineProps<{
  modelValue: number | null;
  options: RelicSetOption[];
  label: string;
}>();
const emit = defineEmits<{ "update:modelValue": [setId: number] }>();

const open = ref(false);
const trigger = ref<HTMLButtonElement>();
const dialog = ref<HTMLElement>();
const setById = new Map(relicCatalogue.sets.map((set) => [set.id, set]));
const selectedSet = computed(() =>
  props.modelValue === null ? undefined : setById.get(props.modelValue),
);
const optionDetails = computed(() =>
  props.options.map((option) => ({ ...option, image: setById.get(option.setId)?.image })),
);

function close() {
  if (!open.value) return;
  open.value = false;
  void nextTick(() => trigger.value?.focus());
}

function showDialog() {
  open.value = true;
  void nextTick(() =>
    (
      dialog.value?.querySelector<HTMLButtonElement>(".build-set-dialog-option.selected") ??
      dialog.value?.querySelector<HTMLButtonElement>(".build-set-dialog-close")
    )?.focus(),
  );
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
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
      class="build-set-picker-trigger"
      type="button"
      :aria-expanded="open"
      aria-haspopup="dialog"
      ref="trigger"
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
        <div class="build-set-dialog-grid" role="listbox" :aria-label="`${label}选项`">
          <button
            v-for="set in optionDetails"
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
        </div>
      </section>
    </div>
  </Teleport>
</template>
