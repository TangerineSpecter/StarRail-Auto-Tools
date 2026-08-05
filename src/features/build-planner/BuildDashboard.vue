<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import { buildPlanApi } from "@/shared/api/build-plan";
import { slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import { loadDisabledTraceNodes, traceNodeEnabled } from "@/shared/utils/trace-settings";
import {
  calculateStandingStats,
  isMaxStandingEquipment,
  lightConeSkillEffect,
} from "@/shared/utils/standing-stats";
import { primaryTraceNodes } from "@/shared/utils/trace-stats";
import {
  averageCharacterPotential,
  planQualityCompletion,
  resolvePlanWeights,
} from "@/shared/utils/relic-score";
import {
  buildTargetProgress,
  effectiveSubstatCounts,
  formatBuildProgressValue,
  lowestTargetPercent,
  relicPieceCounts,
} from "./progress";
import RelicPotentialRadar from "./RelicPotentialRadar.vue";
import { useDashboardDrag } from "./useDashboardDrag";
import lightConeCatalogueJson from "@/data/light-cones.json";
import relicCatalogueJson from "@/data/relic-sets.json";
import { resolveCharacterCatalogue } from "@/shared/catalogue";
import type {
  BuildDashboardEntry,
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
const actionCharacterId = ref<number | null>(null);
const notePopover = ref<{
  characterId: number;
  name: string;
  note: string;
  top: number;
  left: number;
  /** When true, `top` is the bottom edge of the card (just above the trigger). */
  placeAbove: boolean;
} | null>(null);
const dashboardElement = ref<HTMLElement | null>(null);
const lightCones = lightConeCatalogueJson as LightConeCatalogue;
const relicSets = relicCatalogueJson as RelicSetCatalogue;
const disabledTraceNodes = loadDisabledTraceNodes();

function characterInitial(name: string) {
  return name.slice(0, 1);
}

function planNote(plan: BuildDashboardEntry["plan"]) {
  return plan.note?.trim() ?? "";
}

function closeNotePopover() {
  notePopover.value = null;
}

async function toggleNotePopover(
  event: MouseEvent,
  card: { character: { characterId: number; name: string }; entry: BuildDashboardEntry },
) {
  const note = planNote(card.entry.plan);
  if (!note) return;
  if (notePopover.value?.characterId === card.character.characterId) {
    closeNotePopover();
    return;
  }
  const trigger = event.currentTarget as HTMLElement;
  const rect = trigger.getBoundingClientRect();
  const width = 260;
  const gap = 8;
  const preferredBelowHeight = 96;
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const spaceBelow = window.innerHeight - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  const placeAbove = spaceBelow < preferredBelowHeight && spaceAbove > spaceBelow;
  // When above: `top` is the bottom edge of the card, kept just above the trigger.
  // When below: `top` is the top edge of the card, kept just under the trigger.
  notePopover.value = {
    characterId: card.character.characterId,
    name: card.character.name,
    note,
    top: placeAbove ? rect.top - gap : rect.bottom + gap,
    left,
    placeAbove,
  };
  await nextTick();
  const popoverEl = document.querySelector<HTMLElement>(".build-note-popover");
  if (!popoverEl || !notePopover.value) return;
  const height = popoverEl.getBoundingClientRect().height;
  if (notePopover.value.placeAbove) {
    // Keep bottom edge near the trigger; only push down if the card would leave the viewport.
    const minBottom = 12 + height;
    if (notePopover.value.top < minBottom) {
      notePopover.value = { ...notePopover.value, top: minBottom };
    }
  } else {
    const maxTop = window.innerHeight - height - 12;
    if (notePopover.value.top > maxTop) {
      notePopover.value = { ...notePopover.value, top: Math.max(12, maxTop) };
    }
  }
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!notePopover.value) return;
  const target = event.target as Element | null;
  if (target?.closest(".build-note-info, .build-note-popover")) return;
  closeNotePopover();
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && !event.isComposing && notePopover.value) {
    event.preventDefault();
    closeNotePopover();
  }
}

function onDashboardScroll() {
  if (notePopover.value) closeNotePopover();
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
  const catalogue = resolveCharacterCatalogue({
    characterId: character.characterId,
    name: character.name,
  });
  const cone = character.equippedLightCone;
  const coneEntry = cone && lightCones.lightCones.find((item) => item.id === cone.templateId);
  const coneBase = coneEntry?.baseStats;
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
  const lightConeEffect = lightConeSkillEffect(coneEntry?.skill, cone.superimposition);
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
      lightConeEffects: lightConeEffect ? [lightConeEffect] : [],
    }),
  };
}

const canDrag = computed(() => !search.value.trim() && !loading.value && !error.value);

function compareCards(
  left: {
    entry: BuildDashboardEntry;
    completed: number;
    targets: Array<{ percent: number | null }>;
  },
  right: {
    entry: BuildDashboardEntry;
    completed: number;
    targets: Array<{ percent: number | null }>;
  },
) {
  if (left.entry.pinned !== right.entry.pinned)
    return Number(right.entry.pinned) - Number(left.entry.pinned);
  if (sort.value === "custom") {
    return left.entry.displayOrder - right.entry.displayOrder;
  }
  if (sort.value === "complete") {
    return right.completed - left.completed || left.entry.displayOrder - right.entry.displayOrder;
  }
  return (
    left.targets.length - left.completed - (right.targets.length - right.completed) ||
    lowestTargetPercent(left.targets) - lowestTargetPercent(right.targets) ||
    left.entry.displayOrder - right.entry.displayOrder
  );
}

const cards = computed(() =>
  entries.value
    .map((entry) => {
      const character = entry.character;
      const catalogue = resolveCharacterCatalogue({
        characterId: character.characterId,
        name: character.name,
      });
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
      // Lightweight scoring only — full Estimated TBP enumeration is too slow for list load.
      const weights = resolvePlanWeights({
        substatWeights: entry.plan.substatWeights,
        effectiveSubstats: entry.plan.effectiveSubstats,
      });
      const relicInputs = (character.equippedRelics ?? []).map((relic, index) => ({
        slot:
          relic.slot ??
          (["Head", "Hands", "Body", "Feet", "PlanarSphere", "LinkRope"][index] || "Head"),
        mainStat: relic.mainStat,
        substats: relic.substats,
      }));
      const quality = planQualityCompletion(relicInputs, weights, {
        allowedMainStats: entry.plan.mainStats,
        minPotentialPct: entry.plan.minPotentialPct ?? 40,
      });
      const potential = averageCharacterPotential(relicInputs, weights, {
        allowedMainStats: entry.plan.mainStats,
      });
      const cone = character.equippedLightCone;
      const coneEntry = cone ? lightCones.lightCones.find((item) => item.id === cone.templateId) : undefined;
      return {
        entry,
        character,
        image: catalogue?.image,
        equippedLightCone: cone
          ? {
              name: cone.name || coneEntry?.name || `光锥 #${cone.templateId}`,
              image: coneEntry?.image ?? null,
              level: cone.level,
              superimposition: cone.superimposition ?? 1,
            }
          : null,
        recommendedSets: recommendedSets(entry.plan).map((item) => ({
          ...item,
          matched: (equippedPieceCounts.get(item.set.id) ?? 0) >= item.pieces,
        })),
        state,
        targets,
        effective,
        effectiveTotal: effective.reduce((sum, item) => sum + item.count, 0),
        completed,
        quality,
        averagePotentialPct: potential.averagePotentialPct,
        weakSlot: potential.weakSlot,
        pieces: potential.pieces,
        minPotentialPct: entry.plan.minPotentialPct ?? 40,
      };
    })
    .filter((card) => card.state.available)
    .filter((card) => card.character.name.includes(search.value.trim()))
    .sort(compareCards),
);

function orderedEntryIds() {
  return [...entries.value]
    .sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        left.displayOrder - right.displayOrder ||
        left.character.characterId - right.character.characterId,
    )
    .map((entry) => entry.character.characterId);
}

function orderedEntryIdsForDrag(preferred: number[]) {
  const known = new Set(preferred);
  return [...preferred, ...orderedEntryIds().filter((id) => !known.has(id))];
}

async function reorderDraggedCard(sourceId: number, targetId: number, visibleOrderIds: number[]) {
  const source = entries.value.find((entry) => entry.character.characterId === sourceId);
  const target = entries.value.find((entry) => entry.character.characterId === targetId);
  if (!source || !target || source.pinned !== target.pinned) {
    return;
  }
  const ordered = orderedEntryIdsForDrag(visibleOrderIds);
  const from = ordered.indexOf(sourceId);
  const to = ordered.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  actionCharacterId.value = targetId;
  sort.value = "custom";
  try {
    await buildPlanApi.reorderDashboard(ordered);
    notice.value = "排序已保存";
    await loadDashboard();
  } catch (cause) {
    error.value = String(cause);
  } finally {
    actionCharacterId.value = null;
  }
}

const { draggedCharacterId, dragOverCharacterId, pointerDragStart } = useDashboardDrag({
  dashboardElement,
  canDrag: () => canDrag.value && actionCharacterId.value === null,
  items: () =>
    cards.value.map((card) => ({
      characterId: card.character.characterId,
      pinned: card.entry.pinned,
    })),
  onDrop: ({ sourceId, targetId, visibleOrderIds }) =>
    reorderDraggedCard(sourceId, targetId, visibleOrderIds),
});

async function togglePinned(card: (typeof cards.value)[number]) {
  actionCharacterId.value = card.character.characterId;
  try {
    await buildPlanApi.setDashboardPinned(card.character.characterId, !card.entry.pinned);
    notice.value = card.entry.pinned ? "已取消置顶" : "已置顶";
    await loadDashboard();
  } catch (cause) {
    error.value = String(cause);
  } finally {
    actionCharacterId.value = null;
  }
}

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

onMounted(() => {
  void loadDashboard();
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
  dashboardElement.value?.addEventListener("scroll", onDashboardScroll, { passive: true });
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
  dashboardElement.value?.removeEventListener("scroll", onDashboardScroll);
});
defineExpose({ reload: loadDashboard });
</script>

<template>
  <section ref="dashboardElement" class="build-dashboard">
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
            { label: '自定义排序', value: 'custom' },
          ]"
          option-label="label"
          option-value="value"
        />
        <small class="build-sort-hint">
          {{ search.trim() ? "清除搜索后可拖拽排序" : "拖动左侧手柄调整顺序" }}
        </small>
      </div>
    </header>
    <p v-if="loading" class="dashboard-state">正在汇总毕业进度…</p>
    <p v-else-if="error" class="dashboard-state error">{{ error }}</p>
    <p v-else-if="!cards.length" class="dashboard-state">暂无具备完整站街属性的毕业方案。</p>
    <div v-else class="build-card-list" aria-label="毕业进度列表">
      <article
        v-for="card in cards"
        :key="card.character.characterId"
        :class="[
          'build-progress-row',
          { dragging: draggedCharacterId === card.character.characterId },
          { 'drag-over': dragOverCharacterId === card.character.characterId },
        ]"
        :data-character-id="card.character.characterId"
        role="article"
      >
        <header class="build-card-header">
          <div class="build-card-identity">
            <button
              type="button"
              class="build-drag-handle"
              :disabled="!canDrag || actionCharacterId !== null"
              :aria-label="`拖动调整${card.character.name}顺序`"
              title="拖动调整顺序"
              @pointerdown="
                pointerDragStart(
                  { characterId: card.character.characterId, pinned: card.entry.pinned },
                  $event,
                )
              "
            >
              ⠿
            </button>
            <div class="build-character-avatar">
              <img v-if="card.image" :src="card.image" :alt="`${card.character.name} 头像`" />
              <span v-else>{{ characterInitial(card.character.name) }}</span>
            </div>
            <div class="build-character-info">
              <div class="build-character-title">
                <p>{{ card.character.name }}</p>
                <button
                  type="button"
                  :class="['build-pin-inline', { pinned: card.entry.pinned }]"
                  :disabled="actionCharacterId !== null"
                  :aria-label="card.entry.pinned ? `取消${card.character.name}置顶` : `置顶${card.character.name}`"
                  :aria-pressed="card.entry.pinned"
                  title="置顶"
                  @click="togglePinned(card)"
                >
                  <svg v-if="card.entry.pinned" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                  </svg>
                </button>
                <button
                  v-if="planNote(card.entry.plan)"
                  type="button"
                  class="build-note-info"
                  :aria-expanded="notePopover?.characterId === card.character.characterId"
                  :aria-label="`查看${card.character.name}的说明`"
                  title="查看说明"
                  @click.stop="toggleNotePopover($event, card)"
                >i</button>
              </div>
              <div class="build-character-actions">
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
          </div>
          <div class="build-card-metrics">
            <div class="metric-box">
              <strong>{{ (card.quality.combinedRatio * 100).toFixed(0) }}%</strong>
              <span>综合完成</span>
            </div>
            <div class="metric-box">
              <strong>{{ card.effectiveTotal }}</strong>
              <span>有效词条</span>
            </div>
            <div v-if="card.weakSlot" class="metric-box weak">
              <strong>{{ slotLabel(card.weakSlot) }}</strong>
              <span>短板位置</span>
            </div>
          </div>
        </header>

        <div class="build-card-body">
          <div class="build-card-column">
            <div class="build-card-section progress-section">
              <h4 class="section-title">属性目标进度</h4>
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

            <div class="build-card-section affix-section">
              <h4 class="section-title">有效词条分布</h4>
              <div class="affix-tags">
                <template v-if="card.effective.length">
                  <div v-for="item in card.effective" :key="item.key" class="affix-tag">
                    <span class="affix-name">{{ statLabel(item.key).replace("百分比", "%") }}</span>
                    <span class="affix-val">{{ item.count }}</span>
                  </div>
                </template>
                <span v-else class="muted">暂无命中词条</span>
              </div>
            </div>
          </div>

          <div class="build-card-column">
            <div class="build-card-section sets-section">
              <h4 class="section-title">当前光锥</h4>
              <div
                v-if="card.equippedLightCone"
                class="equipped-light-cone"
                :aria-label="`${card.equippedLightCone.name} Lv.${card.equippedLightCone.level} 叠影${card.equippedLightCone.superimposition}`"
              >
                <img
                  v-if="card.equippedLightCone.image"
                  :src="card.equippedLightCone.image"
                  :alt="card.equippedLightCone.name"
                />
                <span v-else class="equipped-light-cone-fallback">光</span>
                <p>
                  <b>{{ card.equippedLightCone.name }}</b>
                  <em
                    >Lv.{{ card.equippedLightCone.level }} · 叠影
                    {{ card.equippedLightCone.superimposition }}</em
                  >
                </p>
              </div>
              <p v-else class="equipped-light-cone empty muted">未装备光锥</p>

              <h4 class="section-title sets-status-title">遗器套装状态</h4>
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
                  :aria-label="item.matched ? `${item.set.name}已装备${item.pieces}件` : `${item.set.name}未装备${item.pieces}件`"
                >{{ item.matched ? "✓" : "×" }}</span>
              </div>
            </div>

            <div class="build-card-section quality-section">
              <h4 class="section-title">部位合格状况</h4>
              <div class="quality-visuals">
                <div class="quality-row">
                  <span class="quality-label">主属性</span>
                  <div
                    class="quality-segments"
                    :aria-label="`主属性正确 ${card.quality.mainStatCorrectCount} / ${card.quality.mainStatTotal}`"
                  >
                    <i
                      v-for="n in card.quality.mainStatTotal"
                      :key="'main' + n"
                      :class="{ active: n <= card.quality.mainStatCorrectCount }"
                    ></i>
                  </div>
                  <span class="quality-count"
                    >{{ card.quality.mainStatCorrectCount }}/{{ card.quality.mainStatTotal }}</span
                  >
                </div>
                <div class="quality-row">
                  <span class="quality-label">及格件数</span>
                  <div
                    class="quality-segments"
                    :aria-label="`质量达标 ${card.quality.qualityPassCount} / ${card.quality.qualityTotal}`"
                  >
                    <i
                      v-for="n in card.quality.qualityTotal"
                      :key="'qual' + n"
                      :class="{ active: n <= card.quality.qualityPassCount }"
                    ></i>
                  </div>
                  <span class="quality-count"
                    >{{ card.quality.qualityPassCount }}/{{ card.quality.qualityTotal }}</span
                  >
                </div>
              </div>
            </div>
          </div>

          <div class="build-card-radar-panel">
            <div class="build-card-section radar-section">
              <h4 class="section-title">六件词条潜力</h4>
              <RelicPotentialRadar
                :pieces="card.pieces"
                :weak-slot="card.weakSlot"
                :average-potential-pct="card.averagePotentialPct"
                :min-potential-pct="card.minPotentialPct"
              />
            </div>
          </div>
        </div>
      </article>
    </div>
    <Teleport to="body">
      <div
        v-if="notePopover"
        class="build-note-popover"
        :class="{ 'place-above': notePopover.placeAbove }"
        role="dialog"
        :aria-label="`${notePopover.name}的说明`"
        :style="{ top: `${notePopover.top}px`, left: `${notePopover.left}px` }"
      >
        <p class="build-note-popover-title">{{ notePopover.name }}</p>
        <p class="build-note-popover-body">{{ notePopover.note }}</p>
      </div>
    </Teleport>
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
  position: relative;
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 0 1 auto;
  flex-wrap: nowrap;
  justify-content: flex-end;
}
.build-dashboard-tools :deep(.p-inputtext) {
  width: 240px;
}
.build-dashboard-tools :deep(.p-select) {
  width: 150px;
}
.build-sort-hint {
  position: absolute;
  right: 0;
  bottom: 0;
  color: #6b84a4;
  font-size: 10px;
  white-space: nowrap;
  text-align: right;
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
.build-card-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1160px;
  margin: 0 auto;
}
.build-progress-row {
  position: relative;
  z-index: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 10px 24px rgba(36, 86, 166, 0.05);
  transition: box-shadow 160ms ease, transform 160ms ease;
  overflow: hidden;
}
.build-progress-row:hover {
  box-shadow: 0 14px 32px rgba(36, 86, 166, 0.1);
  transform: translateY(-2px);
}
.build-progress-row.dragging {
  z-index: 0;
  border: 1px dashed rgba(93, 143, 202, 0.45);
  border-radius: 12px;
  background: rgba(230, 240, 251, 0.48);
  box-shadow: none;
  opacity: 0.45;
  transform: none;
}
.build-progress-row.build-drag-preview {
  position: fixed !important;
  z-index: 1000;
  margin: 0;
  pointer-events: none;
  border: 1px solid rgba(93, 143, 202, 0.55);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow:
    0 16px 30px rgba(49, 86, 132, 0.2),
    0 3px 8px rgba(49, 86, 132, 0.12);
  opacity: 0.98;
  transform: none !important;
}
.build-progress-row.drag-over {
  box-shadow: inset 0 2px 0 #3d8ed0;
}
.build-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: linear-gradient(90deg, rgba(237, 244, 251, 0.6), transparent);
  border-bottom: 1px solid rgba(46, 79, 126, 0.06);
}
.build-card-identity {
  display: flex;
  align-items: center;
  gap: 16px;
}
.build-character-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.build-character-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.build-character-title p {
  color: var(--ink);
  font-size: 19px;
  font-weight: 700;
  margin: 0;
}
.build-character-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
}
.build-character-actions b {
  color: #55769b;
  font-weight: normal;
}
.build-card-metrics {
  display: flex;
  align-items: flex-end;
  gap: 32px;
}
.build-card-body {
  display: grid;
  grid-template-columns: minmax(300px, 1.35fr) minmax(220px, 1fr) minmax(240px, 1.15fr);
  gap: 24px 32px;
  padding: 20px 24px 24px 72px;
  background: rgba(255, 255, 255, 0.3);
}
.build-card-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}
.build-card-radar-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 16px 20px 20px;
  border: 1px solid rgba(93, 143, 202, 0.14);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(244, 248, 253, 0.85), rgba(255, 255, 255, 0.55));
}
.section-title {
  color: #7994b4;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  margin: 0 0 14px 0;
}
.progress-section,
.sets-section,
.radar-section,
.quality-section,
.affix-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.radar-section {
  align-items: stretch;
  gap: 8px;
}
.radar-section .section-title {
  margin-bottom: 0;
}
.quality-section .section-title,
.affix-section .section-title {
  margin-bottom: 10px;
}
.build-note-info {
  display: grid;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  place-items: center;
  margin: 0;
  padding: 0;
  border: 1px solid rgba(53, 110, 174, 0.35);
  border-radius: 50%;
  background: #eef5fd;
  color: #356eae;
  font: italic 700 11px/1 Georgia, "Times New Roman", serif;
  cursor: pointer;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}
.build-note-info:hover {
  background: #e3effc;
  border-color: rgba(53, 110, 174, 0.55);
}
.build-note-info:active {
  transform: scale(0.94);
}
.build-note-info:focus-visible {
  outline: 2px solid rgba(53, 110, 174, 0.42);
  outline-offset: 2px;
}
.build-note-info[aria-expanded="true"] {
  background: #dceafb;
  border-color: rgba(53, 110, 174, 0.62);
}
.build-drag-handle,
.build-pin-toggle {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.build-drag-handle {
  width: 13px;
  color: #8ea5c1;
  font-size: 16px;
  line-height: 1;
  letter-spacing: -5px;
  opacity: 0.35;
  user-select: none;
  touch-action: none;
}
.build-drag-handle:not(:disabled) {
  cursor: grab;
  opacity: 1;
}
.build-drag-handle:not(:disabled):active {
  cursor: grabbing;
}
.build-drag-handle:focus-visible,
.build-pin-inline:focus-visible {
  outline: 2px solid rgba(53, 110, 174, 0.42);
  outline-offset: 3px;
  border-radius: 2px;
}
.build-drag-handle:disabled,
.build-pin-inline:disabled {
  cursor: default;
}
.build-pin-inline {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #cdd6e0;
  cursor: pointer;
  transition:
    color 160ms ease,
    transform 160ms ease;
}
.build-pin-inline svg {
  width: 15px;
  height: 15px;
}
.build-pin-inline.pinned {
  color: #e5a93e;
}
.build-pin-inline:hover:not(:disabled) {
  color: #df9d28;
  transform: scale(1.1);
}
.build-pin-inline:active:not(:disabled) {
  transform: scale(0.9);
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

.equipped-light-cone {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
  margin-bottom: 4px;
  padding: 8px 10px;
  border: 1px solid rgba(93, 143, 202, 0.16);
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(241, 247, 253, 0.95), rgba(255, 255, 255, 0.72));
}
.equipped-light-cone.empty {
  margin: 0 0 4px;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 11px;
}
.equipped-light-cone img,
.equipped-light-cone-fallback {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  overflow: hidden;
  border: 1px solid #dae5f1;
  border-radius: 8px;
  background: #f2f6fb;
  color: #6f87a4;
  font-size: 11px;
  font-weight: 700;
}
.equipped-light-cone img {
  object-fit: contain;
  background: #e7edf5;
}
.equipped-light-cone p {
  display: grid;
  min-width: 0;
  margin: 0;
  gap: 2px;
}
.equipped-light-cone b {
  overflow: hidden;
  color: #263b5c;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.equipped-light-cone em {
  color: #6f87a4;
  font-size: 10px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
}
.sets-status-title {
  margin-top: 6px;
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

.target-progress-row {
  display: grid;
  grid-template-columns: minmax(130px, 0.9fr) minmax(80px, 1.35fr) 40px;
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

.metric-box {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.metric-box strong {
  color: var(--blue);
  font-size: 21px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.metric-box span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}
.metric-box.weak strong {
  color: #c77b32;
  font-size: 14px;
}
.quality-visuals {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 2px;
}
.quality-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.quality-label {
  width: 50px;
  color: #55769b;
  font-size: 11px;
  flex: 0 0 auto;
}
.quality-segments {
  display: flex;
  gap: 3px;
  flex: 1 1 auto;
}
.quality-segments i {
  display: block;
  width: 16px;
  height: 6px;
  border-radius: 2px;
  background: #e7eef6;
  transition: background 0.3s ease;
}
.quality-segments i.active {
  background: #64a1e0;
}
.quality-count {
  min-width: 28px;
  color: var(--ink);
  font-size: 11px;
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.affix-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.affix-tag {
  display: flex;
  align-items: center;
  height: 22px;
  border: 1px solid rgba(83, 137, 203, 0.2);
  border-radius: 4px;
  background: rgba(240, 246, 253, 0.6);
  overflow: hidden;
  font-size: 11px;
}
.affix-name {
  padding: 0 6px;
  color: #4a6c92;
}
.affix-val {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 100%;
  background: rgba(83, 137, 203, 0.12);
  color: #1c4b93;
  font-weight: 700;
}
.summary-details .muted {
  color: var(--muted);
}
.dashboard-state {
  padding: 48px;
  text-align: center;
  color: var(--muted);
}
.dashboard-state.error {
  color: #b04d43;
}
@media (max-width: 900px) {
  .build-card-body {
    grid-template-columns: 1fr;
    padding-left: 24px;
  }
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
  .build-card-body {
    padding-left: 20px;
  }
}
</style>
<style>
/* Teleported popover sits on body; keep a feature-prefixed global rule. */
.build-note-popover {
  position: fixed;
  z-index: 1200;
  width: min(260px, calc(100vw - 24px));
  max-height: min(240px, calc(100vh - 24px));
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid rgba(53, 110, 174, 0.22);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow:
    0 14px 28px rgba(36, 86, 166, 0.16),
    0 2px 8px rgba(36, 86, 166, 0.08);
  color: #334d6e;
}
/* Anchor `top` as the bottom edge so the card sits tightly above the trigger. */
.build-note-popover.place-above {
  transform: translateY(-100%);
}
.build-note-popover-title {
  margin: 0 0 6px;
  color: #356eae;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.build-note-popover-body {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
