<script setup lang="ts">
import { onActivated, onMounted, ref, watch } from "vue";
import type { RelicSetCatalogueEntry } from "@/types";
import { ownedCountOf } from "./owned-counts";

defineOptions({ name: "RelicSetGrid" });

const props = defineProps<{
  sets: RelicSetCatalogueEntry[];
  ownedCounts: Map<number, number>;
}>();
const emit = defineEmits<{ select: [set: RelicSetCatalogueEntry] }>();

const animKey = ref(0);
const triggerAnimation = () => {
  animKey.value++;
};
onMounted(triggerAnimation);
onActivated(triggerAnimation);
watch(() => props.sets, triggerAnimation);

const ownedCount = (setId: number) => ownedCountOf(props.ownedCounts, setId);
</script>
<template>
  <div class="relic-catalogue-section">
    <!-- 现代星铁质感遗器网格 -->
    <div :key="animKey" class="catalogue-grid">
      <button
        v-for="(set, index) in sets"
        :key="set.id"
        :class="['catalogue-card', `catalogue-card-${set.kind}`]"
        :style="{ '--row-i': Math.floor(index / 3) }"
        type="button"
        aria-haspopup="dialog"
        :aria-label="`查看推荐使用${set.name}的角色`"
        @click="emit('select', set)"
      >
        <!-- 头部行：左侧图标+标题，右侧持有Badge -->
        <div class="catalogue-card-top">
          <div class="catalogue-card-media">
            <div class="catalogue-media-box">
              <img v-if="set.image" :src="set.image" :alt="set.name" />
              <span v-else class="catalogue-placeholder">◇</span>
            </div>
            <div class="catalogue-title-wrap">
              <h4>{{ set.name }}</h4>
              <span class="catalogue-kind-badge">{{
                set.kind === "planar" ? "位面饰品" : "隧洞遗器"
              }}</span>
            </div>
            <small :class="['catalogue-owned', { empty: ownedCount(set.id) === 0 }]">
              <template v-if="ownedCount(set.id) > 0"
                >持有 <b>{{ ownedCount(set.id) }}</b> 件</template
              >
              <template v-else>未持有</template>
            </small>
          </div>
        </div>

        <!-- 效果描述全宽行列表 -->
        <div class="relic-effects-list">
          <div class="relic-effect-row">
            <span class="relic-piece-tag piece-2">2 件</span>
            <p class="relic-effect-desc">{{ set.effects.twoPiece }}</p>
          </div>
          <div v-if="set.effects.fourPiece" class="relic-effect-row">
            <span class="relic-piece-tag piece-4">4 件</span>
            <p class="relic-effect-desc">{{ set.effects.fourPiece }}</p>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>
