<script setup lang="ts">
import InlineSpinner from "./InlineSpinner.vue";

withDefaults(
  defineProps<{
    variant?: "page" | "list" | "cards" | "detail" | "chart" | "form" | "inline" | "bar";
    label?: string;
    hint?: string;
    rows?: number;
    compact?: boolean;
  }>(),
  {
    variant: "inline",
    label: "",
    hint: "",
    rows: 4,
    compact: false,
  },
);
</script>

<template>
  <div
    v-if="variant === 'bar'"
    class="loading-progress-bar"
    role="status"
    :aria-label="label || '正在加载'"
  >
    <span class="loading-progress-bar-fill" />
  </div>

  <div
    v-else-if="variant === 'inline'"
    :class="['loading-inline', { 'is-compact': compact }]"
    role="status"
    aria-live="polite"
  >
    <InlineSpinner :size="compact ? 'xs' : 'sm'" />
    <span v-if="label" class="loading-inline-label">{{ label }}</span>
  </div>

  <div
    v-else-if="variant === 'page'"
    :class="['loading-stage', { 'is-compact': compact }]"
    role="status"
    aria-live="polite"
  >
    <div class="loading-orbit" aria-hidden="true">
      <span class="loading-orbit-ring" />
      <span class="loading-orbit-core" />
    </div>
    <p v-if="label" class="loading-stage-label">{{ label }}</p>
    <p v-if="hint" class="loading-stage-hint">{{ hint }}</p>
    <div v-if="!compact" class="loading-stage-bars" aria-hidden="true">
      <span class="sk-block" style="width: 72%" />
      <span class="sk-block" style="width: 54%" />
    </div>
  </div>

  <div
    v-else-if="variant === 'detail'"
    :class="['loading-skeleton-wrap', 'is-detail', { 'is-compact': compact }]"
    role="status"
    aria-live="polite"
  >
    <div v-if="label" class="loading-status-strip">
      <InlineSpinner size="sm" />
      <span>{{ label }}</span>
    </div>
    <div class="sk-detail-hero" aria-hidden="true">
      <span class="sk-block sk-avatar-lg" />
      <div class="sk-stack">
        <span class="sk-block sk-line-lg" style="width: 56%" />
        <span class="sk-block sk-line-sm" style="width: 38%" />
        <div class="sk-pill-row">
          <span class="sk-block sk-pill" />
          <span class="sk-block sk-pill" />
          <span class="sk-block sk-pill" />
        </div>
      </div>
    </div>
    <div class="sk-detail-grid" aria-hidden="true">
      <span v-for="i in rows" :key="i" class="sk-block sk-stat-tile" />
    </div>
    <div class="sk-detail-section" aria-hidden="true">
      <span class="sk-block sk-line-md" style="width: 32%" />
      <span class="sk-block sk-bar-tall" />
      <span class="sk-block sk-bar-tall" />
    </div>
  </div>

  <div
    v-else-if="variant === 'cards'"
    :class="['loading-skeleton-wrap', 'is-cards', { 'is-compact': compact }]"
    role="status"
    aria-live="polite"
  >
    <div v-if="label" class="loading-status-strip">
      <InlineSpinner size="sm" />
      <span>{{ label }}</span>
    </div>
    <div class="sk-card-list" aria-hidden="true">
      <div v-for="i in rows" :key="i" class="sk-card">
        <div class="sk-card-head">
          <span class="sk-block sk-avatar" />
          <div class="sk-stack">
            <span class="sk-block sk-line-md" style="width: 44%" />
            <span class="sk-block sk-line-sm" style="width: 68%" />
          </div>
          <span class="sk-block sk-badge" />
        </div>
        <div class="sk-card-meters">
          <span class="sk-block sk-meter" />
          <span class="sk-block sk-meter" />
        </div>
      </div>
    </div>
  </div>

  <div
    v-else-if="variant === 'chart'"
    :class="['loading-skeleton-wrap', 'is-chart', { 'is-compact': compact }]"
    role="status"
    aria-live="polite"
  >
    <div v-if="label" class="loading-status-strip">
      <InlineSpinner size="sm" />
      <span>{{ label }}</span>
    </div>
    <div class="sk-chart-list" aria-hidden="true">
      <div v-for="i in rows" :key="i" class="sk-chart-row">
        <span class="sk-block sk-rank" />
        <span class="sk-block sk-icon-sm" />
        <span class="sk-block sk-line-sm" style="width: 96px" />
        <span class="sk-block sk-chart-bar" :style="{ width: `${Math.max(24, 88 - i * 11)}%` }" />
        <span class="sk-block sk-badge-sm" />
      </div>
    </div>
  </div>

  <div
    v-else-if="variant === 'form'"
    :class="['loading-skeleton-wrap', 'is-form', { 'is-compact': compact }]"
    role="status"
    aria-live="polite"
  >
    <div v-if="label" class="loading-status-strip">
      <InlineSpinner size="sm" />
      <span>{{ label }}</span>
    </div>
    <div class="sk-form-grid" aria-hidden="true">
      <div v-for="i in rows" :key="i" class="sk-form-field">
        <span class="sk-block sk-line-sm" style="width: 28%" />
        <span class="sk-block sk-input" />
      </div>
    </div>
  </div>

  <div
    v-else
    :class="['loading-skeleton-wrap', 'is-list', { 'is-compact': compact }]"
    role="status"
    aria-live="polite"
  >
    <div v-if="label" class="loading-status-strip">
      <InlineSpinner size="sm" />
      <span>{{ label }}</span>
      <small v-if="hint" class="loading-status-hint">{{ hint }}</small>
    </div>
    <div class="sk-list-rows" aria-hidden="true">
      <div v-for="i in rows" :key="i" class="sk-list-row">
        <span class="sk-block sk-avatar" />
        <div class="sk-stack">
          <span class="sk-block sk-line-md" :style="{ width: `${52 + ((i * 13) % 28)}%` }" />
          <span class="sk-block sk-line-sm" :style="{ width: `${34 + ((i * 17) % 32)}%` }" />
        </div>
        <span class="sk-block sk-badge" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading-progress-bar {
  position: relative;
  width: 100%;
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(36, 86, 166, 0.12);
}

.loading-progress-bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 38%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--blue-deep, #173d7a), var(--cyan, #45aeb7));
  animation: loading-bar-slide 1.15s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes loading-bar-slide {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(310%);
  }
}

.loading-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--blue, #2456a6);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.loading-inline.is-compact {
  gap: 6px;
  font-size: 11px;
}

.loading-inline-label {
  color: var(--ink-soft, #52627b);
}

.loading-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 180px;
  padding: 28px 20px;
  text-align: center;
}

.loading-stage.is-compact {
  min-height: 110px;
  padding: 18px 16px;
}

.loading-orbit {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
}

.loading-orbit-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2.5px solid rgba(36, 86, 166, 0.16);
  border-top-color: var(--blue, #2456a6);
  border-right-color: var(--cyan, #45aeb7);
  animation: loading-orbit-spin 0.85s linear infinite;
}

.loading-orbit-core {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: linear-gradient(135deg, var(--blue, #2456a6), var(--gold, #c7a55a));
  transform: rotate(45deg);
  animation: loading-core-pulse 1.5s ease-in-out infinite;
}

.loading-stage-label {
  margin: 2px 0 0;
  color: var(--ink, #172643);
  font-size: 13px;
  font-weight: 600;
}

.loading-stage-hint {
  margin: 0;
  max-width: 340px;
  color: var(--muted, #8794a8);
  font-size: 12px;
  line-height: 1.5;
}

.loading-stage-bars {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: min(260px, 82%);
  margin-top: 4px;
}

.loading-stage-bars .sk-block {
  height: 8px;
  border-radius: 999px;
}

.loading-skeleton-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  padding: 8px 2px;
}

.loading-skeleton-wrap.is-compact {
  gap: 8px;
  padding: 4px 0;
}

.loading-status-strip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--blue, #2456a6);
  font-size: 12px;
  font-weight: 600;
}

.loading-status-strip span {
  color: var(--ink-soft, #52627b);
}

.loading-status-hint {
  color: var(--muted, #8794a8);
  font-size: 11px;
  font-weight: 400;
}

.sk-block {
  display: block;
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    rgba(36, 86, 166, 0.06) 20%,
    rgba(36, 86, 166, 0.13) 50%,
    rgba(36, 86, 166, 0.06) 80%
  );
  background-size: 200% 100%;
  animation: loading-shimmer 1.4s ease-in-out infinite;
}

.sk-stack {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.sk-avatar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
}

.sk-avatar-lg {
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  border-radius: 14px;
}

.sk-icon-sm {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
}

.sk-line-lg {
  height: 16px;
}

.sk-line-md {
  height: 13px;
}

.sk-line-sm {
  height: 10px;
}

.sk-badge {
  flex-shrink: 0;
  width: 54px;
  height: 24px;
  border-radius: 999px;
}

.sk-badge-sm {
  flex-shrink: 0;
  width: 38px;
  height: 20px;
  border-radius: 999px;
}

.sk-pill-row {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.sk-pill {
  width: 52px;
  height: 18px;
  border-radius: 999px;
}

.sk-list-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sk-list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(36, 86, 166, 0.08);
  background: rgba(255, 255, 255, 0.78);
}

.sk-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sk-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 14px;
  border: 1px solid rgba(36, 86, 166, 0.08);
  background: rgba(255, 255, 255, 0.86);
}

.sk-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sk-card-meters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.sk-meter {
  height: 28px;
  border-radius: 8px;
}

.sk-detail-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid rgba(36, 86, 166, 0.08);
  background: rgba(245, 248, 253, 0.72);
}

.sk-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.sk-stat-tile {
  height: 48px;
  border-radius: 10px;
}

.sk-detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

.sk-bar-tall {
  height: 40px;
  border-radius: 10px;
}

.sk-chart-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sk-chart-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(36, 86, 166, 0.07);
  background: rgba(255, 255, 255, 0.8);
}

.sk-rank {
  flex-shrink: 0;
  width: 22px;
  height: 16px;
}

.sk-chart-bar {
  flex: 1 1 auto;
  height: 14px;
  border-radius: 999px;
}

.sk-form-grid {
  display: grid;
  gap: 12px;
}

.sk-form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sk-input {
  height: 36px;
  border-radius: 8px;
}

@keyframes loading-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@keyframes loading-orbit-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes loading-core-pulse {
  0%,
  100% {
    opacity: 0.75;
    transform: rotate(45deg) scale(0.92);
  }
  50% {
    opacity: 1;
    transform: rotate(45deg) scale(1.08);
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-progress-bar-fill,
  .loading-orbit-ring,
  .loading-orbit-core,
  .sk-block {
    animation: none;
  }
}
</style>
