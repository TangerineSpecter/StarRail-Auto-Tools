<script setup lang="ts">
import type { RelicSetCatalogueEntry } from "@/types";
defineProps<{ sets: RelicSetCatalogueEntry[] }>();
const emit = defineEmits<{ select: [set: RelicSetCatalogueEntry] }>();
</script>
<template>
  <div class="catalogue-grid">
    <button
      v-for="set in sets"
      :key="set.id"
      class="catalogue-card"
      type="button"
      aria-haspopup="dialog"
      :aria-label="`查看推荐使用${set.name}的角色`"
      @click="emit('select', set)"
    >
      <img v-if="set.image" :src="set.image" :alt="set.name" /><span
        v-else
        class="catalogue-placeholder"
        >◇</span
      >
      <div>
        <small>#{{ set.id }}</small>
        <h4>{{ set.name }}</h4>
        <p><b>2 件</b>{{ set.effects.twoPiece }}</p>
        <p v-if="set.effects.fourPiece"><b>4 件</b>{{ set.effects.fourPiece }}</p>
      </div>
    </button>
  </div>
</template>
