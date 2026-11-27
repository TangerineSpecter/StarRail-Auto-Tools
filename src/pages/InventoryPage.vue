<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from "vue";
import Button from "primevue/button";
import InventorySidebar from "@/features/inventory/InventorySidebar.vue";
import InventoryToolbar from "@/features/inventory/InventoryToolbar.vue";
import InventoryFilterDrawer from "@/features/inventory/InventoryFilterDrawer.vue";
import InventoryList from "@/features/inventory/InventoryList.vue";
import InventoryDetailDrawer from "@/features/inventory/InventoryDetailDrawer.vue";
import RelicQualityToolbar from "@/features/inventory/RelicQualityToolbar.vue";
import RelicSetFilterSelect from "@/features/inventory/RelicSetFilterSelect.vue";
import BuildPlanDrawer from "@/features/build-planner/BuildPlanDrawer.vue";
import CombatSimulatorDrawer from "@/features/combat-simulator/CombatSimulatorDrawer.vue";
import { useTeamCombatLoader } from "@/features/combat-simulator/useTeamCombatLoader";
import TeamWorkspace, { type TeamCombatSimRequest } from "@/features/team/TeamWorkspace.vue";
import { useInventoryArchive } from "@/features/inventory/useInventoryArchive";
import { useInventoryDetail } from "@/features/inventory/useInventoryDetail";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import { relicCleanupApi } from "@/shared/api/relic-cleanup";
import { extractGameVersion } from "@/shared/utils/build-plan-meta";
import type { ArchiveView, InventoryKind, InventoryListItem, RelicListItem } from "@/types";

defineOptions({ name: "InventoryPage" });
const { direct, summary, busy, error, notice, inventoryRevision } = useRuntimeContext();
const feedback = {
  summary,
  direct,
  busy,
  revision: inventoryRevision,
  setError: (message: string) => (error.value = message),
  setNotice: (message: string) => (notice.value = message),
};
const archive = useInventoryArchive(feedback);
const detail = useInventoryDetail(feedback.setError);
const archiveView = ref<ArchiveView>("relic");
const buildCharacterId = ref<number | null>(null);
const teamCombat = useTeamCombatLoader();
const scoredRelicItems = ref<RelicListItem[] | null>(null);
const qualityOpen = ref(false);
const qualitySummary = ref<string[]>([]);
const isTeamView = computed(() => archiveView.value === "team");
const currentGameVersion = computed(() => extractGameVersion(summary.value.protocolVersion));
const listItems = computed<InventoryListItem[]>(() => {
  if (archive.kind.value === "relic" && scoredRelicItems.value) return scoredRelicItems.value;
  return archive.result.value.items;
});

function handleBuildPlanChanged() {
  buildCharacterId.value = null;
  if (archive.kind.value === "character") {
    archive.applyFilters();
  }
}

async function addSelectedToCleanup() {
  const ids = [...archive.selectedIds.value];
  if (!ids.length) return;
  busy.value = true;
  try {
    await relicCleanupApi.addCandidates(ids);
    archive.selectedIds.value = new Set();
    notice.value = `已将 ${ids.length} 件遗器加入清理管理`;
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
  }
}

function switchArchiveView(view: ArchiveView) {
  archiveView.value = view;
  if (view !== "team") {
    archive.switchKind(view);
  }
}

// Drop client-side score ordering when leaving the relic tab so stale pages never leak.
watch(
  () => archive.kind.value,
  (kind) => {
    if (kind !== "relic") {
      scoredRelicItems.value = null;
      qualityOpen.value = false;
      qualitySummary.value = [];
    }
  },
);

function onEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.isComposing) return;
  if (buildCharacterId.value && !detail.detail.value && !detail.loading.value)
    buildCharacterId.value = null;
}
function openTeamCombatSim(req: TeamCombatSimRequest) {
  void teamCombat.open(req.team, req.combatants, req.unavailableNotes, req.ready);
}

const removeEscapeListener = () => window.removeEventListener("keydown", onEscape);
onActivated(() => window.addEventListener("keydown", onEscape));
onDeactivated(() => {
  removeEscapeListener();
  teamCombat.close();
});
onBeforeUnmount(() => {
  removeEscapeListener();
  teamCombat.close();
});
</script>

<template>
  <section class="archive-workspace">
    <InventorySidebar
      :kind="archiveView"
      :summary="summary"
      :busy="busy"
      @update:kind="switchArchiveView"
      @export="archive.exportData"
      @import="archive.importData"
    />
    <TeamWorkspace v-if="isTeamView" @open-combat-sim="openTeamCombatSim" />
    <article v-else class="panel archive-main">
      <InventoryToolbar
        v-model:filters="archive.filters.value"
        :kind="archive.kind.value as InventoryKind"
        :total="archive.result.value.total"
        :active-filter-count="archive.activeFilterCount.value"
        :has-filters="archive.hasActiveSearchOrFilters.value"
        @search="archive.applyFilters"
        @filter="archive.filterOpen.value = true"
        @reset="archive.resetFilters"
      >
        <template #actions>
          <Button
            v-if="archive.kind.value === 'relic'"
            class="filter-toggle quality-toggle"
            :class="{ 'is-active': qualitySummary.length > 0 }"
            type="button"
            outlined
            :aria-expanded="qualityOpen"
            :title="
              qualitySummary.length
                ? `评分筛选：${qualitySummary.join(' · ')}`
                : qualityOpen
                  ? '收起评分筛选与质量标签'
                  : '展开评分筛选与质量标签'
            "
            @click="qualityOpen = !qualityOpen"
          >
            <svg
              viewBox="0 0 24 24"
              width="1em"
              height="1em"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M4 6h16M4 12h8M4 18h6" />
              <path
                d="M17.5 11.8 18.6 14.4 21.2 15.5 18.6 16.6 17.5 19.2 16.4 16.6 13.8 15.5 16.4 14.4Z"
              />
            </svg>
            <span>评分筛选</span>
            <b v-if="qualitySummary.length">{{ qualitySummary.length }}</b>
            <svg
              class="quality-toggle-chevron"
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M4 6.25 8 10.25 12 6.25" />
            </svg>
          </Button>
          <RelicSetFilterSelect
            v-if="archive.kind.value === 'relic'"
            v-model:set-ids="archive.filters.value.setIds"
            :revision="inventoryRevision"
            @change="archive.applyFilters"
          />
          <Button
            v-if="archive.kind.value === 'relic' && !qualityOpen && archive.selectedIds.value.size"
            class="toolbar-cleanup-action"
            type="button"
            :disabled="busy"
            title="已锁定或已装备的遗器不会被加入"
            @click="addSelectedToCleanup"
          >
            加入清理管理（{{ archive.selectedIds.value.size }}）
          </Button>
        </template>
      </InventoryToolbar>
      <InventoryFilterDrawer
        v-model="archive.filterOpen.value"
        v-model:filters="archive.filters.value"
        :kind="archive.kind.value as InventoryKind"
        :busy="busy"
        @apply="archive.applyFilters"
        @reset="archive.resetFilters"
      />
      <RelicQualityToolbar
        v-if="archive.kind.value === 'relic'"
        :items="archive.result.value.items as RelicListItem[]"
        :selected-count="archive.selectedIds.value.size"
        :cleanup-busy="busy"
        :open="qualityOpen"
        @update:display-items="scoredRelicItems = $event"
        @update:active-summary="qualitySummary = $event"
        @add-to-cleanup="addSelectedToCleanup"
        @notice="notice = $event"
        @error="error = $event"
      />
      <InventoryList
        :kind="archive.kind.value as InventoryKind"
        :items="listItems"
        :selected-ids="archive.selectedIds.value"
        :all-selected="archive.allSelected.value"
        :appending="archive.appending.value"
        :busy="busy"
        :current-game-version="currentGameVersion"
        @toggle-all="archive.toggleAll"
        @toggle-selected="archive.toggleSelected"
        @detail="detail.open"
        @edit-build="buildCharacterId = $event.characterId"
        @scroll="archive.onScroll"
      />
    </article>
  </section>
  <InventoryDetailDrawer
    v-if="detail.detail.value || detail.loading.value"
    :detail="detail.detail.value"
    :loading="detail.loading.value"
    @close="detail.close"
  />
  <BuildPlanDrawer
    v-if="buildCharacterId"
    :character-id="buildCharacterId"
    @close="buildCharacterId = null"
    @saved="handleBuildPlanChanged"
    @deleted="handleBuildPlanChanged"
    @error="error = $event"
    @notice="notice = $event"
  />
  <CombatSimulatorDrawer
    v-if="teamCombat.state.value"
    mode="team"
    :title="`${teamCombat.state.value.team.name} · 配队战斗模拟`"
    :combatants="teamCombat.state.value.combatants"
    :unavailable-notes="teamCombat.state.value.unavailableNotes"
    :loading="teamCombat.state.value.loading"
    :error="teamCombat.state.value.error"
    @close="teamCombat.close()"
  />
</template>
