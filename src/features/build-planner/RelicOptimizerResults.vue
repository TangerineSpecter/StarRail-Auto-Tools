<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import { slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import type {
  OptimizedRelicBuild,
  RelicOptimizerResult,
  RelicOptimizerSearchResult,
} from "@/types";

const props = defineProps<{
  calculating: boolean;
  phase: string;
  result: RelicOptimizerResult | null;
}>();
const emit = defineEmits<{ close: []; cancel: [] }>();
const mode = ref<"strict" | "relaxed">("strict");
const selectedIndex = ref(0);

watch(
  () => props.result,
  () => {
    mode.value = "strict";
    selectedIndex.value = 0;
  },
);
watch(mode, () => (selectedIndex.value = 0));

const searchResult = computed<RelicOptimizerSearchResult | null>(() => {
  if (!props.result) return null;
  return mode.value === "strict" ? props.result.strict : props.result.relaxed;
});
const selectedBuild = computed(
  () => searchResult.value?.builds[selectedIndex.value] ?? searchResult.value?.nearest ?? null,
);
const isNearest = computed(
  () =>
    !!searchResult.value && searchResult.value.builds.length === 0 && !!searchResult.value.nearest,
);

function number(value: number, digits = 1) {
  return Number(value.toFixed(digits)).toString();
}
function activeSetLabel(build: OptimizedRelicBuild) {
  return build.activeSets.length
    ? build.activeSets.map((set) => `${set.name} ${set.pieces}件`).join(" · ")
    : "未激活套装效果";
}
function currentTargetValue(statKey: string) {
  return props.result?.current?.targetProgress.find((target) => target.statKey === statKey)
    ?.current;
}
function scoreDelta(build: OptimizedRelicBuild) {
  return props.result?.current ? build.weightedRolls - props.result.current.weightedRolls : null;
}
</script>

<template>
  <div class="optimizer-backdrop" @click.self="emit('close')">
    <section class="optimizer-dialog" role="dialog" aria-modal="true" aria-label="全局遗器优化结果">
      <header>
        <div>
          <p class="eyebrow">GLOBAL RELIC OPTIMIZER</p>
          <h2>全局遗器优化</h2>
          <small>按词条权重排序；最低属性为硬门槛，条件型战斗效果未计入。</small>
        </div>
        <button type="button" aria-label="关闭优化结果" @click="emit('close')">×</button>
      </header>

      <div v-if="calculating" class="optimizer-loading">
        <span class="optimizer-spinner" />
        <h3>{{ phase || "正在搜索六件组合…" }}</h3>
        <p>计算在独立线程中进行，可随时取消。</p>
        <Button type="button" outlined @click="emit('cancel')">取消计算</Button>
      </div>

      <template v-else-if="result">
        <nav v-if="result.relaxed" class="optimizer-modes" aria-label="优化模式">
          <button type="button" :class="{ active: mode === 'strict' }" @click="mode = 'strict'">
            严格套装
          </button>
          <button type="button" :class="{ active: mode === 'relaxed' }" @click="mode = 'relaxed'">
            散件对照
          </button>
        </nav>

        <div v-if="searchResult" class="optimizer-body">
          <aside class="optimizer-ranking">
            <div class="optimizer-diagnostics">
              <b>{{ searchResult.diagnostics.searchMode === "exact" ? "精确搜索" : "有界搜索" }}</b>
              <span>
                {{ searchResult.diagnostics.retainedCandidates }} /
                {{ searchResult.diagnostics.originalCandidates }}
                件候选
              </span>
              <span>评估 {{ searchResult.diagnostics.evaluatedBuilds.toLocaleString() }} 套</span>
              <span>耗时 {{ searchResult.diagnostics.durationMs }} ms</span>
              <small v-if="searchResult.diagnostics.truncated"
                >高质量近似结果，候选池已裁剪。</small
              >
            </div>
            <div v-if="result.current" class="optimizer-current">
              <span>当前装备</span>
              <b>{{ number(result.current.weightedRolls, 2) }} rolls</b>
              <small>{{ activeSetLabel(result.current) }}</small>
            </div>
            <button
              v-for="(build, index) in searchResult.builds"
              :key="build.relics.map((item) => item.itemId).join('-')"
              type="button"
              :class="['optimizer-rank', { active: selectedIndex === index && !isNearest }]"
              @click="selectedIndex = index"
            >
              <b>#{{ index + 1 }}</b>
              <span>{{ number(build.weightedRolls, 2) }} rolls</span>
              <small
                >换 {{ build.changedCount }} 件 · 潜力
                {{ number(build.averagePotentialPct) }}%</small
              >
            </button>
            <div v-if="searchResult.builds.length === 0" class="optimizer-empty">
              <b>没有满足全部最低属性的组合</b>
              <span v-if="searchResult.nearest">右侧展示最接近门槛的一套。</span>
              <span v-else>当前候选中有部位为空，请放宽筛选条件。</span>
            </div>
          </aside>

          <main v-if="selectedBuild" class="optimizer-detail">
            <div class="optimizer-summary">
              <div>
                <small>{{ isNearest ? "NEAREST BUILD" : `BUILD #${selectedIndex + 1}` }}</small>
                <h3>{{ isNearest ? "最接近门槛" : "推荐组合" }}</h3>
                <p>{{ activeSetLabel(selectedBuild) }}</p>
              </div>
              <div class="optimizer-score">
                <b>{{ number(selectedBuild.weightedRolls, 2) }}</b>
                <span>加权 rolls</span>
                <small v-if="scoreDelta(selectedBuild) !== null">
                  较当前 {{ scoreDelta(selectedBuild)! >= 0 ? "+" : ""
                  }}{{ number(scoreDelta(selectedBuild)!, 2) }}
                </small>
              </div>
            </div>

            <div class="optimizer-targets">
              <div
                v-for="target in selectedBuild.targetProgress"
                :key="target.statKey"
                :class="{ failed: !target.satisfied }"
              >
                <span>{{ statLabel(target.statKey) }}</span>
                <b>{{ target.current === null ? "—" : number(target.current) }}</b>
                <small>
                  当前装备
                  {{
                    currentTargetValue(target.statKey) == null
                      ? "—"
                      : number(currentTargetValue(target.statKey)!)
                  }}
                  · 最低 {{ number(target.minimum) }} · 目标 {{ number(target.target) }}
                </small>
              </div>
            </div>

            <div class="optimizer-relic-grid">
              <article v-for="relic in selectedBuild.relics" :key="relic.itemId">
                <header>
                  <b>{{ slotLabel(relic.slot) }}</b>
                  <span v-if="!relic.changed" class="tone-keep">保留</span>
                  <span v-else>换入</span>
                </header>
                <strong>{{ relic.setName || relic.name }}</strong>
                <p>{{ statLabel(relic.mainStat) }} · +{{ relic.level }}</p>
                <div>
                  <i v-if="relic.borrowed"
                    >借用：{{ relic.location || `角色 #${relic.equippedCharacterId}` }}</i
                  >
                  <i v-if="relic.unfinished">待强化</i>
                  <i v-if="relic.discard">已标记弃置</i>
                </div>
              </article>
            </div>

            <footer class="optimizer-footnote">
              <span>平均潜力 {{ number(selectedBuild.averagePotentialPct) }}%</span>
              <span>借用 {{ selectedBuild.borrowedCount }} 件</span>
              <span>未满强化 {{ selectedBuild.unfinishedCount }} 件</span>
              <span>换装 {{ selectedBuild.changedCount }} 件</span>
            </footer>
          </main>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.optimizer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1800;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(18, 38, 70, 0.32);
  backdrop-filter: blur(5px);
}
.optimizer-dialog {
  position: relative;
  width: min(1180px, 96vw);
  max-height: 92vh;
  overflow: hidden;
  border: 1px solid rgba(36, 86, 166, 0.3);
  border-radius: 12px;
  background: #f7f9fc;
  box-shadow: 0 28px 70px rgba(15, 36, 70, 0.28);
  color: var(--ink);
  animation: optimizer-dialog-in 180ms ease-out;
}
.optimizer-dialog::before {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
  left: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--blue-deep), var(--blue) 72%, var(--gold));
  content: "";
}
.optimizer-dialog > header,
.optimizer-summary,
.optimizer-relic-grid article header,
.optimizer-footnote {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.optimizer-dialog > header {
  position: relative;
  padding: 24px 28px 20px 34px;
  border-bottom: 1px solid var(--line);
  background:
    linear-gradient(100deg, rgba(232, 240, 251, 0.86), rgba(255, 255, 255, 0.96) 48%), #fff;
}
.optimizer-dialog > header::before {
  position: absolute;
  top: 22px;
  bottom: 20px;
  left: 20px;
  width: 3px;
  background: linear-gradient(var(--blue), var(--gold));
  content: "";
}
.optimizer-dialog > header .eyebrow {
  margin: 0;
  color: var(--blue);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
}
.optimizer-dialog > header h2 {
  margin: 4px 0 5px;
  color: var(--ink);
  font-size: 25px;
}
.optimizer-dialog > header small {
  color: var(--ink-soft);
}
.optimizer-dialog > header button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--blue);
  background: #fff;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}
.optimizer-dialog > header button:hover {
  border-color: rgba(36, 86, 166, 0.45);
  background: var(--blue-soft);
}
.optimizer-modes {
  display: flex;
  gap: 8px;
  padding: 13px 20px 0;
  background: #f7f9fc;
}
.optimizer-modes button {
  min-width: 96px;
  padding: 8px 15px;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--ink-soft);
  background: #fff;
  font: 600 11px/1 var(--font-ui);
  cursor: pointer;
}
.optimizer-modes button:hover {
  border-color: rgba(36, 86, 166, 0.38);
  color: var(--blue);
}
.optimizer-modes button.active {
  border-color: var(--blue);
  color: #fff;
  background: var(--blue);
  box-shadow: 0 4px 12px rgba(36, 86, 166, 0.18);
}
.optimizer-body {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 550px;
  max-height: calc(92vh - 108px);
  overflow: hidden;
  background: #fff;
}
.optimizer-ranking {
  overflow: auto;
  padding: 16px;
  border-right: 1px solid var(--line);
  background: #f1f5fa;
}
.optimizer-diagnostics {
  display: grid;
  gap: 5px;
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid rgba(36, 86, 166, 0.12);
  border-radius: 7px;
  color: var(--ink-soft);
  background: rgba(255, 255, 255, 0.82);
  font-size: 12px;
}
.optimizer-diagnostics b {
  color: var(--blue-deep);
}
.optimizer-diagnostics small {
  color: #8a692c;
}
.optimizer-current {
  display: grid;
  gap: 4px;
  padding: 11px 12px;
  margin-bottom: 12px;
  border: 1px solid rgba(199, 165, 90, 0.42);
  border-radius: 7px;
  background: linear-gradient(125deg, #fffdf7, #f5f8fc);
}
.optimizer-current span,
.optimizer-current small,
.optimizer-score small {
  color: var(--ink-soft);
}
.optimizer-current b {
  color: var(--blue-deep);
}
.optimizer-rank {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 10px;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.76);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    transform 140ms ease;
}
.optimizer-rank:hover {
  border-color: rgba(36, 86, 166, 0.4);
  transform: translateY(-1px);
}
.optimizer-rank.active {
  border-color: var(--blue);
  background: #fff;
  box-shadow: 0 6px 18px rgba(36, 86, 166, 0.12);
}
.optimizer-rank b,
.optimizer-rank.active span {
  color: var(--blue);
}
.optimizer-rank small {
  grid-column: 1 / -1;
  color: var(--muted);
}
.optimizer-empty {
  display: grid;
  gap: 8px;
  padding: 16px 10px;
  color: var(--ink-soft);
}
.optimizer-detail {
  overflow: auto;
  padding: 24px 28px 28px;
  background: linear-gradient(135deg, rgba(232, 240, 251, 0.3), transparent 34%), #fff;
}
.optimizer-summary {
  margin-bottom: 18px;
}
.optimizer-summary small {
  color: var(--blue);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.optimizer-summary h3 {
  margin: 4px 0;
  color: var(--ink);
  font-size: 21px;
}
.optimizer-summary p {
  margin: 0;
  color: var(--ink-soft);
}
.optimizer-score {
  display: grid;
  text-align: right;
}
.optimizer-score b {
  font-size: 28px;
  color: var(--blue);
}
.optimizer-score span {
  color: var(--ink-soft);
}
.optimizer-targets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
.optimizer-targets > div {
  display: grid;
  gap: 3px;
  padding: 11px 13px;
  border: 1px solid rgba(36, 86, 166, 0.2);
  border-radius: 7px;
  background: linear-gradient(135deg, #f7faff, #fff);
}
.optimizer-targets > div > span {
  color: var(--ink-soft);
  font-size: 11px;
}
.optimizer-targets > div > b {
  color: var(--blue-deep);
  font-size: 18px;
}
.optimizer-targets > div.failed {
  border-color: rgba(174, 82, 67, 0.46);
  background: #fff8f5;
}
.optimizer-targets > div.failed > b {
  color: #a2584b;
}
.optimizer-targets small {
  color: var(--muted);
}
.optimizer-relic-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.optimizer-relic-grid article {
  min-height: 108px;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(250, 252, 255, 0.88);
  box-shadow: 0 3px 10px rgba(35, 75, 128, 0.04);
}
.optimizer-relic-grid article header span {
  color: var(--blue);
  font-size: 12px;
}
.optimizer-relic-grid article header .tone-keep {
  color: #3d8a72;
}
.optimizer-relic-grid strong {
  display: block;
  margin-top: 10px;
  color: var(--ink);
}
.optimizer-relic-grid p {
  margin: 5px 0;
  color: var(--ink-soft);
}
.optimizer-relic-grid i {
  display: inline-block;
  margin: 4px 6px 0 0;
  color: #8a692c;
  font-size: 11px;
  font-style: normal;
}
.optimizer-footnote {
  gap: 14px;
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  color: var(--ink-soft);
  font-size: 12px;
}
.optimizer-loading {
  min-height: 500px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  text-align: center;
}
.optimizer-loading h3,
.optimizer-loading p {
  margin: 0;
}
.optimizer-loading h3 {
  color: var(--ink);
}
.optimizer-loading p {
  color: var(--ink-soft);
}
.optimizer-spinner {
  width: 42px;
  height: 42px;
  border: 3px solid var(--blue-soft);
  border-top-color: var(--blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes optimizer-dialog-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.992);
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 820px) {
  .optimizer-body {
    grid-template-columns: 1fr;
    overflow: auto;
  }
  .optimizer-ranking {
    max-height: 210px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .optimizer-relic-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
