<script setup lang="ts">
import type { RelicSetCatalogueEntry } from "@/types";
import { ownedCountOf } from "./owned-counts";

const props = defineProps<{
  sets: RelicSetCatalogueEntry[];
  ownedCounts: Map<number, number>;
}>();
const emit = defineEmits<{ select: [set: RelicSetCatalogueEntry] }>();

const ownedCount = (setId: number) => ownedCountOf(props.ownedCounts, setId);
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
      <div class="catalogue-card-media">
        <img v-if="set.image" :src="set.image" :alt="set.name" /><span
          v-else
          class="catalogue-placeholder"
          >◇</span
        >
        <small :class="['catalogue-owned', { empty: ownedCount(set.id) === 0 }]">
          <template v-if="ownedCount(set.id) > 0"
            >持有 <b>{{ ownedCount(set.id) }}</b> 件</template
          >
          <template v-else>未持有</template>
        </small>
      </div>
      <div>
        <h4>{{ set.name }}</h4>
        <p><b>2 件</b>{{ set.effects.twoPiece }}</p>
        <p v-if="set.effects.fourPiece"><b>4 件</b>{{ set.effects.fourPiece }}</p>
      </div>
    </button>
  </div>
</template>
