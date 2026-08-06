<script setup lang="ts">
import { computed, ref } from "vue";
import { lightConeById, relicCatalogue, resolveCharacterCatalogue } from "@/shared/catalogue";
import {
  calculateStandingStats,
  formatStandingStat,
  isMaxStandingEquipment,
  lightConeSkillEffect,
} from "@/shared/utils/standing-stats";
import {
  loadDisabledTraceNodes,
  traceNodeEnabled as isTraceNodeEnabled,
  traceSettingsStorageKey,
} from "@/shared/utils/trace-settings";
import { primaryTraceNodes } from "@/shared/utils/trace-stats";
import { formatTime, formatTraceStat } from "@/shared/utils/display";
import type { CharacterBuildPlan } from "@/types";
import { characterSkillEntries } from "./character-skills";
import CharacterScorePanel from "./CharacterScorePanel.vue";
import { pathLabel } from "./options";
import type { CharacterDetailData } from "./detail-types";

const props = defineProps<{ detail: CharacterDetailData; plan?: CharacterBuildPlan | null }>();
const disabledTraceNodes = ref<Record<string, number[]>>(loadDisabledTraceNodes());
const catalogue = computed(() =>
  resolveCharacterCatalogue({
    characterId: props.detail.characterId,
    name: props.detail.name,
    path: props.detail.path,
  }),
);
const traceNodes = computed(() => primaryTraceNodes(catalogue.value?.traceStats ?? []));
const traceEnabled = (id: number) =>
  isTraceNodeEnabled(disabledTraceNodes.value, props.detail.characterId, id);
const selectedTraces = computed(() =>
  traceNodes.value.filter((node) => traceEnabled(node.id)).flatMap((node) => node.stats),
);
const staticSetEffects = computed(() => {
  const counts = new Map<number, number>();
  for (const relic of props.detail.equippedRelics ?? [])
    counts.set(relic.setId, (counts.get(relic.setId) ?? 0) + 1);
  return relicCatalogue.sets
    .filter((set) => (counts.get(set.id) ?? 0) >= 2)
    .map((set) => set.effects.twoPiece)
    .filter(Boolean);
});
const standingStats = computed(() => {
  const base = catalogue.value?.baseStats;
  const lightCone = props.detail.equippedLightCone ?? null;
  if (!base) return { available: false, reason: "该角色的满级基础属性尚未同步。", stats: [] };
  if (!lightCone)
    return { available: false, reason: "未装备光锥，无法汇总完整站街属性。", stats: [] };
  const lightConeEntry = lightConeById.get(lightCone.templateId);
  const lightConeBase = lightConeEntry?.baseStats;
  if (!lightConeBase)
    return { available: false, reason: "该光锥的满级基础属性尚未同步。", stats: [] };
  if (!isMaxStandingEquipment(props.detail, lightCone))
    return { available: false, reason: "角色与已装备光锥需均为 Lv.80、满突破后展示。", stats: [] };
  const lightConeEffect = lightConeSkillEffect(lightConeEntry?.skill, lightCone.superimposition);
  return {
    available: true,
    reason: "",
    stats: calculateStandingStats({
      characterBase: base,
      lightConeBase,
      relics: props.detail.equippedRelics ?? [],
      traces: selectedTraces.value,
      setEffects: staticSetEffects.value,
      lightConeEffects: lightConeEffect ? [lightConeEffect] : [],
    }),
  };
});

function toggleTrace(id: number) {
  const key = String(props.detail.characterId);
  const current = new Set(disabledTraceNodes.value[key] ?? []);
  if (current.has(id)) current.delete(id);
  else current.add(id);
  disabledTraceNodes.value = { ...disabledTraceNodes.value, [key]: [...current] };
  localStorage.setItem(traceSettingsStorageKey, JSON.stringify(disabledTraceNodes.value));
}

const enabledTraceCount = computed(() =>
  traceNodes.value.filter((node) => traceEnabled(node.id)).length,
);

const masterTraceStatOrder = computed(() => {
  const keys: string[] = [];
  for (const node of traceNodes.value) {
    for (const stat of node.stats) {
      if (!keys.includes(stat.key)) {
        keys.push(stat.key);
      }
    }
  }
  return keys;
});

const activeTraceSummary = computed(() => {
  const summaryMap = new Map<string, number>();
  for (const stat of selectedTraces.value) {
    summaryMap.set(stat.key, (summaryMap.get(stat.key) ?? 0) + stat.value);
  }
  return masterTraceStatOrder.value
    .filter((key) => summaryMap.has(key) && (summaryMap.get(key) ?? 0) > 0)
    .map((key) => {
      const value = summaryMap.get(key)!;
      return {
        key,
        value,
        formatted: formatTraceStat(value),
      };
    });
});

function selectAllTraces() {
  const key = String(props.detail.characterId);
  disabledTraceNodes.value = { ...disabledTraceNodes.value, [key]: [] };
  localStorage.setItem(traceSettingsStorageKey, JSON.stringify(disabledTraceNodes.value));
}

function clearAllTraces() {
  const key = String(props.detail.characterId);
  const allIds = traceNodes.value.map((n) => n.id);
  disabledTraceNodes.value = { ...disabledTraceNodes.value, [key]: allIds };
  localStorage.setItem(traceSettingsStorageKey, JSON.stringify(disabledTraceNodes.value));
}

function getStatCategory(key: string): { type: string; colorClass: string } {
  if (key.includes("防御")) return { type: "def", colorClass: "stat-def" };
  if (key.includes("速度")) return { type: "spd", colorClass: "stat-spd" };
  if (key.includes("击破")) return { type: "break", colorClass: "stat-break" };
  if (key.includes("暴击")) return { type: "crit", colorClass: "stat-crit" };
  if (key.includes("生命")) return { type: "hp", colorClass: "stat-hp" };
  if (key.includes("攻击")) return { type: "atk", colorClass: "stat-atk" };
  if (key.includes("抵抗")) return { type: "res", colorClass: "stat-res" };
  if (key.includes("命中")) return { type: "hit", colorClass: "stat-hit" };
  if (key.includes("伤害") || key.includes("属性")) return { type: "elem", colorClass: "stat-elem" };
  return { type: "general", colorClass: "stat-general" };
}
</script>

<template>
  <section class="character-detail-card">
    <header class="character-banner" :data-element="catalogue?.element ?? '物理'">
      <div class="character-banner-content">
        <div class="character-banner-text">
          <p class="eyebrow">BASELINE PROFILE</p>
          <h2>{{ detail.name }}</h2>
          <p class="character-banner-subtitle">{{ catalogue?.element ?? '未知' }} · {{ pathLabel(detail.path) }}</p>
        </div>
        <div class="character-banner-metrics">
          <div><span>等级</span><b>Lv.{{ detail.level }}</b></div>
          <div><span>突破</span><b>{{ detail.ascension }}</b></div>
          <div><span>星魂</span><b>{{ detail.eidolon }}</b></div>
          <div><span>能力</span><b>V{{ detail.abilityVersion }}</b></div>
        </div>
      </div>
      
      <div class="character-banner-image-wrapper">
        <img
          v-if="catalogue?.image"
          class="character-banner-image"
          :src="catalogue.image"
          :alt="`${detail.name} 档案形象`"
        />
        <div v-else class="path-seal large">{{ pathLabel(detail.path).slice(0, 1) }}</div>
      </div>
    </header>
    <CharacterScorePanel
      :detail="detail"
      :plan="plan"
      :current-spd="
        standingStats.available
          ? (standingStats.stats.find((stat) => stat.key === 'speed')?.value ?? null)
          : null
      "
    />
    <section class="character-data-section standing-stat-section">
      <header>
        <div>
          <p class="eyebrow">STATIC PROFILE</p>
          <h3>站街属性</h3>
        </div>
      </header>
      <div v-if="standingStats.available" class="standing-stat-grid">
        <div v-for="stat in standingStats.stats" :key="stat.key">
          <span>{{ stat.label }}</span
          ><b>{{ formatStandingStat(stat) }}</b>
        </div>
      </div>
      <p v-else class="standing-stat-unavailable">{{ standingStats.reason }}</p>
      <footer>
        已计入基础属性、光锥三围、光锥无条件技能加成、遗器主/副属性、无条件 2 件套与当前勾选行迹。
      </footer>
    </section>
    <section class="character-data-section">
      <header>
        <div>
          <p class="eyebrow">SKILL LEVELS</p>
          <h3>技能等级</h3>
        </div>
      </header>
      <div v-if="characterSkillEntries(detail.skills).length" class="character-data-grid">
        <div v-for="skill in characterSkillEntries(detail.skills)" :key="skill.key">
          <span>{{ skill.label }}</span
          ><b>{{ skill.value }}</b>
        </div>
      </div>
      <p v-else class="empty-substats">未同步技能数据。</p>
    </section>
    <section v-if="traceNodes.length" class="character-data-section trace-stat-section">
      <header class="trace-section-header">
        <div class="trace-header-main">
          <p class="eyebrow">TRACE ATTRIBUTES</p>
          <div class="trace-title-row">
            <h3>行迹属性</h3>
            <span class="trace-count-badge">
              {{ enabledTraceCount }} / {{ traceNodes.length }} 已启用
            </span>
          </div>
        </div>
        <div class="trace-quick-actions">
          <button
            type="button"
            class="trace-action-btn"
            :disabled="enabledTraceCount === traceNodes.length"
            @click="selectAllTraces"
          >
            全选
          </button>
          <button
            type="button"
            class="trace-action-btn"
            :disabled="enabledTraceCount === 0"
            @click="clearAllTraces"
          >
            全清
          </button>
        </div>
      </header>

      <!-- 激活加成汇总 -->
      <div v-if="activeTraceSummary.length" class="trace-summary-bar">
        <span class="summary-label">已加成总计</span>
        <div class="summary-chips">
          <span
            v-for="stat in activeTraceSummary"
            :key="stat.key"
            class="summary-chip"
            :class="getStatCategory(stat.key).colorClass"
          >
            <span class="chip-name">{{ stat.key }}</span>
            <span class="chip-val">{{ stat.formatted }}</span>
          </span>
        </div>
      </div>
      <div v-else class="trace-summary-empty">
        未启用任何行迹属性节点
      </div>

      <!-- 节点卡片列表 -->
      <div class="trace-node-grid">
        <button
          v-for="trace in traceNodes"
          :key="trace.id"
          type="button"
          class="trace-node-card"
          :class="[
            { disabled: !traceEnabled(trace.id) },
            getStatCategory(trace.stats[0]?.key || '').colorClass,
          ]"
          :aria-pressed="traceEnabled(trace.id)"
          @click="toggleTrace(trace.id)"
        >
          <div class="trace-card-icon-wrap">
            <svg
              class="trace-card-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                v-if="getStatCategory(trace.stats[0]?.key || '').type === 'def'"
                d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
              />
              <path
                v-else-if="getStatCategory(trace.stats[0]?.key || '').type === 'spd'"
                d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
              />
              <path
                v-else-if="getStatCategory(trace.stats[0]?.key || '').type === 'break'"
                d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"
              />
              <path
                v-else-if="getStatCategory(trace.stats[0]?.key || '').type === 'crit'"
                d="M12 22a10 10 0 100-20 10 10 0 000 20zm0-6a4 4 0 100-8 4 4 0 000 8z"
              />
              <path
                v-else-if="getStatCategory(trace.stats[0]?.key || '').type === 'hp'"
                d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
              />
              <path
                v-else-if="getStatCategory(trace.stats[0]?.key || '').type === 'atk'"
                d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 22l4-4"
              />
              <path
                v-else-if="getStatCategory(trace.stats[0]?.key || '').type === 'elem'"
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              />
              <circle v-else cx="12" cy="12" r="9" />
            </svg>
          </div>
          <div class="trace-card-content">
            <div class="trace-card-header">
              <span class="trace-card-title">{{ trace.name }}</span>
              <span class="trace-card-status">
                <span class="status-dot"></span>
                <span class="status-text">{{ traceEnabled(trace.id) ? "已激活" : "未激活" }}</span>
              </span>
            </div>
            <div class="trace-card-body">
              <span class="trace-card-label">{{ trace.stats.map((s) => s.key).join(" · ") }}</span>
              <span class="trace-card-value">{{ trace.stats.map((s) => formatTraceStat(s.value)).join(" / ") }}</span>
            </div>
          </div>
        </button>
      </div>
    </section>
    <section v-if="detail.memosprite" class="memosprite-note">
      <header>
        <div>
          <p class="eyebrow">MEMOSPRITE SKILLS</p>
          <h3>忆灵技能等级</h3>
        </div>
      </header>
      <div class="character-data-grid">
        <div v-for="skill in characterSkillEntries(detail.memosprite)" :key="skill.key">
          <span>{{ skill.label }}</span
          ><b>{{ skill.value }}</b>
        </div>
      </div>
    </section>
    <footer class="relic-detail-footer">
      <div>
        <span>更新于</span><b>{{ formatTime(detail.updatedAt) }}</b>
      </div>
      <div><span>数据来源</span><b>游戏同步</b></div>
    </footer>
  </section>
</template>
