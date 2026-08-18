<script setup lang="ts">
import { pathIconSrc } from "@/shared/catalogue";
import type { LightConeCatalogueEntry } from "@/types";
import { ownedCountOf } from "./owned-counts";

const props = defineProps<{
  lightCones: LightConeCatalogueEntry[];
  ownedCounts: Map<number, number>;
}>();
const emit = defineEmits<{ select: [lightCone: LightConeCatalogueEntry] }>();

const ownedCount = (id: number) => ownedCountOf(props.ownedCounts, id);
</script>
<template>
  <div class="lightcone-catalogue-grid">
    <button
      v-for="item in lightCones"
      :key="item.id"
      class="lightcone-catalogue-card"
      type="button"
      aria-haspopup="dialog"
      :aria-label="`查看${item.name}的图鉴信息`"
      @click="emit('select', item)"
    >
      <img
        v-if="item.image"
        class="lightcone-catalogue-art"
        :src="item.image"
        :alt="item.name"
      /><span v-else class="lightcone-catalogue-art catalogue-placeholder">◇</span>
      <div class="lightcone-catalogue-body">
        <small :class="['catalogue-owned', { empty: ownedCount(item.id) === 0 }]">
          <template v-if="ownedCount(item.id) > 0"
            >持有 <b>{{ ownedCount(item.id) }}</b> 把</template
          >
          <template v-else>未持有</template>
        </small>
        <h4>{{ item.name }}</h4>
        <p class="lightcone-catalogue-meta">
          <img
            v-if="item.path"
            class="lightcone-catalogue-path-icon"
            :src="pathIconSrc(item.path)"
            alt=""
          />
          <span>{{ item.path }}</span>
        </p>
        <p class="lightcone-catalogue-stars">{{ "★".repeat(item.rarity) }}</p>
      </div>
    </button>
  </div>
</template>
