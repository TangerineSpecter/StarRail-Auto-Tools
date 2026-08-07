<script setup lang="ts">
import { ref } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import type { Team } from "@/types";
import TeamCard from "./TeamCard.vue";
import TeamEditorDrawer from "./TeamEditorDrawer.vue";
import { useTeamArchive } from "./useTeamArchive";

const { busy, error, notice, inventoryRevision } = useRuntimeContext();
const archive = useTeamArchive({
  busy,
  revision: inventoryRevision,
  setError: (message) => (error.value = message),
  setNotice: (message) => (notice.value = message),
});

const editing = ref<Team | null | "new">(null);

function openCreate() {
  editing.value = "new";
}

function openEdit(team: Team) {
  editing.value = team;
}

async function onDelete(team: Team) {
  if (!window.confirm(`确定删除配队「${team.name}」？此操作不可撤销。`)) return;
  await archive.deleteTeam(team.teamId);
}

async function onSave(input: Parameters<typeof archive.saveTeam>[0]) {
  const ok = await archive.saveTeam(input);
  if (ok) editing.value = null;
}
</script>

<template>
  <article class="panel archive-main team-workspace">
    <header class="archive-heading">
      <div>
        <p class="eyebrow">TEAM ROSTER</p>
        <h2>配队档案</h2>
      </div>
      <div class="archive-actions" style="align-items: center">
        <label class="quick-search">
          <span class="visually-hidden">关键词</span>
          <svg viewBox="0 0 1024 1024" aria-hidden="true">
            <path
              d="M909.6 854.5 649.9 594.8C690.2 542.7 712 479 712 412c0-165.7-134.3-300-300-300S112 246.3 112 412s134.3 300 300 300c67 0 130.6-21.8 182.7-62l259.7 259.6a40.2 40.2 0 0 0 56.9 0 40.2 40.2 0 0 0-1.7-55.1ZM412 640c-125.9 0-228-102.1-228-228s102.1-228 228-228 228 102.1 228 228-102.1 228-228 228Z"
              fill="currentColor"
            />
          </svg>
          <InputText
            v-model="archive.search.value"
            placeholder="搜索配队名称或备注"
            @keyup.enter="archive.applySearch"
          />
        </label>
        <Button
          v-if="archive.search.value.trim()"
          class="clear-filter"
          type="button"
          text
          @click="archive.resetSearch"
          >清空</Button
        >
        <span class="toolbar-spacer" />
        <Button class="capture-action-btn team-create-btn" type="button" :disabled="busy" @click="openCreate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建配队
        </Button>
        <span class="result-count">{{ archive.result.value.total }} 支配队</span>
      </div>
    </header>

    <div class="team-card-grid" @scroll="archive.onScroll">
      <TeamCard
        v-for="team in archive.result.value.items"
        :key="team.teamId"
        :team="team"
        :member-scores="archive.memberScores.value"
        :scores-ready="archive.scoresReady.value"
        @edit="openEdit(team)"
        @delete="onDelete(team)"
      />
      <div v-if="!archive.result.value.items.length" class="team-empty">
        <div class="team-empty-symbol">◇</div>
        <strong>{{ busy ? "正在读取配队…" : "还没有配队" }}</strong>
        <small>新建一支配队，从已拥有角色中安排 4 人阵容</small>
        <Button v-if="!busy" class="capture-action-btn team-create-btn" type="button" @click="openCreate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建配队
        </Button>
      </div>
      <div v-if="archive.appending.value" class="team-appending">加载更多…</div>
    </div>
  </article>

  <TeamEditorDrawer
    v-if="editing !== null"
    :team="editing === 'new' ? null : editing"
    :busy="busy"
    :member-scores="archive.memberScores.value"
    @close="editing = null"
    @save="onSave"
    @error="error = $event"
  />
</template>
