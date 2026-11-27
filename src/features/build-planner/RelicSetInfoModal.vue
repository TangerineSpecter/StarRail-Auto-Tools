<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { slotLabel } from "@/shared/catalogue/relic-options";
import type { RelicSetCatalogueEntry } from "@/types";

const props = withDefaults(
  defineProps<{
    set: RelicSetCatalogueEntry;
    selectable?: boolean;
    selected?: boolean;
  }>(),
  {
    selectable: false,
    selected: false,
  },
);

const emit = defineEmits<{
  close: [];
  select: [setId: number];
}>();

const modalRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);

const kindLabel = computed(() => (props.set.kind === "planar" ? "位面饰品" : "隧洞遗器"));
const archiveEyebrow = computed(() =>
  props.set.kind === "planar" ? "PLANAR ORNAMENT ARCHIVE" : "CAVERN RELIC ARCHIVE",
);
const structureLabel = computed(() => (props.set.kind === "planar" ? "2 件套" : "2 件套 / 4 件套"));
const pieces = computed(() => props.set.pieces ?? []);

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && !event.isComposing) {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    emit("close");
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    modalRef.value?.querySelectorAll<HTMLElement>(
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
    event.stopImmediatePropagation();
    event.stopPropagation();
    focusable[nextIndex].focus();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleWindowKeydown, true);
  void nextTick(() => closeButtonRef.value?.focus());
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleWindowKeydown, true);
});
</script>

<template>
  <Teleport to="body">
    <div class="build-set-info-backdrop" @click.self="emit('close')">
      <section
        ref="modalRef"
        class="build-set-info-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="`${set.name}图鉴信息`"
      >
        <header class="build-set-info-header">
          <div class="build-set-info-cover">
            <img v-if="set.image" :src="set.image" :alt="set.name" />
            <span v-else class="build-set-info-fallback">◇</span>
          </div>
          <div class="build-set-info-heading">
            <p class="build-set-info-eyebrow">{{ archiveEyebrow }}</p>
            <h3>{{ set.name }}</h3>
            <div class="build-set-info-meta">
              <span>{{ kindLabel }}</span>
              <span>{{ structureLabel }}</span>
            </div>
          </div>
          <button
            ref="closeButtonRef"
            class="build-set-info-close"
            type="button"
            aria-label="关闭套装图鉴"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <div class="build-set-info-body">
          <section class="build-set-info-section">
            <header class="build-set-info-section-head">
              <div>
                <p class="build-set-info-section-eyebrow">SET EFFECTS</p>
                <h4>套装效果</h4>
              </div>
            </header>
            <div class="build-set-info-effects">
              <div class="build-set-info-effect-row">
                <span class="build-set-info-piece-tag is-two">2 件</span>
                <p>{{ set.effects.twoPiece || "暂无二件套效果说明。" }}</p>
              </div>
              <div v-if="set.effects.fourPiece" class="build-set-info-effect-row">
                <span class="build-set-info-piece-tag is-four">4 件</span>
                <p>{{ set.effects.fourPiece }}</p>
              </div>
            </div>
          </section>

          <section v-if="pieces.length" class="build-set-info-section">
            <header class="build-set-info-section-head">
              <div>
                <p class="build-set-info-section-eyebrow">SET PIECES</p>
                <h4>套装部位</h4>
              </div>
              <small>共 {{ pieces.length }} 件</small>
            </header>
            <div :class="['build-set-info-pieces', { 'is-planar': set.kind === 'planar' }]">
              <div v-for="piece in pieces" :key="piece.slot" class="build-set-info-piece-card">
                <img :src="piece.image" :alt="`${set.name}·${slotLabel(piece.slot)}`" />
                <span>{{ slotLabel(piece.slot) }}</span>
              </div>
            </div>
          </section>
        </div>

        <footer v-if="selectable" class="build-set-info-footer">
          <span v-if="selected" class="build-set-info-selected-badge">✓ 当前已选择</span>
          <span v-else />
          <div class="build-set-info-footer-actions">
            <button type="button" class="build-set-info-btn-secondary" @click="emit('close')">
              关闭
            </button>
            <button
              v-if="!selected"
              type="button"
              class="build-set-info-btn-primary"
              @click="emit('select', set.id)"
            >
              选择此套装
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style>
/* Teleported modal sits on body; use feature-prefixed global rules. */
.build-set-info-backdrop {
  position: fixed;
  z-index: 160;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(14, 27, 49, 0.46);
  backdrop-filter: blur(5px);
}

.build-set-info-modal {
  position: relative;
  width: min(490px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(196, 164, 94, 0.68);
  border-radius: 12px;
  background: #f6f9fd;
  box-shadow: 0 28px 70px rgba(8, 19, 39, 0.42);
  animation: build-set-info-in 180ms ease-out;
}

@keyframes build-set-info-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.build-set-info-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 58px 20px 22px;
  color: #fff;
  background:
    linear-gradient(125deg, #1e3659, #315e99 64%, #467ec5),
    radial-gradient(circle at 82% 0%, rgba(237, 203, 120, 0.34), transparent 45%);
}

.build-set-info-cover {
  display: grid;
  flex: 0 0 64px;
  width: 64px;
  height: 64px;
  place-items: center;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.14);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
}

.build-set-info-cover img {
  width: 54px;
  height: 54px;
  object-fit: contain;
  filter: drop-shadow(0 3px 8px rgba(8, 19, 39, 0.3));
}

.build-set-info-fallback {
  color: rgba(255, 255, 255, 0.78);
  font-size: 24px;
}

.build-set-info-heading {
  min-width: 0;
  flex: 1 1 auto;
}

.build-set-info-eyebrow {
  margin: 0;
  color: #f1d48a;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.build-set-info-heading h3 {
  margin: 5px 0 8px;
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
}

.build-set-info-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.build-set-info-meta span {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: rgba(15, 31, 56, 0.28);
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
}

.build-set-info-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  color: #fff;
  background: rgba(17, 34, 62, 0.42);
  font-size: 21px;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    border-color 140ms ease;
}

.build-set-info-close:hover:not(:disabled),
.build-set-info-close:focus-visible {
  border-color: #fff;
  background: rgba(17, 34, 62, 0.72);
  outline: none;
  transform: none;
}

.build-set-info-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px 20px;
}

.build-set-info-section {
  padding: 14px 15px;
  border: 1px solid rgba(46, 80, 123, 0.14);
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 2px 6px rgba(35, 75, 128, 0.04);
}

.build-set-info-section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 11px;
}

.build-set-info-section-eyebrow {
  margin: 0;
  color: #9a7839;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.13em;
}

.build-set-info-section-head h4 {
  margin: 3px 0 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
}

.build-set-info-section-head small {
  color: var(--muted);
  font-size: 11px;
}

.build-set-info-effects {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.build-set-info-effect-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid rgba(48, 75, 117, 0.1);
  border-radius: 7px;
  background: #f8fbff;
}

.build-set-info-piece-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
}

.build-set-info-piece-tag.is-two {
  color: #173d7a;
  background: #e0ecfa;
  border: 1px solid rgba(36, 86, 166, 0.2);
}

.build-set-info-piece-tag.is-four {
  color: #8a5712;
  background: #faebd2;
  border: 1px solid rgba(199, 140, 45, 0.28);
}

.build-set-info-effect-row p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.build-set-info-pieces {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.build-set-info-pieces.is-planar {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.build-set-info-piece-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 9px 6px 8px;
  border: 1px solid rgba(46, 80, 123, 0.11);
  border-radius: 7px;
  background: linear-gradient(180deg, #fafcff 0%, #f1f6fc 100%);
}

.build-set-info-piece-card img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.build-set-info-piece-card span {
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 600;
}

.build-set-info-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px 14px;
  border-top: 1px solid rgba(46, 80, 123, 0.12);
  background: #fff;
}

.build-set-info-selected-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: #e8f0fb;
  color: var(--blue);
  font-size: 12px;
  font-weight: 700;
}

.build-set-info-footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.build-set-info-btn-secondary,
.build-set-info-btn-primary {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 5px;
  font: 600 12px/1 var(--font-ui);
  cursor: pointer;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.build-set-info-btn-secondary {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink-soft);
}

.build-set-info-btn-secondary:hover,
.build-set-info-btn-secondary:focus-visible {
  border-color: rgba(36, 86, 166, 0.45);
  color: var(--blue);
  outline: none;
}

.build-set-info-btn-primary {
  border: 1px solid var(--blue);
  background: linear-gradient(135deg, #3264b2, #1d4a96);
  color: #fff;
}

.build-set-info-btn-primary:hover,
.build-set-info-btn-primary:focus-visible {
  border-color: var(--blue-deep);
  background: linear-gradient(135deg, #2b58a0, #173d7a);
  outline: none;
}

@media (prefers-reduced-motion: reduce) {
  .build-set-info-modal {
    animation: none;
  }
}
</style>
