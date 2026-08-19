<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Button from "primevue/button";
import { buildPlanApi } from "@/shared/api/build-plan";
import { inventoryApi } from "@/shared/api/inventory";
import { scanUpgradeRecommendations } from "@/shared/utils/relic-score";
import { characterDisplayName, relicImage, resolveCharacterCatalogue } from "@/shared/catalogue";
import { formatStatValue, slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import type { BuildDashboardEntry, RelicListItem, RelicMainStatGroupedResult } from "@/types";

const props = defineProps<{ imageFor: (relic: RelicListItem) => string | undefined }>();
const emit = defineEmits<{ "open-relic": [relic: RelicListItem] }>();
const planCount = ref<number | null>(null);
const loading = ref(false);
const usefulnessLoading = ref(false);
const error = ref("");
const result = ref<RelicMainStatGroupedResult | null>(null);
const plans = ref<BuildDashboardEntry[]>([]);
const usefulnessRows = ref<
  Array<{
    item: RelicListItem;
    bestCharacterId: number | null;
    bestLabel: string;
    characterDisplayLabel: string;
    characterAvatar: string | null;
    characterElement: string | null;
    grade: string | null;
    weightedRolls: number;
    equippedWeightedRolls: number | null;
    deltaWeightedRolls: number;
  }>
>([]);
/** True when inventory has more unequipped relics than the scan page size. */
const usefulnessTruncated = ref(false);
const usefulnessScanned = ref(0);
const usefulnessTotal = ref(0);
/** True after upgrade scan finishes (used to show empty-success when no upgrades). */
const usefulnessDone = ref(false);
const USEFULNESS_PAGE_SIZE = 200;
let usefulnessRequestId = 0;

const canAnalyze = computed(
  () => planCount.value !== null && planCount.value > 0 && !loading.value,
);

const gradeClass = (grade: string | null) => {
  if (!grade) return "grade-none";
  return `grade-${grade.toLowerCase().replace("+", "-plus")}`;
};

async function analyze() {
  if (!canAnalyze.value) return;
  error.value = "";
  usefulnessRows.value = [];
  usefulnessScanned.value = 0;
  usefulnessDone.value = false;
  loading.value = true;
  try {
    const grouped = await inventoryApi.scanRelicsByMainStatGrouped();
    planCount.value = grouped.planCount;
    result.value = grouped;
  } catch (cause) {
    error.value = String(cause);
  } finally {
    loading.value = false;
  }
}

async function analyzeUsefulness() {
  const requestId = ++usefulnessRequestId;
  usefulnessLoading.value = true;
  error.value = "";
  result.value = null;
  usefulnessTruncated.value = false;
  usefulnessScanned.value = 0;
  usefulnessTotal.value = 0;
  usefulnessDone.value = false;
  usefulnessRows.value = [];
  try {
    plans.value = await buildPlanApi.dashboard();
    if (requestId !== usefulnessRequestId) return;
    planCount.value = plans.value.length;
    if (!plans.value.length) {
      usefulnessRows.value = [];
      return;
    }
    const page = await inventoryApi.listRelics({
      page: 1,
      pageSize: USEFULNESS_PAGE_SIZE,
      equipped: false,
    });
    if (requestId !== usefulnessRequestId) return;
    usefulnessScanned.value = page.items.length;
    usefulnessTotal.value = page.total;
    usefulnessTruncated.value = page.total > page.items.length;
    const planInputs = plans.value.map((entry) => ({
      characterId: entry.character.characterId,
      planLabel: entry.character.name,
      substatWeights: entry.plan.substatWeights,
      effectiveSubstats: entry.plan.effectiveSubstats,
      mainStats: entry.plan.mainStats,
      cavernMode: entry.plan.cavernMode,
      cavernSetA: entry.plan.cavernSetA,
      cavernSetB: entry.plan.cavernSetB,
      planarSetId: entry.plan.planarSetId,
      equippedRelics: (entry.character.equippedRelics ?? [])
        .filter((relic) => relic.slot != null)
        .map((relic) => ({
          slot: relic.slot!,
          mainStat: relic.mainStat,
          setId: relic.setId,
          substats: (relic.substats ?? []).map((s) => ({
            ...s,
            key: s.key ?? (s as { stat?: string }).stat,
          })),
        })),
    }));
    const recommendations = scanUpgradeRecommendations(
      page.items.map((item) => ({
        slot: item.slot,
        mainStat: item.mainStat,
        substats: (item.substats ?? []).map((s) => ({
          ...s,
          key: s.key ?? (s as { stat?: string }).stat,
        })),
        rarity: item.rarity,
        level: item.level,
        setId: item.setId,
        itemId: item.itemId,
        name: item.name,
        setName: item.setName,
      })),
      planInputs,
    );
    const itemById = new Map(page.items.map((item) => [item.itemId, item]));
    usefulnessRows.value = recommendations
      .map((row) => {
        const item = itemById.get(row.relic.itemId ?? -1);
        if (!item) return null;
        const catalogueEntry = resolveCharacterCatalogue({
          characterId: row.characterId,
          name: row.planLabel ?? "",
        });
        const characterDisplayLabel = characterDisplayName({
          characterId: row.characterId,
          name: row.planLabel ?? "—",
        });
        return {
          item,
          bestCharacterId: row.characterId,
          bestLabel: row.planLabel ?? "—",
          characterDisplayLabel,
          characterAvatar: catalogueEntry?.image ?? null,
          characterElement: catalogueEntry?.element ?? null,
          grade: row.candidateScore.letterGrade,
          weightedRolls: row.candidateScore.weightedRolls,
          equippedWeightedRolls: row.equippedScore?.weightedRolls ?? null,
          deltaWeightedRolls: row.deltaWeightedRolls,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
    usefulnessDone.value = true;
  } catch (cause) {
    if (requestId !== usefulnessRequestId) return;
    error.value = String(cause);
  } finally {
    if (requestId === usefulnessRequestId) usefulnessLoading.value = false;
  }
}

// Added state & computeds for main stat scanning review dashboard
const searchQuery = ref("");
const slotFilter = ref("all");
const categoryFilter = ref("all");
const viewMode = ref<"grid" | "list">("grid");
const displayView = ref<"matrix" | "cards" | "slots">("matrix");
const collapsedSetIds = ref<Set<number>>(new Set());

const allSlots = [
  { key: "Body", label: "躯干", icon: "🎽" },
  { key: "Feet", label: "脚部", icon: "👟" },
  { key: "PlanarSphere", label: "位面球", icon: "🔮" },
  { key: "LinkRope", label: "连结绳", icon: "📿" },
  { key: "Head", label: "头部", icon: "🪖" },
  { key: "Hands", label: "手部", icon: "🥊" },
];

function toggleSetCollapse(setId: number) {
  const newSet = new Set(collapsedSetIds.value);
  if (newSet.has(setId)) {
    newSet.delete(setId);
  } else {
    newSet.add(setId);
  }
  collapsedSetIds.value = newSet;
}

function collapseAllSets() {
  if (!result.value) return;
  collapsedSetIds.value = new Set(result.value.groups.map((g) => g.setId));
}

function expandAllSets() {
  collapsedSetIds.value = new Set();
}

const isPlanarSet = (setGroup: { setId: number; parts: { slot: string }[] }) => {
  return (
    setGroup.setId >= 300 ||
    setGroup.parts.some((p) => p.slot === "PlanarSphere" || p.slot === "LinkRope")
  );
};

const getSetHeaderIcon = (setGroup: { setId: number; parts: { slot: string }[] }) => {
  if (isPlanarSet(setGroup)) {
    return relicImage(setGroup.setId, "PlanarSphere") || relicImage(setGroup.setId, "Head");
  }
  return relicImage(setGroup.setId, "Head") || relicImage(setGroup.setId, "Body");
};

const summaryStats = computed(() => {
  if (!result.value) return null;
  let cavernCount = 0;
  let planarCount = 0;
  let cavernSets = 0;
  let planarSets = 0;
  const slotCounts: Record<string, number> = {
    Body: 0,
    Feet: 0,
    PlanarSphere: 0,
    LinkRope: 0,
    Head: 0,
    Hands: 0,
  };

  result.value.groups.forEach((g) => {
    const isPlanar = isPlanarSet(g);
    let groupTotal = 0;
    g.parts.forEach((p) => {
      const pCount = p.stats.reduce((acc, s) => acc + s.count, 0);
      groupTotal += pCount;
      slotCounts[p.slot] = (slotCounts[p.slot] || 0) + pCount;
    });
    if (isPlanar) {
      planarCount += groupTotal;
      planarSets += 1;
    } else {
      cavernCount += groupTotal;
      cavernSets += 1;
    }
  });

  return {
    cavernCount,
    planarCount,
    cavernSets,
    planarSets,
    slotCounts,
  };
});

const filteredGroups = computed(() => {
  if (!result.value) return [];
  const q = searchQuery.value.trim().toLowerCase();
  return result.value.groups
    .map((group) => {
      const isPlanar = isPlanarSet(group);
      if (categoryFilter.value === "cavern" && isPlanar) return null;
      if (categoryFilter.value === "planar" && !isPlanar) return null;

      if (q && !group.setName.toLowerCase().includes(q)) return null;

      let filteredParts = group.parts;
      if (slotFilter.value !== "all") {
        filteredParts = filteredParts.filter((p) => p.slot === slotFilter.value);
      }

      if (!filteredParts.length) return null;

      const groupTotal = filteredParts.reduce(
        (sum, p) => sum + p.stats.reduce((acc, s) => acc + s.count, 0),
        0,
      );

      return {
        ...group,
        parts: filteredParts,
        groupTotal,
        isPlanar,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);
});

const groupedBySlot = computed(() => {
  if (!result.value) return [];
  const map = new Map<
    string,
    Array<{
      setName: string;
      setId: number;
      isPlanar: boolean;
      stats: Array<{ mainStat: string; count: number }>;
    }>
  >();

  filteredGroups.value.forEach((group) => {
    group.parts.forEach((part) => {
      if (!map.has(part.slot)) map.set(part.slot, []);
      map.get(part.slot)!.push({
        setName: group.setName,
        setId: group.setId,
        isPlanar: group.isPlanar,
        stats: part.stats,
      });
    });
  });

  return allSlots
    .filter((s) => slotFilter.value === "all" || slotFilter.value === s.key)
    .map((s) => {
      const items = map.get(s.key) ?? [];
      const total = items.reduce(
        (sum, item) => sum + item.stats.reduce((acc, st) => acc + st.count, 0),
        0,
      );
      return {
        slot: s.key,
        label: s.label,
        icon: s.icon,
        items,
        total,
      };
    })
    .filter((s) => s.items.length > 0);
});

function getStatThemeClass(mainStat: string) {
  if (["CRIT Rate", "CRIT DMG"].includes(mainStat)) return "stat-crit";
  if (["Outgoing Healing Boost"].includes(mainStat)) return "stat-heal";
  if (["Energy Regeneration Rate"].includes(mainStat)) return "stat-energy";
  if (["SPD"].includes(mainStat)) return "stat-speed";
  if (mainStat.endsWith("DMG Boost")) return "stat-element";
  if (["Break Effect", "Effect Hit Rate"].includes(mainStat)) return "stat-special";
  return "stat-basic";
}

onMounted(async () => {
  try {
    planCount.value = await inventoryApi.relicMainStatScanPlanCount();
    plans.value = await buildPlanApi.dashboard();
    planCount.value = Math.max(planCount.value ?? 0, plans.value.length);
  } catch (cause) {
    error.value = String(cause);
  }
});
</script>

<template>
  <section class="relic-scanner">
    <header class="scanner-hero">
      <div class="scanner-title">
        <p class="eyebrow">INVENTORY // REVIEW PROTOCOL</p>
        <div class="scanner-title-line">
          <span class="scanner-sigil" aria-hidden="true">◇</span>
          <h2>背包扫描</h2>
        </div>
        <p>比对已保存的培养方案，定位无去向闲置件，或优于当前穿戴的替换候选。</p>
      </div>
      <div class="scanner-command">
        <small>MAIN-STAT ANALYZER</small>
        <div class="scanner-command-buttons">
          <Button :disabled="!canAnalyze" :loading="loading" @click="analyze()"
            ><span class="command-marker" aria-hidden="true">✦</span> 主属性扫描</Button
          >
          <Button
            :disabled="!canAnalyze"
            :loading="usefulnessLoading"
            outlined
            @click="analyzeUsefulness()"
            >替换推荐扫描</Button
          >
        </div>
      </div>
    </header>

    <div v-if="usefulnessRows.length" class="scanner-usefulness">
      <div class="scanner-result-heading">
        <div>
          <small>UPGRADE / BETTER THAN EQUIPPED</small>
          <p>
            <b>{{ usefulnessRows.length }}</b> 件可替换推荐（主属性 + 套装匹配且词条分更高）
          </p>
          <p v-if="usefulnessTruncated" class="scanner-result-note">
            仅分析前 {{ usefulnessScanned }} /
            {{ usefulnessTotal }} 件未装备遗器（性能上限），结果可能不完整。
          </p>
        </div>
        <p class="scanner-result-note">按相对当前穿戴的加权分增量排序</p>
      </div>
      <div class="scanner-upgrade-grid" role="list" aria-label="替换推荐扫描">
        <article
          v-for="row in usefulnessRows"
          :key="row.item.itemId"
          class="upgrade-card"
          role="listitem"
          tabindex="0"
          @click="emit('open-relic', row.item)"
          @keydown.enter="emit('open-relic', row.item)"
        >
          <!-- Top Bar Header -->
          <div class="upgrade-card-header">
            <div class="upgrade-badge"><i class="sparkle">✦</i> 替换推荐</div>
            <div class="upgrade-card-tags">
              <span class="slot-pill">{{ slotLabel(row.item.slot) }}</span>
              <span :class="['grade-pill', gradeClass(row.grade)]">
                {{ row.grade ?? "—" }}
              </span>
            </div>
          </div>

          <!-- Main Info Section -->
          <div class="upgrade-card-main">
            <!-- Relic Icon Frame -->
            <div :class="['relic-thumb', `rarity-${row.item.rarity}`]">
              <img
                v-if="props.imageFor(row.item) || relicImage(row.item.setId, row.item.slot)"
                :src="props.imageFor(row.item) || relicImage(row.item.setId, row.item.slot)"
                :alt="row.item.name"
              />
              <span v-else class="relic-thumb-fallback">{{
                slotLabel(row.item.slot).slice(0, 1)
              }}</span>
              <span class="relic-level-tag">+{{ row.item.level }}</span>
            </div>

            <!-- Set & Main Stat -->
            <div class="relic-meta">
              <div class="relic-name-row">
                <b class="relic-set-name">{{ row.item.setName }}</b>
              </div>
              <div class="main-stat-badge">
                <small>主词条</small>
                <strong>{{ statLabel(row.item.mainStat) }}</strong>
                <em v-if="row.item.mainStatValue"
                  >+{{ formatStatValue(row.item.mainStat, row.item.mainStatValue) }}</em
                >
              </div>
            </div>
          </div>

          <!-- Target Character Banner -->
          <div class="target-character-bar">
            <div class="character-avatar-wrapper">
              <img
                v-if="row.characterAvatar"
                :src="row.characterAvatar"
                :alt="row.characterDisplayLabel"
                class="character-avatar-img"
              />
              <span
                v-else
                :class="['character-avatar-fallback', `element-${row.characterElement}`]"
              >
                {{ row.characterDisplayLabel.slice(0, 1) }}
              </span>
            </div>
            <div class="character-target-info">
              <span class="target-caption">适配角色</span>
              <span :class="['target-character-name', `element-${row.characterElement}`]">
                {{ row.characterDisplayLabel }}
              </span>
            </div>
          </div>

          <!-- Substats Chips Preview -->
          <div v-if="row.item.substats && row.item.substats.length" class="substat-chips-row">
            <span
              v-for="(sub, idx) in row.item.substats.slice(0, 4)"
              :key="idx"
              class="substat-chip"
              :title="`${statLabel(sub.key)} +${formatStatValue(sub.key, sub.value)}`"
            >
              <span class="substat-label">{{ statLabel(sub.key) }}</span>
              <em>+{{ formatStatValue(sub.key, sub.value) }}</em>
            </span>
          </div>

          <!-- Score Footer -->
          <div class="upgrade-card-footer">
            <div class="roll-score-info">
              <span class="roll-delta-tag">
                <i class="up-arrow">↑</i> +{{ row.deltaWeightedRolls.toFixed(2) }}
                <small>rolls</small>
              </span>
              <span class="roll-vs-detail">
                {{ row.weightedRolls.toFixed(2) }} <small>vs</small>
                {{
                  row.equippedWeightedRolls != null ? row.equippedWeightedRolls.toFixed(2) : "空槽"
                }}
              </span>
            </div>
            <span class="card-view-btn">查看详情 ›</span>
          </div>
        </article>
      </div>
    </div>
    <div v-else-if="usefulnessDone && usefulnessScanned > 0" class="scanner-state success">
      未发现优于当前穿戴的未装备遗器（主属性、套装均匹配且词条分更高）。
    </div>
    <div v-else-if="usefulnessDone && usefulnessScanned === 0" class="scanner-state success">
      当前没有可分析的未装备遗器。
    </div>

    <p v-else-if="error" class="scanner-state error">{{ error }}</p>
    <div v-else-if="planCount === null" class="scanner-state">正在读取培养方案…</div>
    <div v-else-if="planCount === 0" class="scanner-state">
      请先在数据管理的角色档案中保存至少一个“培养方案 / 毕业目标”。
    </div>
    <div v-else-if="!result" class="scanner-intro">
      <div class="scanner-radar" aria-hidden="true"><i /><b>◈</b></div>
      <div>
        <p>等待指令</p>
        <strong>准备检索 {{ planCount }} 个培养方案</strong
        ><small>本次分析只读取数据，不会删除或标记任何遗器。</small>
      </div>
    </div>
    <div v-else-if="!result.groups.length" class="scanner-state success">
      未发现无目标主词条的未装备遗器。
    </div>
    <template v-else>
      <!-- Next-Gen Station Terminal Control Header -->
      <div class="cleaning-header-compact">
        <div class="compact-left">
          <small>SCAN RESULT // UNASSIGNED RELIC MATRIX</small>
          <div class="compact-title-row">
            <span class="compact-total"
              ><b>{{ result.total }}</b> 件待复核</span
            >
            <span v-if="summaryStats" class="compact-sub-info">
              (隧洞 <b>{{ summaryStats.cavernCount }}</b> 件 / 位面
              <b>{{ summaryStats.planarCount }}</b> 件)
            </span>
          </div>

          <!-- Quick Category Filters -->
          <div class="category-tabs-group">
            <button
              :class="['cat-tab-btn', { active: categoryFilter === 'all' }]"
              @click="categoryFilter = 'all'"
            >
              全部 ({{ result.total }})
            </button>
            <button
              v-if="summaryStats"
              :class="['cat-tab-btn', 'cavern', { active: categoryFilter === 'cavern' }]"
              @click="categoryFilter = 'cavern'"
            >
              隧洞遗器 ({{ summaryStats.cavernCount }})
            </button>
            <button
              v-if="summaryStats"
              :class="['cat-tab-btn', 'planar', { active: categoryFilter === 'planar' }]"
              @click="categoryFilter = 'planar'"
            >
              位面饰品 ({{ summaryStats.planarCount }})
            </button>
          </div>
        </div>

        <div class="compact-right">
          <!-- Slot Segment Filter -->
          <div class="slot-filter-select-wrapper">
            <select v-model="slotFilter" class="slot-filter-select">
              <option value="all">所有部位</option>
              <option value="Body">躯干</option>
              <option value="Feet">脚部</option>
              <option value="PlanarSphere">位面球</option>
              <option value="LinkRope">连结绳</option>
              <option value="Head">头部</option>
              <option value="Hands">手部</option>
            </select>
          </div>

          <!-- Quick Search -->
          <div class="search-input-wrapper">
            <svg
              class="search-icon"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索套装..."
              class="search-input"
            />
            <button v-if="searchQuery" class="clear-search-btn" @click="searchQuery = ''">✕</button>
          </div>
        </div>
      </div>

      <!-- Filter Empty State -->
      <div v-if="!filteredGroups.length" class="scanner-state">没有匹配当前条件的待复核遗器。</div>

      <!-- MATRIX BOARD (二维矩阵热力看板) -->
      <div v-else class="matrix-board-container">
        <div class="matrix-table-wrapper">
          <table class="modern-matrix-table" role="grid" aria-label="待复核遗器二维矩阵">
            <thead>
              <tr>
                <th class="col-set-info">套装名称 / 类型</th>
                <th
                  v-for="s in allSlots.filter((s) => slotFilter === 'all' || slotFilter === s.key)"
                  :key="s.key"
                  class="col-slot-header"
                >
                  <span class="slot-header-icon">
                    <svg
                      v-if="s.key === 'Body'"
                      class="slot-svg-icon"
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M6 3h12l3 6-3 12H6L3 9z" />
                      <path d="M12 3v18" />
                      <path d="M8 9h8" />
                    </svg>
                    <svg
                      v-else-if="s.key === 'Feet'"
                      class="slot-svg-icon"
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M4 16v-6a3 3 0 0 1 3-3h3l3 4h7a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4z" />
                      <circle cx="8" cy="16" r="1" />
                    </svg>
                    <svg
                      v-else-if="s.key === 'PlanarSphere'"
                      class="slot-svg-icon"
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="7" />
                      <path d="M4.5 14.5c4.5 3 10.5 3 15 0" />
                      <path d="M4.5 9.5c4.5-3 10.5-3 15 0" />
                    </svg>
                    <svg
                      v-else-if="s.key === 'LinkRope'"
                      class="slot-svg-icon"
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M10 14l-2 2a3 3 0 1 1-4.24-4.24l2-2a3 3 0 0 1 4.24 0" />
                      <path d="M14 10l2-2a3 3 0 1 1 4.24 4.24l-2 2a3 3 0 0 1-4.24 0" />
                      <line x1="8" y1="16" x2="16" y2="8" />
                    </svg>
                    <svg
                      v-else-if="s.key === 'Head'"
                      class="slot-svg-icon"
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M12 4a8 8 0 0 0-8 8v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a8 8 0 0 0-8-8z"
                      />
                      <path d="M4 14h16" />
                    </svg>
                    <svg
                      v-else-if="s.key === 'Hands'"
                      class="slot-svg-icon"
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" />
                      <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
                      <path
                        d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8a7 7 0 0 0 7 7h1a7 7 0 0 0 7-7v-3.5"
                      />
                    </svg>
                  </span>
                  <span class="slot-header-name">{{ s.label }}</span>
                </th>
                <th class="col-total">待复核件数</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="setGroup in filteredGroups" :key="setGroup.setId" class="matrix-row">
                <!-- 套装列 -->
                <td class="cell-set-info">
                  <div class="matrix-set-cell">
                    <img
                      :src="getSetHeaderIcon(setGroup)"
                      :alt="setGroup.setName"
                      class="matrix-set-icon"
                    />
                    <div class="matrix-set-meta">
                      <span class="matrix-set-name">{{ setGroup.setName }}</span>
                      <span :class="['set-type-tag', setGroup.isPlanar ? 'planar' : 'cavern']">
                        {{ setGroup.isPlanar ? "2件套" : "4件套" }}
                      </span>
                    </div>
                  </div>
                </td>

                <!-- 部位交叉单元格 -->
                <td
                  v-for="s in allSlots.filter((s) => slotFilter === 'all' || slotFilter === s.key)"
                  :key="s.key"
                  class="cell-slot-data"
                >
                  <template v-if="setGroup.parts.find((p) => p.slot === s.key)">
                    <div class="matrix-chip-list">
                      <div
                        v-for="stat in setGroup.parts.find((p) => p.slot === s.key)!.stats"
                        :key="stat.mainStat"
                        :class="[
                          'modern-stat-chip',
                          'matrix-chip',
                          getStatThemeClass(stat.mainStat),
                        ]"
                      >
                        <span class="chip-stat-label">{{ statLabel(stat.mainStat) }}</span>
                        <span class="chip-count-pill">{{ stat.count }} 件</span>
                      </div>
                    </div>
                  </template>
                  <span v-else class="cell-empty">—</span>
                </td>

                <!-- 总计列 -->
                <td class="cell-total">
                  <div class="set-total-badge matrix-badge">
                    <b>{{ setGroup.groupTotal }}</b> <small>件</small>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.relic-scanner {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: 0;
  padding: 28px 44px 20px;
  overflow: hidden;
}
.scanner-hero,
.scanner-result-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.scanner-hero {
  position: relative;
  min-height: 106px;
  padding: 20px 24px;
  overflow: hidden;
  border: 1px solid rgba(46, 79, 126, 0.18);
  background: linear-gradient(110deg, rgba(255, 255, 255, 0.86), rgba(236, 242, 251, 0.72));
  box-shadow: 0 14px 34px rgba(37, 75, 122, 0.07);
}
.scanner-hero::after {
  position: absolute;
  top: -70px;
  right: 160px;
  width: 250px;
  height: 250px;
  border: 1px solid rgba(59, 99, 156, 0.14);
  border-radius: 50%;
  content: "";
}
.scanner-title {
  display: grid;
  z-index: 1;
  gap: 6px;
}
.scanner-command {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  z-index: 1;
  gap: 8px;
}
.scanner-command-buttons {
  display: flex;
  gap: 16px;
}
.scanner-title-line {
  display: flex;
  align-items: center;
  gap: 11px;
}
.scanner-title h2 {
  font-size: 30px;
  letter-spacing: 0.08em;
}
.scanner-sigil {
  color: var(--gold);
  font-size: 25px;
}
.scanner-title > p:last-child {
  color: var(--ink-soft);
  font-size: 13px;
}
.scanner-command > small,
.scanner-result-heading small,
.scanner-stat-compare small {
  color: var(--muted);
  font:
    700 9px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.13em;
}
.scanner-command :deep(.p-button) {
  min-width: 144px;
  padding: 11px 18px;
  border-radius: 0;
  font-weight: 700;
}
.scanner-command :deep(.p-button:not(.p-button-outlined)) {
  border: 1px solid #1c4b93;
  background: linear-gradient(135deg, #1a478d, #326cc1);
  box-shadow: 7px 7px 0 rgba(199, 165, 90, 0.28);
  color: #fff;
}
.scanner-command :deep(.p-button-outlined) {
  border: 1px solid #1c4b93;
  background: #ffffff;
  color: #1c4b93;
  box-shadow: 7px 7px 0 rgba(46, 79, 126, 0.12);
}
.scanner-command :deep(.p-button-outlined:hover) {
  background: #f4f7fa;
}
.command-marker {
  margin-right: 5px;
  color: #f3d78e;
}
.scanner-state,
.scanner-intro {
  display: grid;
  min-height: 0;
  height: 100%;
  place-items: center;
  padding: 28px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.55);
  color: var(--ink-soft);
  text-align: center;
}
.scanner-state.error {
  color: #b64d4d;
}
.scanner-state.success {
  color: var(--blue-deep);
}
.scanner-intro {
  grid-template-columns: 135px auto;
  justify-content: center;
  gap: 24px;
}
.scanner-intro > div:last-child {
  display: grid;
  justify-items: start;
  gap: 8px;
  text-align: left;
}
.scanner-intro p {
  color: var(--gold);
  font:
    700 10px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.16em;
}
.scanner-intro strong {
  color: var(--ink);
  font-size: 17px;
}
.scanner-intro small {
  color: var(--muted);
}
.scanner-radar {
  position: relative;
  width: 110px;
  height: 110px;
  border: 1px solid rgba(47, 92, 159, 0.28);
  border-radius: 50%;
  background: repeating-radial-gradient(
    circle,
    transparent 0 18px,
    rgba(47, 92, 159, 0.1) 19px 20px
  );
}
.scanner-radar i {
  position: absolute;
  top: 54px;
  left: 54px;
  width: 54px;
  height: 1px;
  background: linear-gradient(90deg, var(--gold), transparent);
  transform-origin: left;
  animation: scanner-sweep 4s linear infinite;
}
.scanner-radar b {
  position: absolute;
  top: 43px;
  left: 43px;
  color: var(--blue);
  font-size: 23px;
}
@keyframes scanner-sweep {
  to {
    transform: rotate(360deg);
  }
}
.scanner-usefulness {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.scanner-result-heading {
  padding: 3px 3px 10px;
}
.scanner-result-heading > div {
  display: grid;
  gap: 5px;
}
.scanner-result-heading p {
  color: var(--ink);
  font-size: 16px;
}
.scanner-result-heading b {
  color: var(--blue);
  font-size: 27px;
}
.scanner-result-note {
  color: var(--muted) !important;
  font-size: 11px !important;
}
.scanner-result-note span {
  color: var(--gold);
  font-size: 15px;
}
.scanner-upgrade-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  grid-auto-rows: 252px;
  align-content: start;
  align-items: stretch;
  gap: 14px;
  overflow: auto;
  padding: 4px 4px 16px;
}

.upgrade-card {
  display: grid;
  grid-template-rows: 22px 52px 44px 48px minmax(0, 1fr);
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid rgba(45, 75, 116, 0.18);
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(240, 245, 253, 0.88));
  box-shadow: 0 4px 16px rgba(42, 69, 105, 0.06);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: left;
  user-select: none;
  position: relative;
  overflow: hidden;
  height: 252px;
}

.upgrade-card:hover {
  border-color: rgba(37, 95, 185, 0.55);
  background: #ffffff;
  box-shadow:
    0 10px 28px rgba(35, 70, 130, 0.14),
    0 0 0 1px rgba(50, 120, 220, 0.2);
  transform: translateY(-3px);
}

.upgrade-card:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}

.upgrade-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.upgrade-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(39, 148, 71, 0.12);
  color: #1e7e38;
  font-size: 11px;
  font-weight: 700;
}

.upgrade-badge .sparkle {
  color: #16a34a;
  font-style: normal;
  font-size: 11px;
}

.upgrade-card-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}

.slot-pill {
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  background: rgba(220, 230, 242, 0.5);
  padding: 2px 7px;
  border-radius: 3px;
}

.grade-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 4px;
  font:
    800 11px/1.2 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.05em;
}

.grade-pill.grade-sss,
.grade-pill.grade-sss-plus {
  background: linear-gradient(135deg, #eab308, #ca8a04);
  color: #fff;
  box-shadow: 0 2px 6px rgba(234, 179, 8, 0.35);
}

.grade-pill.grade-ss,
.grade-pill.grade-ss-plus {
  background: linear-gradient(135deg, #a855f7, #7e22ce);
  color: #fff;
  box-shadow: 0 2px 6px rgba(168, 85, 247, 0.3);
}

.grade-pill.grade-s-plus,
.grade-pill.grade-s {
  background: linear-gradient(135deg, #0284c7, #0369a1);
  color: #fff;
}

.grade-pill.grade-aeon {
  background: linear-gradient(135deg, #ec4899, #8b5cf6, #3b82f6);
  color: #fff;
  box-shadow: 0 2px 8px rgba(236, 72, 153, 0.4);
}

.grade-pill.grade-wtf,
.grade-pill.grade-wtf-plus {
  background: linear-gradient(135deg, #f97316, #dc2626);
  color: #fff;
  box-shadow: 0 2px 6px rgba(234, 88, 12, 0.28);
}

.grade-pill.grade-a-plus {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
}

.grade-pill.grade-a {
  background: rgba(37, 99, 235, 0.13);
  border: 1px solid rgba(37, 99, 235, 0.26);
  color: #1d4ed8;
}

.grade-pill.grade-b-plus,
.grade-pill.grade-b {
  background: rgba(13, 148, 136, 0.12);
  border: 1px solid rgba(13, 148, 136, 0.24);
  color: #0f766e;
}

.grade-pill.grade-c-plus,
.grade-pill.grade-c {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  color: #2563eb;
}

.grade-pill.grade-d-plus,
.grade-pill.grade-d,
.grade-pill.grade-e-plus,
.grade-pill.grade-e {
  background: rgba(217, 119, 6, 0.11);
  border: 1px solid rgba(217, 119, 6, 0.22);
  color: #a16207;
}

.grade-pill.grade-f-plus,
.grade-pill.grade-f {
  background: rgba(220, 38, 38, 0.1);
  border: 1px solid rgba(220, 38, 38, 0.22);
  color: #b91c1c;
}

.grade-pill.grade-none {
  background: rgba(148, 163, 184, 0.18);
  border: 1px solid rgba(100, 116, 139, 0.16);
  color: #475569;
}

.upgrade-card-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.relic-thumb {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid rgba(199, 165, 90, 0.58);
  background: #ffffff;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.04);
}

.relic-thumb.rarity-5 {
  border-color: #dcb05a;
  background: linear-gradient(135deg, #fffcf5, #f5e9d3);
}

.relic-thumb.rarity-4 {
  border-color: #a855f7;
  background: linear-gradient(135deg, #fbf5ff, #ebd5ff);
}

.relic-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.relic-thumb-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--gold);
  font-weight: 700;
}

.relic-level-tag {
  position: absolute;
  bottom: 0;
  right: 0;
  background: rgba(28, 75, 147, 0.88);
  color: #fff;
  font:
    700 9px/1 "Bahnschrift",
    sans-serif;
  padding: 2px 4px;
  border-top-left-radius: 3px;
}

.relic-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.relic-set-name {
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main-stat-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(28, 75, 147, 0.06);
  border: 1px solid rgba(28, 75, 147, 0.12);
  width: fit-content;
  max-width: 100%;
}

.main-stat-badge small {
  color: var(--muted);
  font-size: 10px;
}

.main-stat-badge strong {
  color: #1a478d;
  font-size: 11px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.main-stat-badge em {
  color: var(--blue);
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
}

.target-character-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 10px;
  border-radius: 6px;
  background: rgba(236, 242, 251, 0.65);
  border: 1px solid rgba(46, 79, 126, 0.08);
}

.character-avatar-wrapper {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid rgba(199, 165, 90, 0.45);
  background: #fff;
  display: grid;
  place-items: center;
}

.character-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.character-avatar-fallback {
  font-size: 12px;
  font-weight: 700;
}

.character-target-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.target-caption {
  color: var(--muted);
  font-size: 9px;
}

.target-character-name {
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.target-character-name.element-火,
.character-avatar-fallback.element-火 {
  color: #d13d21;
}
.target-character-name.element-冰,
.character-avatar-fallback.element-冰 {
  color: #1a7ec2;
}
.target-character-name.element-雷,
.character-avatar-fallback.element-雷 {
  color: #8843cf;
}
.target-character-name.element-风,
.character-avatar-fallback.element-风 {
  color: #279447;
}
.target-character-name.element-物理,
.character-avatar-fallback.element-物理 {
  color: #5c6470;
}
.target-character-name.element-量子,
.character-avatar-fallback.element-量子 {
  color: #58338e;
}
.target-character-name.element-虚数,
.character-avatar-fallback.element-虚数 {
  color: #c48310;
}

.substat-chips-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, 22px);
  gap: 4px 6px;
}

.substat-chip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(74px, 0.7fr);
  align-items: center;
  min-width: 0;
  column-gap: 6px;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(46, 79, 126, 0.12);
  font-size: 10px;
  color: var(--ink-soft);
}

.substat-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.substat-chip em {
  justify-self: stretch;
  font-style: normal;
  color: #2563eb;
  font-weight: 700;
}

.upgrade-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding-top: 4px;
  border-top: 1px dashed rgba(46, 79, 126, 0.12);
}

.roll-score-info {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.roll-delta-tag {
  color: #16a34a;
  font-size: 13px;
  font-weight: 800;
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.roll-delta-tag .up-arrow {
  font-style: normal;
  font-size: 12px;
}

.roll-delta-tag small {
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
}

.roll-vs-detail {
  color: var(--muted);
  font-size: 10px;
}

.roll-vs-detail small {
  color: var(--muted);
}

.card-view-btn {
  color: var(--blue);
  font-size: 11px;
  font-weight: 600;
}

@media (max-width: 760px) {
  .scanner-upgrade-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* Compact Cleaning Header & Station Control Terminal */
.cleaning-header-compact {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 6px 12px;
  border-bottom: 1px solid rgba(46, 79, 126, 0.12);
  margin-bottom: 4px;
}

.compact-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.compact-left small {
  color: var(--muted);
  font:
    700 9px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.13em;
}

.compact-title-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.compact-total {
  font-size: 15px;
  color: var(--ink);
}

.compact-total b {
  color: #1a478d;
  font-size: 24px;
  font-weight: 800;
}

.compact-sub-info {
  color: var(--muted);
  font-size: 12px;
}

.compact-sub-info b {
  color: #2b6cb0;
  font-weight: 700;
}

/* Category Quick Tabs */
.category-tabs-group {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}

.cat-tab-btn {
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid rgba(46, 79, 126, 0.16);
  background: rgba(255, 255, 255, 0.7);
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cat-tab-btn:hover {
  background: #ffffff;
  border-color: rgba(43, 108, 176, 0.35);
  color: var(--ink);
}

.cat-tab-btn.active {
  background: #1a478d;
  border-color: #1a478d;
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(26, 71, 141, 0.25);
}

.cat-tab-btn.cavern.active {
  background: linear-gradient(135deg, #1e40af, #2563eb);
}

.cat-tab-btn.planar.active {
  background: linear-gradient(135deg, #6b21a8, #9333ea);
}

.compact-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.slot-filter-select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.slot-filter-select {
  height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(46, 79, 126, 0.18);
  border-radius: 6px;
  background: #ffffff;
  font-size: 12px;
  color: var(--ink-soft);
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.slot-filter-select:hover,
.slot-filter-select:focus {
  border-color: #2b6cb0;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 150px;
  height: 30px;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: var(--muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 0 24px 0 28px;
  border: 1px solid rgba(46, 79, 126, 0.18);
  border-radius: 6px;
  background: #ffffff;
  font-size: 12px;
  color: var(--ink);
  outline: none;
  transition: all 0.2s ease;
}

.search-input:focus {
  border-color: #2b6cb0;
  box-shadow: 0 0 0 2px rgba(43, 108, 176, 0.15);
}

.clear-search-btn {
  position: absolute;
  right: 8px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}

/* View Mode Toggle */
.view-mode-toggle {
  display: flex;
  align-items: center;
  background: rgba(226, 237, 252, 0.5);
  border: 1px solid rgba(46, 79, 126, 0.16);
  border-radius: 6px;
  padding: 2px;
}

.view-toggle-btn {
  padding: 3px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.view-toggle-btn.active {
  background: #ffffff;
  color: #1a478d;
  box-shadow: 0 1px 4px rgba(37, 75, 122, 0.12);
}

.collapse-toggle-btn {
  height: 30px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 1px solid rgba(46, 79, 126, 0.18);
  border-radius: 6px;
  background: #ffffff;
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.collapse-toggle-btn:hover {
  background: #f4f7fa;
  color: var(--ink);
}

/* Modern Set Groups Container (Grid & List View) */
.scanner-grouped-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 4px 16px;
}

.scanner-grouped-container.view-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  grid-auto-rows: max-content;
  align-content: start;
  gap: 12px;
}

.scanner-grouped-container.view-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Modern Set Card */
.modern-set-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(46, 79, 126, 0.16);
  border-radius: 8px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(243, 247, 254, 0.9));
  box-shadow: 0 4px 16px rgba(37, 75, 122, 0.04);
  overflow: hidden;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.modern-set-card:hover {
  border-color: rgba(43, 108, 176, 0.45);
  box-shadow:
    0 8px 24px rgba(37, 75, 122, 0.11),
    0 0 0 1px rgba(66, 153, 225, 0.15);
  transform: translateY(-2px);
}

.modern-set-card.collapsed {
  background: #ffffff;
}

.card-accent-strip {
  height: 3px;
  width: 100%;
}

.card-accent-strip.cavern {
  background: linear-gradient(90deg, #2563eb, #3b82f6, transparent);
}

.card-accent-strip.planar {
  background: linear-gradient(90deg, #9333ea, #c084fc, transparent);
}

/* Set Header */
.set-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(236, 243, 253, 0.65), rgba(248, 251, 255, 0.35));
  border-bottom: 1px solid rgba(46, 79, 126, 0.08);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
}

.set-card-header:hover {
  background: rgba(226, 237, 252, 0.85);
}

.set-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.set-icon-frame {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 6px;
  background: #ffffff;
  border: 1px solid rgba(199, 165, 90, 0.45);
  display: grid;
  place-items: center;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.set-icon-img {
  width: 90%;
  height: 90%;
  object-fit: contain;
  transition: transform 0.2s ease;
}

.modern-set-card:hover .set-icon-img {
  transform: scale(1.08);
}

.set-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.set-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.set-name-text {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.set-type-tag {
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
  width: fit-content;
}

.set-type-tag.cavern {
  color: #2563eb;
}

.set-type-tag.planar {
  color: #9333ea;
}

.set-slots-overview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.overview-slot-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(46, 79, 126, 0.12);
  font-size: 10px;
  color: var(--ink-soft);
  line-height: 1.2;
}

.slot-mini-icon {
  font-size: 10px;
}

.slot-mini-name {
  color: #3b5998;
  font-weight: 600;
}

.slot-mini-count {
  font-weight: 700;
  color: #1a478d;
  background: rgba(28, 75, 147, 0.08);
  padding: 0 4px;
  border-radius: 3px;
}

.set-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.set-total-badge {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(28, 75, 147, 0.08);
  border: 1px solid rgba(28, 75, 147, 0.14);
  font-size: 11px;
  color: var(--ink-soft);
}

.set-total-badge small {
  color: var(--muted);
  font-size: 9px;
}

.set-total-badge b {
  color: #1a478d;
  font-size: 13px;
  font-weight: 800;
}

.collapse-chevron {
  font-size: 11px;
  color: var(--muted);
  transform: rotate(-90deg);
  transition: transform 0.2s ease;
}

.modern-set-card.collapsed .collapse-chevron {
  transform: rotate(0deg);
}

/* Set Body & Part Rows */
.set-card-body {
  display: flex;
  flex-direction: column;
  padding: 8px 10px 10px;
  gap: 8px;
}

.modern-part-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(46, 79, 126, 0.08);
  transition: background 0.15s ease;
}

.modern-part-row:hover {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(46, 79, 126, 0.14);
}

.part-row-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.part-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(215, 228, 244, 0.6);
  border: 1px solid rgba(46, 79, 126, 0.1);
}

.part-slot-icon {
  font-size: 11px;
}

.part-name {
  font-size: 11px;
  font-weight: 700;
  color: #2b5288;
}

.part-subtotal-tag {
  font-size: 10px;
  color: var(--muted);
  font-weight: 500;
}

/* Modern Stat Chips */
.modern-stat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.modern-stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border-radius: 4px;
  background: #ffffff;
  border: 1px solid rgba(46, 79, 126, 0.14);
  font-size: 11px;
  box-shadow: 0 1px 3px rgba(37, 75, 122, 0.03);
  transition: all 0.15s ease;
}

.modern-stat-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(37, 75, 122, 0.08);
}

.chip-stat-label {
  font-weight: 600;
}

.chip-count-pill {
  padding: 1px 5px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
}

/* Categorized Stat Color Themes */
/* 暴击/爆伤 */
.modern-stat-chip.stat-crit {
  background: linear-gradient(135deg, #fffcf0, #fff7d6);
  border-color: rgba(217, 119, 6, 0.4);
}
.modern-stat-chip.stat-crit .chip-stat-label {
  color: #b45309;
}
.modern-stat-chip.stat-crit .chip-count-pill {
  background: #d97706;
  color: #ffffff;
}

/* 治疗加成 */
.modern-stat-chip.stat-heal {
  background: linear-gradient(135deg, #f0fdf4, #dcfce7);
  border-color: rgba(22, 163, 74, 0.35);
}
.modern-stat-chip.stat-heal .chip-stat-label {
  color: #15803d;
}
.modern-stat-chip.stat-heal .chip-count-pill {
  background: #16a34a;
  color: #ffffff;
}

/* 能量恢复 */
.modern-stat-chip.stat-energy {
  background: linear-gradient(135deg, #faf5ff, #f3e8ff);
  border-color: rgba(147, 51, 234, 0.35);
}
.modern-stat-chip.stat-energy .chip-stat-label {
  color: #7e22ce;
}
.modern-stat-chip.stat-energy .chip-count-pill {
  background: #9333ea;
  color: #ffffff;
}

/* 速度 */
.modern-stat-chip.stat-speed {
  background: linear-gradient(135deg, #fffbe3, #fef08a);
  border-color: rgba(202, 138, 4, 0.4);
}
.modern-stat-chip.stat-speed .chip-stat-label {
  color: #a16207;
}
.modern-stat-chip.stat-speed .chip-count-pill {
  background: #ca8a04;
  color: #ffffff;
}

/* 属性伤害 */
.modern-stat-chip.stat-element {
  background: linear-gradient(135deg, #eff6ff, #dbeafe);
  border-color: rgba(37, 99, 235, 0.3);
}
.modern-stat-chip.stat-element .chip-stat-label {
  color: #1d4ed8;
}
.modern-stat-chip.stat-element .chip-count-pill {
  background: #2563eb;
  color: #ffffff;
}

/* 特殊词条 */
.modern-stat-chip.stat-special {
  background: linear-gradient(135deg, #fff7ed, #ffedd5);
  border-color: rgba(234, 88, 12, 0.35);
}
.modern-stat-chip.stat-special .chip-stat-label {
  color: #c2410c;
}
.modern-stat-chip.stat-special .chip-count-pill {
  background: #ea580c;
  color: #ffffff;
}

/* 基础词条 */
.modern-stat-chip.stat-basic {
  background: #ffffff;
  border-color: rgba(46, 79, 126, 0.16);
}
.modern-stat-chip.stat-basic .chip-stat-label {
  color: #334155;
}
.modern-stat-chip.stat-basic .chip-count-pill {
  background: rgba(28, 75, 147, 0.08);
  color: #1a478d;
}
/* Display Engine Mode Switcher */
.display-engine-toggle {
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(226, 237, 252, 0.6);
  border: 1px solid rgba(46, 79, 126, 0.18);
  border-radius: 6px;
  padding: 2px;
}

.engine-btn {
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.engine-btn:hover {
  color: var(--ink);
}

.engine-btn.active {
  background: linear-gradient(135deg, #1c4b93, #2b6cb0);
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(28, 75, 147, 0.25);
}

/* 1. DISPLAY VIEW: MATRIX BOARD (二维矩阵热力看板) */
.matrix-board-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 2px 16px;
}

.matrix-table-wrapper {
  border: 1px solid rgba(46, 79, 126, 0.16);
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(37, 75, 122, 0.05);
  overflow: hidden;
}

.modern-matrix-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 12px;
}

.modern-matrix-table th {
  padding: 10px 12px;
  background: linear-gradient(135deg, rgba(236, 243, 253, 0.95), rgba(244, 248, 255, 0.8));
  border-bottom: 2px solid rgba(46, 79, 126, 0.14);
  color: #1a478d;
  font-weight: 700;
  user-select: none;
  white-space: nowrap;
}

.col-set-info {
  width: 220px;
  min-width: 180px;
}

.col-slot-header {
  text-align: center;
}

.slot-header-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: text-bottom;
  margin-right: 4px;
  color: #2b6cb0;
}

.slot-svg-icon {
  display: inline-block;
  vertical-align: middle;
  stroke-width: 2.2;
}

.col-total {
  text-align: center;
  width: 100px;
}

.matrix-row {
  border-bottom: 1px solid rgba(46, 79, 126, 0.08);
  transition: background 0.15s ease;
}

.matrix-row:hover {
  background: rgba(236, 244, 255, 0.45);
}

.cell-set-info {
  padding: 8px 12px;
  vertical-align: middle;
}

.matrix-set-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.matrix-set-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 6px;
  border: 1px solid rgba(199, 165, 90, 0.4);
  background: #ffffff;
  padding: 1px;
}

.matrix-set-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.matrix-set-name {
  font-weight: 700;
  color: var(--ink);
  font-size: 12px;
}

.cell-slot-data {
  padding: 8px;
  vertical-align: middle;
  text-align: center;
  border-left: 1px dashed rgba(46, 79, 126, 0.08);
}

.matrix-chip-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.matrix-chip {
  margin: 0;
  width: fit-content;
}

.cell-empty {
  color: rgba(46, 79, 126, 0.25);
  font-weight: 300;
}

.cell-total {
  padding: 8px;
  text-align: center;
  vertical-align: middle;
  border-left: 1px dashed rgba(46, 79, 126, 0.12);
}

.matrix-badge {
  margin: 0 auto;
}

/* 2. DISPLAY VIEW: SLOT HUB VIEW (部位视角) */
.slot-hub-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 12px;
  padding: 4px 2px 16px;
}

.slot-hub-card {
  border: 1px solid rgba(46, 79, 126, 0.16);
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(37, 75, 122, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.slot-hub-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(236, 243, 253, 0.85), rgba(246, 249, 254, 0.5));
  border-bottom: 1px solid rgba(46, 79, 126, 0.1);
}

.slot-hub-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.slot-hub-icon {
  font-size: 16px;
}

.slot-hub-title h4 {
  font-size: 14px;
  font-weight: 700;
  color: #1a478d;
}

.slot-hub-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slot-hub-item-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(245, 248, 252, 0.7);
  border: 1px solid rgba(46, 79, 126, 0.08);
}

.hub-set-name-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hub-set-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
}
</style>
