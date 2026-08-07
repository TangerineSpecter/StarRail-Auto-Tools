<script setup lang="ts">
import Button from "primevue/button";
import { characterDisplayName, pathIconSrc, resolveCharacterCatalogue } from "@/shared/catalogue";
import { pathLabel } from "@/shared/catalogue/relic-options";
import type { Team, TeamMember } from "@/types";
import { filledSlotCount, memberInitial } from "./team-utils";

defineProps<{ team: Team }>();
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
        v-for="(member, index) in team.members"
        :key="`${team.teamId}-${index}`"
        :class="['team-slot', { empty: !member, orphan: member && !member.owned }]"
      >
        <template v-if="member">
          <img
            v-if="memberAvatar(member)"
            class="team-slot-avatar"
            :src="memberAvatar(member)"
            :alt="memberLabel(member)"
          />
          <div
            v-else
            class="team-slot-avatar-fallback"
            :style="{ background: avatarColor(member.name) }"
          >
            {{ memberInitial(member) }}
          </div>
          <div class="team-slot-meta">
            <strong>{{ memberLabel(member) }}</strong>
            <small v-if="member.owned">
              <img
                v-if="member.path"
                class="team-slot-path"
                :src="pathIconSrc(member.path)"
                :alt="pathLabel(member.path)"
              />
              Lv.{{ member.level }}
            </small>
            <small v-else class="team-slot-orphan">已不在档案</small>
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
