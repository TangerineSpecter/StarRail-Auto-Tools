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
</script>

<template>
  <section class="character-detail-card">
    <div class="character-identity">
      <img
        v-if="catalogue?.image"
        class="character-detail-avatar"
        :src="catalogue.image"
        :alt="`${detail.name} 头像`"
      />
      <div v-else class="path-seal">{{ pathLabel(detail.path).slice(0, 1) }}</div>
      <div>
        <p>{{ pathLabel(detail.path) }} · PATH</p>
        <h3>{{ detail.name }}</h3>
      </div>
      <b>Lv.{{ detail.level }}</b>
    </div>
    <div class="character-metrics">
      <div>
        <span>突破</span><b>{{ detail.ascension }}</b>
      </div>
      <div>
        <span>星魂</span><b>{{ detail.eidolon }}</b>
      </div>
      <div>
        <span>能力版本</span><b>V{{ detail.abilityVersion }}</b>
      </div>
    </div>
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
        <small v-if="standingStats.available"
          >遗器 {{ detail.equippedRelics?.length ?? 0 }} 件 · 行迹
          {{ selectedTraces.length }} 条</small
        ><small v-else>满级后可计算</small>
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
        <small>{{ characterSkillEntries(detail.skills).length }} 项</small>
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
      <header>
        <div>
          <p class="eyebrow">TRACE ATTRIBUTES</p>
          <h3>行迹属性</h3>
        </div>
        <small>默认全选 · 可取消</small>
      </header>
      <div class="trace-stat-list">
        <button
          v-for="trace in traceNodes"
          :key="trace.id"
          type="button"
          :class="{ disabled: !traceEnabled(trace.id) }"
          :aria-pressed="traceEnabled(trace.id)"
          @click="toggleTrace(trace.id)"
        >
          <span
            ><b>{{ trace.name }}</b
            ><small>{{ trace.stats.map((stat) => stat.key).join(" · ") }}</small></span
          ><em>{{ trace.stats.map((stat) => formatTraceStat(stat.value)).join(" / ") }}</em>
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
