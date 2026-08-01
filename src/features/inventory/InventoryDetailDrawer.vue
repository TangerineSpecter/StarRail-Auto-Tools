<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import CharacterDetail from "./CharacterDetail.vue";
import LightConeDetail from "./LightConeDetail.vue";
import RelicDetail from "./RelicDetail.vue";
import type { InventoryDetail } from "@/types";
import type { CharacterDetailData, LightConeDetailData, RelicDetailData } from "./detail-types";

const props = defineProps<{ detail: InventoryDetail | null; loading: boolean }>();
const emit = defineEmits<{ close: [] }>();
const asRelic = () => props.detail?.data as unknown as RelicDetailData;
const asCharacter = () => props.detail?.data as unknown as CharacterDetailData;
const asLightCone = () => props.detail?.data as unknown as LightConeDetailData;

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
      <header>
        <div>
          <p class="eyebrow">
            {{
              detail?.kind === "relic"
                ? "RELIC ANALYSIS"
                : detail?.kind === "character"
                  ? "CHARACTER DOSSIER"
                  : "LIGHT CONE DATA"
            }}
          </p>
          <h2>
            {{
              detail?.kind === "relic"
                ? "遗器档案详情"
                : detail?.kind === "character"
                  ? "角色档案详情"
                  : "光锥档案详情"
            }}
          </h2>
        </div>
        <button type="button" aria-label="关闭详情" @click="emit('close')">×</button>
      </header>
      <div class="detail-drawer-content">
        <div v-if="loading" class="detail-loading">正在读取 SQLite 记录…</div>
        <RelicDetail v-else-if="detail?.kind === 'relic'" :detail="asRelic()" /><CharacterDetail
          v-else-if="detail?.kind === 'character'"
          :detail="asCharacter()"
        /><LightConeDetail v-else-if="detail?.kind === 'lightCone'" :detail="asLightCone()" />
        <pre v-else>{{ JSON.stringify(detail?.data, null, 2) }}</pre>
      </div>
    </aside>
  </div>
</template>
