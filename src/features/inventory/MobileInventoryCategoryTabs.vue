<script setup lang="ts">
import { computed } from "vue";
import type { InventoryKind } from "@/types";
import { mobileInventoryCategories } from "./mobile-inventory-categories";

const props = defineProps<{ kind: InventoryKind; position?: number; motionMs?: number }>();
const emit = defineEmits<{ category: [kind: InventoryKind] }>();
const index = computed(() => mobileInventoryCategories.findIndex((item) => item.id === props.kind));
</script>

<template>
  <nav
    class="mobile-inventory-categories"
    aria-label="背包分类"
    :style="{ '--inventory-category-index': position ?? index }"
  >
    <button
      v-for="item in mobileInventoryCategories"
      :key="item.id"
      type="button"
      :class="{ active: kind === item.id }"
      :aria-pressed="kind === item.id"
      @click="emit('category', item.id)"
    >
      {{ item.name }}
    </button>
    <span
      class="mobile-inventory-category-indicator"
      :style="{ transitionDuration: motionMs === undefined ? undefined : `${motionMs}ms` }"
      aria-hidden="true"
    />
  </nav>
</template>
