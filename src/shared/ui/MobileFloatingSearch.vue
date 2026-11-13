<script setup lang="ts">
/** Centered fullscreen Gaussian-blur floating search overlay for mobile pages. */
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    placeholder?: string;
    ariaLabel?: string;
    debounceMs?: number;
    preview?: boolean;
  }>(),
  {
    placeholder: "搜索",
    ariaLabel: "搜索",
    debounceMs: 0,
    preview: false,
  },
);

const search = defineModel<string>({ required: true });
const open = defineModel<boolean>("open", { default: false });

const emit = defineEmits<{
  search: [];
}>();

const inputEl = ref<HTMLInputElement | null>(null);
const composing = ref(false);
const keyboardInset = ref(0);
const viewportTopInset = ref(0);
let timer: ReturnType<typeof setTimeout> | undefined;

function updateVisualViewport() {
  if (typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (!vv) {
    keyboardInset.value = 0;
    viewportTopInset.value = 0;
    return;
  }
  viewportTopInset.value = Math.max(0, Math.round(vv.offsetTop));
  keyboardInset.value = Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height)));
}

function bindVisualViewport(active: boolean) {
  if (typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (active) {
    updateVisualViewport();
    vv?.addEventListener("resize", updateVisualViewport);
    vv?.addEventListener("scroll", updateVisualViewport);
    window.addEventListener("resize", updateVisualViewport);
    return;
  }
  vv?.removeEventListener("resize", updateVisualViewport);
  vv?.removeEventListener("scroll", updateVisualViewport);
  window.removeEventListener("resize", updateVisualViewport);
  keyboardInset.value = 0;
  viewportTopInset.value = 0;
}

function cancelPending() {
  clearTimeout(timer);
  timer = undefined;
}

function submit(blur = false) {
  cancelPending();
  if (!composing.value) emit("search");
  if (blur) inputEl.value?.blur();
}

function scheduleSearch() {
  cancelPending();
  if (composing.value) return;
  if (props.debounceMs > 0) timer = setTimeout(submit, props.debounceMs);
  else emit("search");
}

function clearSearch() {
  search.value = "";
  submit();
}

function startComposition() {
  composing.value = true;
  cancelPending();
}

function finishComposition() {
  composing.value = false;
  scheduleSearch();
}

function dismissSearch() {
  composing.value = false;
  if (timer !== undefined) submit();
  open.value = false;
}

function submitAndClose() {
  if (composing.value) return;
  submit(true);
  open.value = false;
}

watch(open, (isOpen) => {
  bindVisualViewport(isOpen);
  if (!isOpen) return;
  void nextTick(() => {
    inputEl.value?.focus({ preventScroll: true });
    inputEl.value?.select();
  });
});

onBeforeUnmount(() => {
  bindVisualViewport(false);
  cancelPending();
});

defineExpose({ cancelPending, dismissSearch });
</script>

<template>
  <Teleport v-if="!preview" to="body">
    <Transition name="mobile-floating-search">
      <div
        v-if="open"
        class="mobile-floating-search-backdrop"
        role="presentation"
        :style="
          keyboardInset || viewportTopInset
            ? {
                '--mobile-search-top-inset': `${viewportTopInset}px`,
                '--mobile-search-keyboard-inset': `${keyboardInset}px`,
              }
            : undefined
        "
        @click.self="dismissSearch()"
        @keydown.escape.prevent="dismissSearch()"
      >
        <form class="mobile-floating-search" role="search" @submit.prevent="submitAndClose()">
          <svg
            class="mobile-floating-search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            ref="inputEl"
            v-model="search"
            type="search"
            :aria-label="ariaLabel"
            :placeholder="placeholder"
            enterkeyhint="search"
            autocomplete="off"
            @input="scheduleSearch()"
            @compositionstart="startComposition"
            @compositionend="finishComposition"
            @keydown.escape.prevent="dismissSearch()"
          />
          <button
            v-if="search"
            class="mobile-floating-search-clear"
            type="button"
            aria-label="清空搜索"
            @click="clearSearch()"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path d="m8 8 8 8M16 8l-8 8" />
            </svg>
          </button>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>
