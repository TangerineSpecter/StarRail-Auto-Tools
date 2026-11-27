<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import { characterDisplayName, resolveCharacterCatalogue } from "@/shared/catalogue";
import LoadingState from "@/shared/ui/LoadingState.vue";
import { formatDamageCompact } from "@/shared/utils/combat";
import type { Team, TeamMember } from "@/types";
import type { CharacterBuildScore } from "@/types";
import { formatScorePct } from "./team-member-score";
import { filledSlotCount, gradeClass, memberInitial } from "./team-utils";
import type { TeamCombatCardSummary } from "./useTeamArchive";

const props = defineProps<{
  team: Team;
  memberScores?: Map<number, CharacterBuildScore>;
  /** When false, owned members without a score show a loading hint instead of「未装备遗器」. */
  scoresReady?: boolean;
  combatSummary?: TeamCombatCardSummary | null;
  combatReady?: boolean;
}>();
const emit = defineEmits<{
  actionAxis: [];
  combatSim: [];
  edit: [];
  delete: [];
}>();
const combatBarColors = ["#2563eb", "#0891b2", "#d97706", "#7c3aed"];

const avatarColors = ["#1ea2e8", "#e84a4a", "#8740e5", "#33b061", "#f0a21d", "#e0427f"];

function avatarColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function memberAvatar(member: TeamMember) {
  return (
    resolveCharacterCatalogue({
      characterId: member.characterId,
      name: member.name,
      path: member.path,
    })?.image ?? undefined
  );
}

function memberLabel(member: TeamMember) {
  return characterDisplayName({
    characterId: member.characterId,
    name: member.name,
    path: member.path,
  });
}

const slots = computed(() =>
  props.team.members.map((member, index) => {
    const score =
      member && member.owned
        ? (props.memberScores?.get(member.characterId) ?? member.score ?? null)
        : null;
    return {
      index,
      member,
      score,
      label: member ? memberLabel(member) : "",
      avatar: member ? memberAvatar(member) : undefined,
    };
  }),
);

const filledCount = computed(() => filledSlotCount(props.team));
const isFull = computed(() => filledCount.value === 4);

/** Calculate team top grade if available */
const teamTopGrade = computed(() => {
  const validScores = slots.value.map((s) => s.score?.letterGrade).filter((g): g is string => !!g);
  if (!validScores.length) return null;
  if (validScores.includes("SS")) return "SS";
  if (validScores.some((g) => g.startsWith("S"))) return "S";
  if (validScores.some((g) => g.startsWith("A"))) return "A";
  return null;
});
</script>

<template>
  <article class="team-card">
    <header class="team-card-header">
      <div class="team-card-header-main">
        <div class="team-card-title-group">
          <span class="team-card-accent-pill" />
          <h3 :title="team.name">{{ team.name }}</h3>
          <span v-if="teamTopGrade" :class="['team-top-badge', gradeClass(teamTopGrade)]">
            {{ teamTopGrade }}级配置
          </span>
        </div>
        <div class="team-card-header-right">
          <span :class="['team-card-count', { 'is-full': isFull }]" title="已配置角色数">
            <span class="count-dot" />
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {{ filledCount }}/4
          </span>
          <Button
            type="button"
            class="team-card-icon-btn combat-btn"
            title="战斗模拟与伤害预期"
            aria-label="战斗模拟与伤害预期"
            text
            rounded
            @click="emit('combatSim')"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </Button>
          <Button
            type="button"
            class="team-card-icon-btn axis-btn"
            title="查看行动轴"
            aria-label="查看行动轴"
            text
            rounded
            @click="emit('actionAxis')"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M3 6h5M3 12h9M3 18h14" />
              <circle cx="11" cy="6" r="2" />
              <circle cx="15" cy="12" r="2" />
              <circle cx="20" cy="18" r="2" />
            </svg>
          </Button>
          <Button
            type="button"
            class="team-card-icon-btn edit-btn"
            title="编辑"
            aria-label="编辑配队"
            text
            rounded
            @click="emit('edit')"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </Button>
          <Button
            type="button"
            class="team-card-icon-btn delete-btn"
            title="删除"
            aria-label="删除配队"
            text
            rounded
            @click="emit('delete')"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path
                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </Button>
        </div>
      </div>
      <p v-if="team.note" class="team-card-note">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span>{{ team.note }}</span>
      </p>
      <p v-else class="team-card-note is-empty">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        </svg>
        <span>暂无备注</span>
      </p>
    </header>

    <div class="team-slot-row" aria-label="配队成员">
      <template v-for="slot in slots" :key="`${team.teamId}-${slot.index}`">
        <div v-if="slot.member" :class="['team-slot', { orphan: !slot.member.owned }]">
          <div class="team-slot-avatar-wrap">
            <img v-if="slot.avatar" class="team-slot-avatar" :src="slot.avatar" :alt="slot.label" />
            <div
              v-else
              class="team-slot-avatar-fallback"
              :style="{ background: avatarColor(slot.member.name) }"
            >
              {{ memberInitial(slot.member) }}
            </div>
            <span
              v-if="slot.score"
              :class="[
                'team-score-badge',
                'avatar-corner-badge',
                gradeClass(slot.score.letterGrade),
              ]"
              :title="`评级 ${slot.score.letterGrade}`"
            >
              {{ slot.score.letterGrade }}
            </span>
          </div>
          <div class="team-slot-meta">
            <div class="team-slot-name-row">
              <strong :title="slot.label">{{ slot.label }}</strong>
              <span v-if="slot.member.owned" class="team-slot-level"
                >Lv.{{ slot.member.level }}</span
              >
            </div>
            <small v-if="!slot.member.owned" class="team-slot-orphan">已不在档案</small>

            <div v-if="slot.score" class="team-slot-score-section">
              <div class="team-slot-bars">
                <div
                  class="team-progress-item"
                  :title="`潜力 ${formatScorePct(slot.score.potentialPct)}`"
                >
                  <div class="team-progress-label">
                    <span>潜力</span>
                    <strong>{{ formatScorePct(slot.score.potentialPct) }}</strong>
                  </div>
                  <div class="team-progress-track">
                    <div
                      class="team-progress-fill potential"
                      :style="{
                        width: `${Math.min(100, Math.max(0, slot.score.potentialPct || 0))}%`,
                      }"
                    />
                  </div>
                </div>
                <div
                  class="team-progress-item"
                  :title="`完成度 ${formatScorePct(slot.score.completionPct)}`"
                >
                  <div class="team-progress-label">
                    <span>完成</span>
                    <strong>{{ formatScorePct(slot.score.completionPct) }}</strong>
                  </div>
                  <div class="team-progress-track">
                    <div
                      class="team-progress-fill completion"
                      :style="{
                        width: `${Math.min(100, Math.max(0, slot.score.completionPct || 0))}%`,
                      }"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div
              v-else-if="slot.member.owned && scoresReady === false"
              class="team-slot-score-empty"
            >
              <LoadingState variant="inline" label="评分加载中…" compact />
            </div>
            <small v-else-if="slot.member.owned" class="team-slot-score-empty">未装备遗器</small>
          </div>
        </div>

        <div v-else :class="['team-slot', 'empty']">
          <div class="team-slot-empty-icon">+</div>
          <span class="team-slot-empty-label">空位</span>
        </div>
      </template>
    </div>

    <div v-if="combatSummary?.summary" class="team-card-combat-bar" aria-label="配队预期伤害概览">
      <div class="team-combat-numbers">
        <div class="team-combat-kpi is-combo">
          <span>打完一整套预期</span>
          <strong>{{ formatDamageCompact(combatSummary.summary.comboDamage) }}</strong>
        </div>
        <div class="team-combat-kpi">
          <span>5轮预期均值</span>
          <strong>{{ formatDamageCompact(combatSummary.summary.meanDamage) }}</strong>
          <small>
            ({{ formatDamageCompact(combatSummary.summary.p10Damage) }}~{{
              formatDamageCompact(combatSummary.summary.p90Damage)
            }})
          </small>
        </div>
      </div>

      <div class="team-combat-shares">
        <div class="team-combat-share-bar" aria-label="成员输出占比">
          <i
            v-for="(item, idx) in combatSummary.summary.contributionsMean"
            :key="item.characterId"
            :style="{
              width: `${Math.max(4, item.share * 100)}%`,
              background: combatBarColors[idx % combatBarColors.length],
            }"
            :title="`${item.name} ${(item.share * 100).toFixed(1)}%`"
          />
        </div>
        <div class="team-combat-share-labels">
          <span
            v-for="(item, idx) in combatSummary.summary.contributionsMean"
            :key="item.characterId"
          >
            <i :style="{ background: combatBarColors[idx % combatBarColors.length] }" />
            {{ item.name }} <b>{{ (item.share * 100).toFixed(0) }}%</b>
          </span>
        </div>
      </div>

      <button type="button" class="team-combat-open-btn" @click="emit('combatSim')">
        1/3/5/10 轮模拟 ▸
      </button>
    </div>
    <div v-else-if="filledCount > 0 && combatReady === false" class="team-card-combat-loading">
      <LoadingState variant="inline" label="正在估算配队预期伤害…" compact />
    </div>
  </article>
</template>
