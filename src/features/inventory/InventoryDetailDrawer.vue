<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import CharacterDetail from "./CharacterDetail.vue";
import LightConeDetail from "./LightConeDetail.vue";
import RelicDetail from "./RelicDetail.vue";
import { buildPlanApi } from "@/shared/api/build-plan";
import type { CharacterBuildPlan, InventoryDetail } from "@/types";
import type { CharacterDetailData, LightConeDetailData, RelicDetailData } from "./detail-types";

const props = defineProps<{ detail: InventoryDetail | null; loading: boolean }>();
const emit = defineEmits<{ close: [] }>();
const asRelic = () => props.detail?.data as unknown as RelicDetailData;
const asCharacter = () => props.detail?.data as unknown as CharacterDetailData;
const asLightCone = () => props.detail?.data as unknown as LightConeDetailData;

const plan = ref<CharacterBuildPlan | null>(null);
const planLabel = ref("");
/** Ignore stale plan responses when the user switches details quickly. */
let planRequestId = 0;

const characterIdForPlan = computed(() => {
  if (!props.detail) return null;
  if (props.detail.kind === "character") {
    return (props.detail.data as unknown as CharacterDetailData).characterId ?? null;
  }
  if (props.detail.kind === "relic") {
    const relic = props.detail.data as unknown as RelicDetailData;
    return relic.equippedCharacterId ?? null;
  }
  return null;
});

async function loadPlan(characterId: number | null) {
  const requestId = ++planRequestId;
  plan.value = null;
  planLabel.value = "";
  if (!characterId) return;
  try {
    const next = await buildPlanApi.get(characterId);
    if (requestId !== planRequestId) return;
    plan.value = next;
    if (next) {
      if (props.detail?.kind === "character") {
        planLabel.value = (props.detail.data as unknown as CharacterDetailData).name;
      } else {
        planLabel.value = `角色 #${characterId}`;
      }
    }
  } catch {
    if (requestId !== planRequestId) return;
    plan.value = null;
  }
}

watch(
  () => [props.detail?.kind, characterIdForPlan.value, props.loading] as const,
  ([, characterId, loading]) => {
    if (loading) return;
    void loadPlan(characterId ?? null);
  },
  { immediate: true },
);

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === "Escape" && !event.isComposing) emit("close");
}
onMounted(() => window.addEventListener("keydown", closeOnEscape));
onUnmounted(() => window.removeEventListener("keydown", closeOnEscape));
</script>
<template>
  <div class="detail-backdrop" @click.self="emit('close')">
    <aside
      :class="[
        'detail-drawer',
        {
          'relic-detail-drawer': detail?.kind === 'relic',
          'character-detail-drawer': detail?.kind === 'character',
          'lightcone-detail-drawer': detail?.kind === 'lightCone',
        },
      ]"
    >
      <header v-if="detail?.kind !== 'character'">
        <div>
          <p class="eyebrow">
            {{ detail?.kind === "relic" ? "RELIC ANALYSIS" : "LIGHT CONE DATA" }}
          </p>
          <h2>
            {{ detail?.kind === "relic" ? "遗器档案详情" : "光锥档案详情" }}
          </h2>
        </div>
        <button type="button" aria-label="关闭详情" @click="emit('close')">×</button>
      </header>
      <div class="detail-drawer-content">
        <div v-if="loading" class="detail-loading">正在读取 SQLite 记录…</div>
        <RelicDetail
          v-else-if="detail?.kind === 'relic'"
          :detail="asRelic()"
          :plan="plan"
          :plan-label="planLabel"
        />
        <CharacterDetail
          v-else-if="detail?.kind === 'character'"
          :detail="asCharacter()"
          :plan="plan"
        />
        <LightConeDetail v-else-if="detail?.kind === 'lightCone'" :detail="asLightCone()" />
        <pre v-else>{{ JSON.stringify(detail?.data, null, 2) }}</pre>
      </div>
    </aside>
  </div>
</template>
