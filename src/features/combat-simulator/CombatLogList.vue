<script setup lang="ts">
import { computed, ref } from "vue";
import {
  damageKindLabel,
  elementLabel,
  formatDamageCompact,
  formatDamageExact,
  type ActionLogEntry,
} from "@/shared/utils/combat";

const props = defineProps<{
  logs: ActionLogEntry[];
  cycles: number;
}>();

const selectedCycle = ref<number | "all">("all");
const selectedActorId = ref<number | "all">("all");
const expandedSteps = ref<Set<number>>(new Set());

const actors = computed(() => {
  const map = new Map<number, string>();
  for (const log of props.logs) {
    if (!map.has(log.actorId)) map.set(log.actorId, log.actorName);
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }));
});

const cycleOptions = computed(() => Array.from({ length: props.cycles }, (_, i) => i + 1));

const filteredLogs = computed(() =>
  props.logs.filter((log) => {
    if (selectedCycle.value !== "all" && log.cycle !== selectedCycle.value) return false;
    if (selectedActorId.value !== "all" && log.actorId !== selectedActorId.value) return false;
    return true;
  }),
);

function toggleStep(step: number) {
  const next = new Set(expandedSteps.value);
  if (next.has(step)) next.delete(step);
  else next.add(step);
  expandedSteps.value = next;
}

function abilityBadge(kind: ActionLogEntry["abilityKind"]): string {
  switch (kind) {
    case "basic":
      return "普攻";
    case "skill":
      return "战技";
    case "ult":
      return "终结技";
    case "fua":
      return "追击";
    default:
      return "触发";
  }
}
</script>

<template>
  <div class="combat-sim-log-section">
    <div class="combat-sim-log-filters">
      <div class="combat-sim-filter-pills" role="group" aria-label="按轮次筛选">
        <button
          type="button"
          :class="{ active: selectedCycle === 'all' }"
          @click="selectedCycle = 'all'"
        >
          全部轮次 ({{ logs.length }})
        </button>
        <button
          v-for="c in cycleOptions"
          :key="c"
          type="button"
          :class="{ active: selectedCycle === c }"
          @click="selectedCycle = c"
        >
          第{{ c }}轮
        </button>
      </div>
      <div
        v-if="actors.length > 1"
        class="combat-sim-filter-pills"
        role="group"
        aria-label="按角色筛选"
      >
        <button
          type="button"
          :class="{ active: selectedActorId === 'all' }"
          @click="selectedActorId = 'all'"
        >
          全员
        </button>
        <button
          v-for="actor in actors"
          :key="actor.id"
          type="button"
          :class="{ active: selectedActorId === actor.id }"
          @click="selectedActorId = actor.id"
        >
          {{ actor.name }}
        </button>
      </div>
    </div>

    <div v-if="!filteredLogs.length" class="combat-sim-empty">当前筛选条件下暂无行动记录。</div>
    <ol v-else class="combat-sim-log-list">
      <li
        v-for="log in filteredLogs"
        :key="log.step"
        :class="[
          'combat-sim-log-item',
          {
            'has-break': log.tags.some((t) => t.includes('击破')),
            'is-ult': log.abilityKind === 'ult',
            'is-expanded': expandedSteps.has(log.step),
          },
        ]"
      >
        <button
          type="button"
          class="combat-sim-log-row"
          :aria-expanded="expandedSteps.has(log.step)"
          @click="toggleStep(log.step)"
        >
          <span class="combat-sim-log-time">
            <b>C{{ log.cycle }}</b>
            <small>{{ log.actionValue.toFixed(1) }} AV</small>
          </span>
          <span class="combat-sim-log-actor">
            <strong>
              {{ log.summonName ? `${log.actorName}·${log.summonName}` : log.actorName }}
            </strong>
            <span :class="['combat-sim-ability-tag', `kind-${log.abilityKind}`]">
              {{ abilityBadge(log.abilityKind) }}
            </span>
            <em class="combat-sim-action-name">{{ log.actionName }}</em>
          </span>
          <span class="combat-sim-log-meta">
            <span class="combat-sim-resource-pill" title="战技点变化">
              SP {{ log.spBefore }}→{{ log.spAfter }}
            </span>
            <span class="combat-sim-resource-pill" title="能量变化">
              EN {{ log.energyBefore }}→{{ log.energyAfter }}/{{ log.maxEnergy }}
            </span>
          </span>
          <span class="combat-sim-log-dmg">
            <strong :class="{ 'is-big': log.totalDamage >= 150000 }">
              {{ log.totalDamage > 0 ? formatDamageCompact(log.totalDamage) : "—" }}
            </strong>
            <small>{{ log.summary }}</small>
          </span>
        </button>

        <div v-if="log.tags.length" class="combat-sim-log-tags">
          <span
            v-for="tag in log.tags"
            :key="tag"
            :class="['combat-sim-event-chip', { 'is-break': tag.includes('击破') }]"
          >
            {{ tag }}
          </span>
        </div>

        <div v-if="expandedSteps.has(log.step)" class="combat-sim-log-detail">
          <p v-if="!log.hits.length" class="combat-sim-detail-empty">
            本次行动为增益/状态强化，无直接伤害段。
          </p>
          <table v-else class="combat-sim-hit-table">
            <thead>
              <tr>
                <th>目标</th>
                <th>类型</th>
                <th>属性</th>
                <th>基础量</th>
                <th>防御×抗性×易伤</th>
                <th>增伤×暴击</th>
                <th>实际伤害</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(hit, idx) in log.hits" :key="idx">
                <td>目标 {{ hit.targetIndex + 1 }}</td>
                <td>
                  <span :class="['combat-sim-kind-dot', `kind-${hit.damageKind}`]" />
                  {{ damageKindLabel(hit.damageKind) }}
                  <em v-if="hit.didCrit" class="combat-sim-crit-flag">暴击</em>
                  <em v-if="hit.causedBreak" class="combat-sim-break-flag">破韧</em>
                  <em v-if="hit.causedExoBreak" class="combat-sim-break-flag">虚破</em>
                </td>
                <td>{{ elementLabel(hit.element) }}</td>
                <td>{{ formatDamageExact(hit.breakdown.baseDamage) }}</td>
                <td>
                  {{ hit.breakdown.defenseMultiplier.toFixed(2) }} ×
                  {{ hit.breakdown.resistanceMultiplier.toFixed(2) }} ×
                  {{ hit.breakdown.vulnerabilityMultiplier.toFixed(2) }}
                </td>
                <td>
                  <template v-if="hit.damageKind === 'superBreak'">
                    超击破 ×{{ (hit.breakdown.effectiveSuperBreakModifier ?? 1).toFixed(2) }}
                  </template>
                  <template v-else>
                    {{ hit.breakdown.damageBoostMultiplier.toFixed(2) }} ×
                    {{
                      hit.damageKind === "direct" || hit.damageKind === "additional"
                        ? hit.breakdown.critMultiplier.toFixed(2)
                        : "1.00"
                    }}
                  </template>
                </td>
                <td class="combat-sim-hit-val">{{ formatDamageExact(hit.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </li>
    </ol>
  </div>
</template>
