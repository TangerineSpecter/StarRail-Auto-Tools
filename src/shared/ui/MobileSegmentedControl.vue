<script setup lang="ts" generic="T extends string">
/** iOS-style single-tap segmented control for compact mobile filter options. */
defineProps<{
  options: ReadonlyArray<{ label: string; value: T }>;
  ariaLabel?: string;
}>();

const modelValue = defineModel<T>({ required: true });
</script>

<template>
  <div class="mobile-segmented" role="radiogroup" :aria-label="ariaLabel">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      :class="['mobile-segmented-option', { 'is-active': modelValue === option.value }]"
      @click="modelValue = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.mobile-segmented {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: #edf2f8;
}

.mobile-segmented-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 34px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #546985;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    box-shadow 140ms ease;
}

.mobile-segmented-option.is-active {
  background: #ffffff;
  color: #1655b3;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(20, 42, 74, 0.14);
}
</style>
