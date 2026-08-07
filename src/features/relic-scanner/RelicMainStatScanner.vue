<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Button from "primevue/button";
import { buildPlanApi } from "@/shared/api/build-plan";
import { inventoryApi } from "@/shared/api/inventory";
import { scanUpgradeRecommendations } from "@/shared/utils/relic-score";
import { characterDisplayName, relicImage, resolveCharacterCatalogue } from "@/shared/catalogue";
import { formatStatValue } from "@/shared/catalogue/relic-options";
import type { BuildDashboardEntry, RelicListItem, RelicMainStatScanResult } from "@/types";

const props = defineProps<{ imageFor: (relic: RelicListItem) => string | undefined }>();
const emit = defineEmits<{ "open-relic": [relic: RelicListItem] }>();
const planCount = ref<number | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const usefulnessLoading = ref(false);
const error = ref("");
const result = ref<RelicMainStatScanResult | null>(null);
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

const slotLabels: Record<string, string> = {
  Head: "头部",
  Hands: "手部",
  Body: "躯干",
  Feet: "脚部",
  PlanarSphere: "位面球",
  LinkRope: "连结绳",
};
const statLabels: Record<string, string> = {
  HP: "生命值",
  "HP%": "生命百分比",
  ATK: "攻击力",
  "ATK%": "攻击百分比",
  DEF: "防御力",
  "DEF%": "防御百分比",
  SPD: "速度",
  "CRIT Rate": "暴击率",
  "CRIT DMG": "暴击伤害",
  "Effect Hit Rate": "效果命中",
  "Outgoing Healing Boost": "治疗量加成",
  "Energy Regeneration Rate": "能量恢复效率",
  "Break Effect": "击破特攻",
  "Physical DMG Boost": "物理伤害提高",
  "Fire DMG Boost": "火属性伤害提高",
  "Ice DMG Boost": "冰属性伤害提高",
  "Lightning DMG Boost": "雷属性伤害提高",
  "Wind DMG Boost": "风属性伤害提高",
  "Quantum DMG Boost": "量子属性伤害提高",
  "Imaginary DMG Boost": "虚数伤害提高",
};
const canAnalyze = computed(
  () => planCount.value !== null && planCount.value > 0 && !loading.value && !loadingMore.value,
);
const hasMore = computed(() => !!result.value && result.value.items.length < result.value.total);
const slotLabel = (slot: string) => slotLabels[slot] ?? slot;
const statLabel = (stat: string) => statLabels[stat] ?? stat;
const allowedStats = (item: RelicListItem) => result.value?.allowedMainStats[item.slot] ?? [];

const gradeClass = (grade: string | null) => {
  if (!grade) return "grade-none";
  return `grade-${grade.toLowerCase().replace("+", "-plus")}`;
};

function loadMoreOnScroll(event: Event) {
  const container = event.currentTarget as HTMLElement;
  if (
    hasMore.value &&
    !loadingMore.value &&
    container.scrollTop + container.clientHeight >= container.scrollHeight - 80
  ) {
    void analyze(true);
  }
}

async function analyze(append = false) {
  if (!canAnalyze.value && !append) return;
  error.value = "";
  if (!append) {
    usefulnessRows.value = [];
    usefulnessScanned.value = 0;
    usefulnessDone.value = false;
  }
  if (append) loadingMore.value = true;
  else loading.value = true;
  try {
    const page = append ? (result.value?.page ?? 1) + 1 : 1;
    const next = await inventoryApi.scanRelicsByMainStat({ page, pageSize: 50 });
    planCount.value = next.planCount;
    result.value =
      append && result.value ? { ...next, items: [...result.value.items, ...next.items] } : next;
  } catch (cause) {
    error.value = String(cause);
  } finally {
    loading.value = false;
    loadingMore.value = false;
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
      equippedRelics: (entry.character.equippedRelics ?? []).filter((relic) => relic.slot != null).map((relic) => ({
        slot: relic.slot!,
        mainStat: relic.mainStat,
        setId: relic.setId,
        substats: (relic.substats ?? []).map((s) => ({ ...s, key: s.key ?? (s as any).stat })),
      })),
    }));
    const recommendations = scanUpgradeRecommendations(
      page.items.map((item) => ({
        slot: item.slot,
        mainStat: item.mainStat,
        substats: (item.substats ?? []).map((s) => ({ ...s, key: s.key ?? (s as any).stat })),
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
            <div class="upgrade-badge">
              <i class="sparkle">✦</i> 替换推荐
            </div>
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
              <span v-else class="relic-thumb-fallback">{{ slotLabel(row.item.slot).slice(0, 1) }}</span>
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
                <em v-if="row.item.mainStatValue">+{{ formatStatValue(row.item.mainStat, row.item.mainStatValue) }}</em>
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
              <span v-else :class="['character-avatar-fallback', `element-${row.characterElement}`]">
                {{ row.characterDisplayLabel.slice(0, 1) }}
              </span>
            </div>
            <div class="character-target-info">
              <span class="target-caption">推荐替换件适配</span>
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
            >
              {{ statLabel(sub.key ?? (sub as any).stat) }} <em>+{{ formatStatValue(sub.key ?? (sub as any).stat, sub.value) }}</em>
            </span>
          </div>

          <!-- Score Footer -->
          <div class="upgrade-card-footer">
            <div class="roll-score-info">
              <span class="roll-delta-tag">
                <i class="up-arrow">↑</i> +{{ row.deltaWeightedRolls.toFixed(2) }} <small>rolls</small>
              </span>
              <span class="roll-vs-detail">
                {{ row.weightedRolls.toFixed(2) }} <small>vs</small>
                {{ row.equippedWeightedRolls != null ? row.equippedWeightedRolls.toFixed(2) : "空槽" }}
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
    <div v-else-if="!result.items.length" class="scanner-state success">
      未发现无目标主词条的未装备遗器。
    </div>
    <template v-else>
      <div class="scanner-result-heading">
        <div>
          <small>SCAN RESULT / UNASSIGNED PIECES</small>
          <p>
            <b>{{ result.total }}</b> 件待复核
          </p>
        </div>
        <p class="scanner-result-note">点击遗器查看完整词条与来源 <span>↗</span></p>
      </div>
      <div
        class="scanner-list"
        role="list"
        aria-label="无目标主词条遗器"
        @scroll="loadMoreOnScroll"
      >
        <button
          v-for="item in result.items"
          :key="item.itemId"
          class="scanner-item"
          type="button"
          role="listitem"
          @click="emit('open-relic', item)"
        >
          <span class="scanner-card-kicker"
            ><i>NO MATCH</i><small>{{ slotLabel(item.slot) }}</small></span
          >
          <span :class="['scanner-item-image', `rarity-${item.rarity}`]"
            ><img v-if="props.imageFor(item)" :src="props.imageFor(item)" :alt="item.name" /><i
              v-else
              >{{ slotLabel(item.slot).slice(0, 1) }}</i
            ></span
          >
          <span class="scanner-item-identity"
            ><b>{{ item.setName }}</b
            ><small>{{ item.rarity }} 星 · 强化 +{{ item.level }}</small></span
          >
          <span class="scanner-stat-compare"
            ><span
              ><small>当前</small><b>{{ statLabel(item.mainStat) }}</b></span
            ><i>≠</i
            ><span
              ><small>目标</small
              ><b v-if="allowedStats(item).length">{{
                allowedStats(item).map(statLabel).join(" / ")
              }}</b
              ><em v-else>尚未设置目标主词条</em></span
            ></span
          >
          <span class="scanner-item-arrow" aria-hidden="true">查看 ›</span>
        </button>
        <p v-if="loadingMore" class="scanner-loading">正在继续分析…</p>
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
  grid-auto-rows: max-content;
  align-content: start;
  align-items: stretch;
  gap: 14px;
  overflow: auto;
  padding: 4px 4px 16px;
}

.upgrade-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  height: max-content;
  min-height: min-content;
}
.upgrade-card > div {
  flex-shrink: 0;
}

.upgrade-card:hover {
  border-color: rgba(37, 95, 185, 0.55);
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(35, 70, 130, 0.14), 0 0 0 1px rgba(50, 120, 220, 0.2);
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
  font: 800 11px/1.2 "Bahnschrift", sans-serif;
  letter-spacing: 0.05em;
}

.grade-pill.grade-sss {
  background: linear-gradient(135deg, #eab308, #ca8a04);
  color: #fff;
  box-shadow: 0 2px 6px rgba(234, 179, 8, 0.35);
}

.grade-pill.grade-ss {
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

.grade-pill.grade-a {
  background: rgba(59, 130, 246, 0.15);
  color: #1d4ed8;
}

.grade-pill.grade-b,
.grade-pill.grade-none {
  background: rgba(148, 163, 184, 0.18);
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
  font: 700 9px/1 "Bahnschrift", sans-serif;
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
  padding: 6px 10px;
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
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.substat-chip {
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(46, 79, 126, 0.12);
  font-size: 10px;
  color: var(--ink-soft);
}

.substat-chip em {
  font-style: normal;
  color: #2563eb;
  font-weight: 700;
}

.upgrade-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 6px;
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

.scanner-list {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  align-content: start;
  gap: 10px;
  overflow: auto;
  padding: 2px 2px 14px;
}

.scanner-item {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  grid-template-rows: auto auto auto;
  align-items: center;
  column-gap: 12px;
  row-gap: 7px;
  min-height: 142px;
  padding: 13px 15px;
  border: 1px solid rgba(45, 75, 116, 0.15);
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 8px 20px rgba(42, 69, 105, 0.05);
  text-align: left;
}

.scanner-item:hover {
  border-color: rgba(37, 86, 166, 0.48);
  background: #fff;
  box-shadow: 0 12px 25px rgba(42, 69, 105, 0.12);
  transform: translateY(-2px);
}

.scanner-card-kicker {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.scanner-card-kicker i {
  color: #ae6954;
  font:
    700 8px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.15em;
  font-style: normal;
}

.scanner-card-kicker small,
.scanner-item-identity small {
  color: var(--muted);
  font-size: 10px;
}

.scanner-item-image {
  display: grid;
  grid-row: 2 / span 2;
  place-items: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border: 1px solid rgba(199, 165, 90, 0.58);
  background: #fff;
}

.scanner-item-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.scanner-item-image i {
  color: var(--gold);
  font-style: normal;
  font-weight: 700;
}

.scanner-item-identity {
  display: grid;
  gap: 5px;
}

.scanner-item-identity > b {
  overflow: hidden;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.relic-level {
  font-style: normal;
  color: var(--blue);
  font-size: 13px;
  margin-left: 2px;
}

.scanner-stat-compare {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16px minmax(0, 1.4fr);
  grid-column: 2;
  align-items: center;
  gap: 5px;
}
.scanner-stat-compare span {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.scanner-stat-compare > i {
  color: var(--gold);
  font-style: normal;
}
.scanner-stat-compare b {
  overflow: hidden;
  color: #a85b4d;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scanner-stat-compare span:last-child b {
  color: var(--blue-deep);
}
.scanner-stat-compare em {
  color: #ae7c32;
  font-size: 12px;
  font-style: normal;
}
.scanner-item-arrow {
  grid-column: 3;
  grid-row: 3;
  color: var(--blue);
  font-size: 10px;
  white-space: nowrap;
}
.scanner-loading {
  grid-column: 1 / -1;
  margin: 2px 0 10px;
  color: var(--muted);
  font-size: 11px;
  text-align: center;
}
</style>
