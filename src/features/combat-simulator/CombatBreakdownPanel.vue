<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  buildCharacterCombatProfile,
  elementLabel,
  evaluateCharacterSkillPreviews,
  formatDamageCompact,
  formatDamageExact,
  type CombatantInput,
  type EnemyPreset,
} from "@/shared/utils/combat";

const props = defineProps<{
  combatants: CombatantInput[];
  enemy: EnemyPreset;
}>();

const selectedCharId = ref<number>(props.combatants[0]?.characterId ?? 0);

watch(
  () => props.combatants,
  (list) => {
    if (!list.some((c) => c.characterId === selectedCharId.value)) {
      selectedCharId.value = list[0]?.characterId ?? 0;
    }
  },
  { immediate: true },
);

const activeCombatant = computed(
  () =>
    props.combatants.find((c) => c.characterId === selectedCharId.value) ??
    props.combatants[0] ??
    null,
);

const activeProfile = computed(() =>
  activeCombatant.value ? buildCharacterCombatProfile(activeCombatant.value) : null,
);

const skillPreviews = computed(() =>
  activeCombatant.value ? evaluateCharacterSkillPreviews(activeCombatant.value, props.enemy) : [],
);

function patternLabel(pattern: string): string {
  switch (pattern) {
    case "single":
      return "单攻";
    case "blast":
      return "扩散";
    case "aoe":
      return "群攻";
    case "bounce":
      return "弹射";
    default:
      return "辅助";
  }
}
</script>

<template>
  <div v-if="activeCombatant && activeProfile" class="combat-sim-breakdown-section">
    <div
      v-if="combatants.length > 1"
      class="combat-sim-filter-pills"
      role="group"
      aria-label="选择角色查看技能拆解"
    >
      <button
        v-for="c in combatants"
        :key="c.characterId"
        type="button"
        :class="{ active: c.characterId === activeCombatant.characterId }"
        @click="selectedCharId = c.characterId"
      >
        {{ c.name }}
      </button>
    </div>

    <div class="combat-sim-panel-card">
      <div class="combat-sim-panel-header">
        <div>
          <strong>{{ activeCombatant.name }}</strong>
          <span class="combat-sim-meta-sub">
            Lv.{{ activeCombatant.level }} · {{ activeCombatant.eidolon }}魂 ·
            {{ elementLabel(activeCombatant.element) }} · 最大能量 {{ activeProfile.maxEnergy }}
          </span>
        </div>
        <span :class="['combat-sim-depth-badge', `is-${activeProfile.modelingDepth}`]">
          {{ activeProfile.modelingBadge }}
        </span>
      </div>
      <div class="combat-sim-stat-grid">
        <div>
          <span>攻击力</span><b>{{ Math.round(activeCombatant.standing.atk) }}</b>
        </div>
        <div>
          <span>生命值</span><b>{{ Math.round(activeCombatant.standing.hp) }}</b>
        </div>
        <div>
          <span>速度</span><b>{{ activeCombatant.standing.speed.toFixed(1) }}</b>
        </div>
        <div>
          <span>暴击率</span><b>{{ (activeCombatant.standing.critRate * 100).toFixed(1) }}%</b>
        </div>
        <div>
          <span>暴击伤害</span><b>{{ (activeCombatant.standing.critDamage * 100).toFixed(1) }}%</b>
        </div>
        <div>
          <span>击破特攻</span><b>{{ (activeCombatant.standing.breakEffect * 100).toFixed(1) }}%</b>
        </div>
      </div>
      <p class="combat-sim-panel-note">{{ activeProfile.modelingSummary }}</p>
    </div>

    <div class="combat-sim-skill-list">
      <article v-for="skill in skillPreviews" :key="skill.id" class="combat-sim-skill-card">
        <header class="combat-sim-skill-head">
          <div class="combat-sim-skill-title">
            <strong>{{ skill.name }}</strong>
            <span class="combat-sim-pattern-pill">{{ patternLabel(skill.pattern) }}</span>
            <span v-if="skill.toughnessMain > 0" class="combat-sim-toughness-pill">
              削韧 {{ skill.toughnessMain
              }}<template v-if="skill.toughnessAdjacent > 0">
                / 邻 {{ skill.toughnessAdjacent }}</template
              >
            </span>
          </div>
          <div class="combat-sim-skill-expected">
            <span>期望伤害</span>
            <strong>{{ formatDamageCompact(skill.expectedTotal) }}</strong>
          </div>
        </header>

        <div class="combat-sim-skill-triplets">
          <div>
            <span>非暴击</span>
            <b>{{ formatDamageExact(skill.nonCritTotal) }}</b>
          </div>
          <div>
            <span>暴击</span>
            <b>{{ formatDamageExact(skill.critTotal) }}</b>
          </div>
          <div>
            <span>直伤期望</span>
            <b>{{ formatDamageExact(skill.directExpected) }}</b>
          </div>
          <div v-if="skill.superBreakExpected > 0" class="is-highlight">
            <span>自拐超击破</span>
            <b>{{ formatDamageExact(skill.superBreakExpected) }}</b>
          </div>
        </div>

        <div class="combat-sim-multipliers">
          <span>防御 ×{{ skill.primaryBreakdown.defenseMultiplier.toFixed(3) }}</span>
          <span>抗性 ×{{ skill.primaryBreakdown.resistanceMultiplier.toFixed(2) }}</span>
          <span>易伤 ×{{ skill.primaryBreakdown.vulnerabilityMultiplier.toFixed(2) }}</span>
          <span>增伤 ×{{ skill.primaryBreakdown.damageBoostMultiplier.toFixed(2) }}</span>
          <span>韧性 ×{{ skill.primaryBreakdown.brokenMultiplier.toFixed(2) }}</span>
          <span v-for="note in skill.notes" :key="note" class="is-note">{{ note }}</span>
        </div>
      </article>
    </div>
  </div>
</template>
