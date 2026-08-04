<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import { buildPlanApi } from "@/shared/api/build-plan";
import { statLabel } from "@/shared/catalogue/relic-options";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import { loadDisabledTraceNodes, traceNodeEnabled } from "@/shared/utils/trace-settings";
import { calculateStandingStats, isMaxStandingEquipment } from "@/shared/utils/standing-stats";
import { primaryTraceNodes } from "@/shared/utils/trace-stats";
import {
  buildTargetProgress,
  effectiveSubstatCounts,
  formatBuildProgressValue,
  lowestTargetPercent,
  relicPieceCounts,
} from "./progress";
import characterCatalogueJson from "@/data/characters.json";
import lightConeCatalogueJson from "@/data/light-cones.json";
import relicCatalogueJson from "@/data/relic-sets.json";
import type {
  BuildDashboardEntry,
  CharacterCatalogue,
  LightConeCatalogue,
  RelicSetCatalogue,
} from "@/types";

const entries = ref<BuildDashboardEntry[]>([]);
const loading = ref(true);
const error = ref("");
const emit = defineEmits<{
  editBuild: [characterId: number];
}>();
const { notice } = useRuntimeContext();
const search = ref("");
const sort = ref("urgent");
const characters = characterCatalogueJson as CharacterCatalogue;
const lightCones = lightConeCatalogueJson as LightConeCatalogue;
const relicSets = relicCatalogueJson as RelicSetCatalogue;
const disabledTraceNodes = loadDisabledTraceNodes();

function characterInitial(name: string) {
  return name.slice(0, 1);
}

function recommendedSets(plan: BuildDashboardEntry["plan"]) {
  const findSet = (setId: number) => relicSets.sets.find((set) => set.id === setId);
  const cavernSets =
    plan.cavernMode === "fourPiece"
      ? [{ set: findSet(plan.cavernSetA), pieces: 4 }]
      : [
          { set: findSet(plan.cavernSetA), pieces: 2 },
          ...(plan.cavernSetB ? [{ set: findSet(plan.cavernSetB), pieces: 2 }] : []),
        ];
  return [...cavernSets, { set: findSet(plan.planarSetId), pieces: 2 }].filter(
    (item): item is { set: RelicSetCatalogue["sets"][number]; pieces: number } => !!item.set,
  );
}

function getProgressClass(percent: number | null) {
  if (percent === null) return "progress-unknown";
  if (percent >= 100) return "progress-complete";
  if (percent >= 80) return "progress-high";
  if (percent >= 50) return "progress-medium";
  return "progress-low";
}

function dashboardState(entry: BuildDashboardEntry) {
  const character = entry.character;
  const catalogue = characters.characters.find((item) => item.name === character.name);
  const cone = character.equippedLightCone;
  const coneBase =
    cone && lightCones.lightCones.find((item) => item.id === cone.templateId)?.baseStats;
  if (!catalogue?.baseStats)
    return { available: false, reason: "该角色的满级基础属性尚未同步。", stats: [] };
  if (!cone) return { available: false, reason: "未装备光锥，无法汇总完整站街属性。", stats: [] };
  if (!coneBase) return { available: false, reason: "该光锥的满级基础属性尚未同步。", stats: [] };
  if (!isMaxStandingEquipment(character, cone))
    return { available: false, reason: "角色与已装备光锥需均为 Lv.80、满突破后展示。", stats: [] };
  const pieceCounts = new Map<number, number>();
  for (const relic of character.equippedRelics ?? [])
    pieceCounts.set(relic.setId, (pieceCounts.get(relic.setId) ?? 0) + 1);
  const setEffects = relicSets.sets
    .filter((set) => (pieceCounts.get(set.id) ?? 0) >= 2)
    .map((set) => set.effects.twoPiece)
    .filter(Boolean);
  return {
    available: true,
    reason: "",
    stats: calculateStandingStats({
      characterBase: catalogue.baseStats,
      lightConeBase: coneBase,
      relics: character.equippedRelics ?? [],
      traces: primaryTraceNodes(catalogue.traceStats ?? [])
        .filter((trace) => traceNodeEnabled(disabledTraceNodes, character.characterId, trace.id))
        .flatMap((trace) => trace.stats),
      setEffects,
    }),
  };
}

const cards = computed(() =>
  entries.value
    .map((entry) => {
      const character = entry.character;
      const catalogue = characters.characters.find((item) => item.name === character.name);
      const state = dashboardState(entry);
      const targets = state.available
        ? buildTargetProgress(entry.plan.targets, state.stats)
        : entry.plan.targets.map((target) => ({
            ...target,
            current: null,
            percent: null,
            gap: null,
          }));
      const effective = effectiveSubstatCounts(
        character.equippedRelics ?? [],
        entry.plan.effectiveSubstats,
      );
      const equippedPieceCounts = relicPieceCounts(character.equippedRelics ?? []);
      const completed = targets.filter(
        (target) => target.percent !== null && target.percent >= 100,
      ).length;
      return {
        entry,
        character,
        image: catalogue?.image,
        recommendedSets: recommendedSets(entry.plan).map((item) => ({
          ...item,
          matched: (equippedPieceCounts.get(item.set.id) ?? 0) >= item.pieces,
        })),
        state,
        targets,
        effective,
        effectiveTotal: effective.reduce((sum, item) => sum + item.count, 0),
        completed,
      };
    })
    .filter((card) => card.state.available)
    .filter((card) => card.character.name.includes(search.value.trim()))
    .sort((left, right) => {
      if (sort.value === "complete") return right.completed - left.completed;
      return (
        left.targets.length - left.completed - (right.targets.length - right.completed) ||
        lowestTargetPercent(left.targets) - lowestTargetPercent(right.targets)
      );
    }),
);

async function loadDashboard() {
  loading.value = true;
  error.value = "";
  try {
    entries.value = await buildPlanApi.dashboard();
  } catch (cause) {
    error.value = String(cause);
  } finally {
    loading.value = false;
  }
}

async function exportExcel() {
  try {
    const path = await buildPlanApi.exportExcel();
    if (path) notice.value = "操作完成";
  } catch (cause) {
    error.value = String(cause);
  }
}

async function importExcel() {
  try {
    const result = await buildPlanApi.importExcel();
    if (result) {
      notice.value = "操作完成";
      await loadDashboard();
    }
  } catch (cause) {
    error.value = String(cause);
  }
}

onMounted(() => void loadDashboard());

defineExpose({ reload: loadDashboard });
</script>

<template>
  <section class="build-dashboard">
    <header class="build-dashboard-heading">
      <div>
        <p class="eyebrow">BUILD MANAGEMENT</p>
        <h2>毕业管理</h2>
        <p>追踪已配置角色的当前站街属性与毕业目标。</p>
      </div>
      <div class="build-dashboard-tools">
        <div class="build-plan-transfer-actions" aria-label="角色目标 Excel 操作">
          <button type="button" class="build-plan-transfer export" @click="exportExcel">
            <span class="build-plan-transfer-icon" aria-hidden="true">↓</span>
            <span>导出 Excel</span>
          </button>
          <button type="button" class="build-plan-transfer import" @click="importExcel">
            <span class="build-plan-transfer-icon" aria-hidden="true">↑</span>
            <span>导入 Excel</span>
          </button>
        </div>
        <InputText v-model="search" placeholder="搜索角色" /><Select
          v-model="sort"
          :options="[
            { label: '最需提升', value: 'urgent' },
            { label: '已达标优先', value: 'complete' },
          ]"
          option-label="label"
          option-value="value"
        />
      </div>
    </header>
    <p v-if="loading" class="dashboard-state">正在汇总毕业进度…</p>
    <p v-else-if="error" class="dashboard-state error">{{ error }}</p>
    <p v-else-if="!cards.length" class="dashboard-state">暂无具备完整站街属性的毕业方案。</p>
    <div v-else class="build-progress-table" role="table" aria-label="毕业进度列表">
      <div class="build-progress-table-head" role="row">
        <span role="columnheader">角色档案</span>
        <span role="columnheader">推荐套装</span>
        <span role="columnheader">当前毕业属性进度</span>
        <span role="columnheader">有效词条统计</span>
      </div>
      <article
        v-for="card in cards"
        :key="card.character.characterId"
        class="build-progress-row"
        role="row"
      >
        <div class="build-character" role="cell">
          <div class="build-character-avatar">
            <img v-if="card.image" :src="card.image" :alt="`${card.character.name} 头像`" />
            <span v-else>{{ characterInitial(card.character.name) }}</span>
          </div>
          <div>
            <p>{{ card.character.name }}</p>
            <b>{{ card.completed }} / {{ card.targets.length }} 项达标</b>
            <button
              type="button"
              class="build-target-edit"
              :aria-label="`编辑${card.character.name}的毕业目标`"
              @click="emit('editBuild', card.character.characterId)"
            >
              <span aria-hidden="true">✎</span> 编辑目标
            </button>
          </div>
        </div>
        <div class="recommended-set-list" role="cell">
          <div v-for="item in card.recommendedSets" :key="item.set.id" class="recommended-set">
            <img v-if="item.set.image" :src="item.set.image" :alt="item.set.name" />
            <span v-else class="recommended-set-fallback">遗</span>
            <p>
              {{ item.set.name }}
              <b>{{ item.pieces }}件</b>
            </p>
            <span
              :class="['recommended-set-status', { matched: item.matched }]"
              role="img"
              :aria-label="
                item.matched
                  ? `${item.set.name}已装备${item.pieces}件`
                  : `${item.set.name}未装备${item.pieces}件`
              "
              >{{ item.matched ? "✓" : "×" }}</span
            >
          </div>
        </div>
        <div class="target-progress-list" role="cell">
          <div
            v-for="target in card.targets"
            :key="target.statKey"
            :class="['target-progress-row', getProgressClass(target.percent)]"
          >
            <div class="target-progress-label">
              <b>{{ statLabel(target.statKey) }}</b>
              <span v-if="target.percent !== null"
                >{{ formatBuildProgressValue(target.statKey, target.current ?? 0) }} /
                {{ target.target }}</span
              >
              <span v-else>不可映射</span>
            </div>
            <i><em :style="{ width: `${Math.min(target.percent ?? 0, 100)}%` }" /></i>
            <small>
              {{ (target.percent ?? 0) >= 100 ? "达标" : `${target.percent?.toFixed(0) ?? "--"}%` }}
            </small>
          </div>
        </div>
        <div class="effective-summary" role="cell">
          <b>{{ card.effectiveTotal }}<small>次</small></b>
          <div v-if="card.effective.length" class="effective-detail">
            <span v-for="item in card.effective" :key="item.key"
              >{{ statLabel(item.key) }} {{ item.count }}</span
            >
          </div>
          <small v-else>暂无命中词条</small>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.build-dashboard {
  min-height: 0;
  padding: 24px 30px;
  overflow: auto;
}
.build-dashboard-heading {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 20px;
}
.build-dashboard-heading > :first-child {
  flex: 1 1 380px;
}
.build-dashboard-heading h2 {
  margin: 3px 0;
  font-size: 28px;
}
.build-dashboard-heading p {
  margin: 0;
  color: var(--muted);
}
.build-dashboard-tools {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 0 1 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.build-dashboard-tools :deep(.p-inputtext) {
  width: 240px;
}
.build-dashboard-tools :deep(.p-select) {
  width: 150px;
}
.build-plan-transfer-actions {
  display: flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid rgba(36, 86, 166, 0.18);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.68);
  box-shadow:
    0 6px 16px rgba(36, 86, 166, 0.08),
    inset 0 1px rgba(255, 255, 255, 0.88);
}
.build-plan-transfer {
  display: flex;
  gap: 7px;
  align-items: center;
  min-width: 112px;
  padding: 5px 9px 5px 5px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #294368;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-align: left;
  cursor: pointer;
  transition:
    background 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}
.build-plan-transfer + .build-plan-transfer {
  border-left: 1px solid rgba(36, 86, 166, 0.12);
}
.build-plan-transfer:hover {
  background: #fff;
  box-shadow: 0 2px 7px rgba(36, 86, 166, 0.1);
}
.build-plan-transfer:active {
  transform: translateY(1px);
}
.build-plan-transfer:focus-visible {
  outline: 2px solid rgba(36, 86, 166, 0.42);
  outline-offset: -2px;
}
.build-plan-transfer-icon {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  place-items: center;
  border-radius: 6px;
  color: currentColor;
  font-family: Georgia, serif;
  font-size: 18px;
  line-height: 1;
}
.build-plan-transfer.export .build-plan-transfer-icon {
  background: #e7f0fd;
  color: #285d9f;
}
.build-plan-transfer.import .build-plan-transfer-icon {
  background: #e1f4ee;
  color: #20725f;
}
.build-progress-table {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 32px rgba(36, 86, 166, 0.06);
}
.build-progress-table-head,
.build-progress-row {
  display: grid;
  grid-template-columns: minmax(185px, 0.8fr) minmax(230px, 1.05fr) minmax(390px, 1.85fr) minmax(
      175px,
      0.75fr
    );
}
.build-progress-table-head {
  min-height: 44px;
  align-items: center;
  padding: 0 24px;
  background: linear-gradient(90deg, #edf4fb, #f7faff);
  color: var(--blue);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.build-progress-row {
  align-items: stretch;
  min-height: 112px;
  padding: 16px 24px;
  border-top: 1px solid var(--line);
  transition: background 160ms ease;
}
.build-progress-row:hover {
  background: linear-gradient(90deg, rgba(239, 246, 253, 0.72), rgba(255, 255, 255, 0));
}
.build-character {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 20px;
}
.build-character p,
.build-character b {
  margin: 0;
}
.build-character-avatar {
  display: grid;
  width: 56px;
  height: 56px;
  flex: 0 0 56px;
  place-items: center;
  overflow: hidden;
  border: 2px solid #d8e5f4;
  border-radius: 4px;
  background: linear-gradient(145deg, #dceafb, #f9fcff);
  box-shadow: 0 3px 8px rgba(43, 87, 146, 0.14);
}
.build-character-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.build-character-avatar span {
  color: var(--blue);
  font-size: 20px;
  font-weight: 700;
}
.build-character p {
  color: var(--ink);
  font-size: 17px;
  font-weight: 700;
}
.build-character b {
  display: inline-block;
  margin-top: 5px;
  color: #55769b;
  font-size: 11px;
}
.build-target-edit {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 7px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #356eae;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  transition:
    color 160ms ease,
    transform 160ms ease;
}
.build-target-edit span {
  font-family: Georgia, serif;
  font-size: 15px;
  line-height: 0.8;
}
.build-target-edit:hover {
  color: #1e528f;
}
.build-target-edit:active {
  transform: translateY(1px);
}
.build-target-edit:focus-visible {
  outline: 2px solid rgba(53, 110, 174, 0.42);
  outline-offset: 3px;
  border-radius: 2px;
}
.recommended-set-list {
  display: grid;
  align-content: center;
  gap: 6px;
  padding: 0 22px 0 4px;
}
.recommended-set {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
}
.recommended-set img,
.recommended-set-fallback {
  display: grid;
  width: 25px;
  height: 25px;
  flex: 0 0 25px;
  place-items: center;
  overflow: hidden;
  border: 1px solid #dae5f1;
  border-radius: 6px;
  background: #f2f6fb;
  color: #6f87a4;
  font-size: 10px;
}
.recommended-set img {
  object-fit: cover;
}
.recommended-set p {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #536b89;
  font-size: 11px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recommended-set p b {
  margin-left: 4px;
  color: var(--blue);
  font-size: 10px;
  font-weight: 700;
}
.recommended-set-status {
  display: grid;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  place-items: center;
  border: 1px solid #cf5a5a;
  border-radius: 2px;
  background: #d95b5b;
  color: #fff;
  font-family: Georgia, serif;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}
.recommended-set-status.matched {
  border-color: #248263;
  background: #2e9675;
  color: #fff;
}
.target-progress-list {
  display: grid;
  align-content: center;
  gap: 7px;
  padding-right: 24px;
}
.target-progress-row {
  display: grid;
  grid-template-columns: minmax(152px, 0.9fr) minmax(90px, 1.35fr) 40px;
  align-items: center;
  gap: 10px;
  font-size: 11px;
}
.target-progress-label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.target-progress-label b {
  color: #263b5c;
}
.target-progress-row span {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.target-progress-row i {
  height: 6px;
  border-radius: 999px;
  background: #e7eef6;
  overflow: hidden;
  transition: background 0.3s ease;
}
.target-progress-row.progress-complete i {
  background: #e1f4ee;
}
.target-progress-row.progress-high i {
  background: #e7f0fd;
}
.target-progress-row.progress-medium i {
  background: #fcf1e5;
}
.target-progress-row.progress-low i {
  background: #faeaea;
}
.target-progress-row em {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #3c83ce, #66bba4);
  transition:
    width 0.3s ease,
    background 0.3s ease;
}
.target-progress-row.progress-complete em {
  background: linear-gradient(90deg, #3c83ce, #66bba4);
}
.target-progress-row.progress-high em {
  background: linear-gradient(90deg, #64a1e0, #4288d3);
}
.target-progress-row.progress-medium em {
  background: linear-gradient(90deg, #f0c27b, #e09938);
}
.target-progress-row.progress-low em {
  background: linear-gradient(90deg, #eb918a, #df6262);
}
.target-progress-row small {
  color: #9a7130;
  text-align: right;
  font-size: 10px;
  font-weight: 700;
  transition: color 0.3s ease;
}
.target-progress-row.progress-complete small {
  color: #2c866f;
}
.target-progress-row.progress-high small {
  color: #3b74b6;
}
.target-progress-row.progress-medium small {
  color: #c28221;
}
.target-progress-row.progress-low small {
  color: #c74a4a;
}
.effective-summary {
  display: grid;
  align-content: center;
  gap: 7px;
  padding-left: 24px;
  border-left: 1px solid var(--line);
}
.effective-summary > b {
  color: var(--blue);
  font-size: 28px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.effective-summary > b small {
  margin-left: 3px;
  font-size: 12px;
}
.effective-detail {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.effective-detail span {
  padding: 3px 6px;
  border-radius: 3px;
  background: #eef4fa;
  color: #506a8c;
  font-size: 10px;
}
.effective-summary > small {
  color: var(--muted);
  font-size: 11px;
}
.dashboard-state {
  padding: 48px;
  text-align: center;
  color: var(--muted);
}
.dashboard-state.error {
  color: #b04d43;
}
@media (max-width: 760px) {
  .build-dashboard-heading {
    display: grid;
  }
  .build-dashboard-tools {
    flex-wrap: wrap;
  }
  .build-progress-table {
    min-width: 760px;
  }
  .build-dashboard {
    overflow: auto;
  }
}
</style>
