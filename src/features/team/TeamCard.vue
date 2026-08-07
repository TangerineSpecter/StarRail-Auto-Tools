<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import { characterDisplayName, pathIconSrc, resolveCharacterCatalogue } from "@/shared/catalogue";
import { pathLabel } from "@/shared/catalogue/relic-options";
import type { Team, TeamMember } from "@/types";
import type { CharacterBuildScore } from "@/types";
import { formatScorePct } from "./team-member-score";
import { filledSlotCount, memberInitial } from "./team-utils";

const props = defineProps<{
  team: Team;
  memberScores?: Map<number, CharacterBuildScore>;
  /** When false, owned members without a score show a loading hint instead of「未装备遗器」. */
  scoresReady?: boolean;
}>();
const emit = defineEmits<{
  edit: [];
  delete: [];
}>();

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
</script>

<template>
  <article class="team-card">
    <header class="team-card-header">
      <div class="team-card-title">
        <h3>{{ team.name }}</h3>
        <span class="team-card-count">{{ filledSlotCount(team) }}/4</span>
      </div>
      <p v-if="team.note" class="team-card-note">{{ team.note }}</p>
      <p v-else class="team-card-note is-empty">暂无备注</p>
    </header>
    <div class="team-slot-row" aria-label="配队成员">
      <div
        v-for="slot in slots"
        :key="`${team.teamId}-${slot.index}`"
        :class="['team-slot', { empty: !slot.member, orphan: slot.member && !slot.member.owned }]"
      >
        <template v-if="slot.member">
          <img v-if="slot.avatar" class="team-slot-avatar" :src="slot.avatar" :alt="slot.label" />
          <div
            v-else
            class="team-slot-avatar-fallback"
            :style="{ background: avatarColor(slot.member.name) }"
          >
            {{ memberInitial(slot.member) }}
          </div>
          <div class="team-slot-meta">
            <strong>{{ slot.label }}</strong>
            <small v-if="slot.member.owned">
              <img
                v-if="slot.member.path"
                class="team-slot-path"
                :src="pathIconSrc(slot.member.path)"
                :alt="pathLabel(slot.member.path)"
              />
              Lv.{{ slot.member.level }}
            </small>
            <small v-else class="team-slot-orphan">已不在档案</small>
            <div v-if="slot.score" class="team-slot-scores">
              <span class="team-score-grade" :title="`评级 ${slot.score.letterGrade}`">
                <em>评级</em>{{ slot.score.letterGrade }}
              </span>
              <span
                class="team-score-potential"
                :title="`潜力 ${formatScorePct(slot.score.potentialPct)}`"
              >
                <em>潜力</em>{{ formatScorePct(slot.score.potentialPct) }}
              </span>
              <span
                class="team-score-completion"
                :title="`综合完成 ${formatScorePct(slot.score.completionPct)}`"
              >
                <em>完成</em>{{ formatScorePct(slot.score.completionPct) }}
              </span>
            </div>
            <small v-else-if="slot.member.owned" class="team-slot-score-empty">
              {{ scoresReady === false ? "评分加载中…" : "未装备遗器" }}
            </small>
          </div>
        </template>
        <template v-else>
          <div class="team-slot-empty">空位</div>
        </template>
      </div>
    </div>
    <footer class="team-card-actions">
      <Button class="row-action" type="button" text @click="emit('edit')">编辑</Button>
      <Button class="row-action team-delete-action" type="button" text @click="emit('delete')"
        >删除</Button
      >
    </footer>
  </article>
</template>
