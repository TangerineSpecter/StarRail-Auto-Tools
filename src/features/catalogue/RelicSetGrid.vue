<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from "vue";
import { buildPlanApi } from "@/shared/api/build-plan";
import type { RelicSetCatalogueEntry, RelicSetTargetCount } from "@/types";
import { ownedCountOf } from "./owned-counts";
import { sortRelicSetsByTargetCount } from "./relic-target-chart";

defineOptions({ name: "RelicSetGrid" });

const props = defineProps<{
  sets: RelicSetCatalogueEntry[];
  ownedCounts: Map<number, number>;
}>();
const emit = defineEmits<{ select: [set: RelicSetCatalogueEntry] }>();

const viewMode = ref<"cards" | "chart">("cards");
const animKey = ref(0);
const triggerAnimation = () => {
  animKey.value++;
};
onMounted(triggerAnimation);
const targetCounts = ref<RelicSetTargetCount[]>([]);
const chartLoading = ref(false);
const chartError = ref("");
let requestId = 0;

const chartItems = computed(() => sortRelicSetsByTargetCount(props.sets, targetCounts.value));
const maxTargetCount = computed(() => chartItems.value[0]?.targetCount ?? 0);
const setKindLabel = computed(() => (props.sets[0]?.kind === "planar" ? "位面饰品" : "遗器"));

async function loadTargetCounts() {
  const currentRequestId = ++requestId;
  chartLoading.value = true;
  chartError.value = "";
  try {
    const counts = await buildPlanApi.relicSetTargetCounts();
    if (currentRequestId !== requestId) return;
    targetCounts.value = counts;
  } catch (cause) {
    if (currentRequestId !== requestId) return;
    chartError.value = String(cause);
  } finally {
    if (currentRequestId === requestId) chartLoading.value = false;
  }
}

watch(viewMode, (mode) => {
  if (mode === "chart") void loadTargetCounts();
});
onActivated(() => {
  triggerAnimation();
  if (viewMode.value === "chart") void loadTargetCounts();
});
watch(() => props.sets, triggerAnimation);
onUnmounted(() => {
  requestId += 1;
});

const ownedCount = (setId: number) => ownedCountOf(props.ownedCounts, setId);
</script>
<template>
  <div class="relic-catalogue-section">
    <div class="relic-catalogue-toolbar">
      <div>
        <p class="relic-catalogue-kicker">SET TARGET PULSE</p>
        <strong>{{ viewMode === "cards" ? `${setKindLabel}套装图鉴` : "目标角色分布" }}</strong>
      </div>
      <div class="relic-view-switch" role="group" :aria-label="`${setKindLabel}展示方式`">
        <button
          type="button"
          :class="{ active: viewMode === 'cards' }"
          :aria-pressed="viewMode === 'cards'"
          @click="viewMode = 'cards'"
        >
          卡片
        </button>
        <button
          type="button"
          :class="{ active: viewMode === 'chart' }"
          :aria-pressed="viewMode === 'chart'"
          @click="viewMode = 'chart'"
        >
          柱状图
        </button>
      </div>
    </div>

    <!-- 按目标角色数量排序的套装柱状图 -->
    <div
      v-if="viewMode === 'chart'"
      class="relic-target-chart"
      role="region"
      :aria-label="`${setKindLabel}目标角色数量`"
    >
      <div class="relic-target-chart-heading">
        <div>
          <p class="eyebrow">BUILD PLAN TARGETS</p>
          <h3>{{ setKindLabel }} · 设置为目标的角色数量</h3>
        </div>
        <small>数量倒序 · 共 {{ chartItems.length }} 套</small>
      </div>
      <p v-if="chartLoading" class="relic-target-chart-state">正在整理目标角色数据…</p>
      <p v-else-if="chartError" class="relic-target-chart-state error">{{ chartError }}</p>
      <p v-else-if="!chartItems.length" class="relic-target-chart-state">当前分类暂无套装数据。</p>
      <div v-else class="relic-target-chart-list">
        <button
          v-for="(item, index) in chartItems"
          :key="item.set.id"
          type="button"
          class="relic-target-bar-row"
          :style="{ '--bar-i': index }"
          :aria-label="`查看${item.set.name}，${item.targetCount}名目标角色`"
          @click="emit('select', item.set)"
        >
          <span class="relic-target-bar-rank">{{ String(index + 1).padStart(2, "0") }}</span>
          <span class="relic-target-bar-icon">
            <img v-if="item.set.image" :src="item.set.image" :alt="item.set.name" />
            <span v-else>◇</span>
          </span>
          <span class="relic-target-bar-name" :title="item.set.name">{{ item.set.name }}</span>
          <span class="relic-target-bar-track">
            <i
              :style="{
                width: `${maxTargetCount ? (item.targetCount / maxTargetCount) * 100 : 0}%`,
              }"
            />
          </span>
          <b class="relic-target-bar-count">{{ item.targetCount }}<small>名</small></b>
          <span class="relic-target-bar-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>

    <!-- 现代星铁质感遗器网格 -->
    <div v-else :key="animKey" class="catalogue-grid">
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
