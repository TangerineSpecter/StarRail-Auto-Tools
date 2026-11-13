<script setup lang="ts">
import { useReadOnlyView } from "@/shared/contracts/view-mode";
import { useMobileView } from "@/shared/contracts/mobile-view";
import { useHorizontalSwipe } from "@/shared/ui/useHorizontalSwipe";
import { useSheetDragDismiss } from "@/shared/ui/useSheetDragDismiss";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import CharacterDetail from "./CharacterDetail.vue";
import LightConeDetail from "./LightConeDetail.vue";
import RelicDetail from "./RelicDetail.vue";
import { buildPlanApi } from "@/shared/api/build-plan";
import type { CharacterBuildPlan, InventoryDetail } from "@/types";
import type { CharacterDetailData, LightConeDetailData, RelicDetailData } from "./detail-types";

const readOnly = useReadOnlyView();
const mobile = useMobileView();
const props = defineProps<{ detail: InventoryDetail | null; loading: boolean; inline?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
const dragActive = ref(false);
const closing = ref(false);
const dragOffset = ref(0);
const dragDuration = ref(0);
let motionTimer: ReturnType<typeof setTimeout> | undefined;

function clearMotionTimer() {
  if (motionTimer !== undefined) {
    clearTimeout(motionTimer);
    motionTimer = undefined;
  }
}

function getPanelWidth() {
  return Math.max(240, panel.value?.clientWidth ?? window.innerWidth);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const drawerMotionActive = computed(
  () => mobile && !props.inline && (dragActive.value || closing.value || dragOffset.value > 0),
);

const backdropStyle = computed(() => {
  if (!drawerMotionActive.value) return undefined;
  const factor = 1 - Math.max(0, Math.min(1, dragOffset.value / getPanelWidth()));
  const duration = dragDuration.value;
  return {
    backgroundColor: `rgba(23, 38, 67, ${(0.22 * factor).toFixed(3)})`,
    backdropFilter: `blur(${(3 * factor).toFixed(2)}px)`,
    WebkitBackdropFilter: `blur(${(3 * factor).toFixed(2)}px)`,
    pointerEvents: closing.value ? ("none" as const) : undefined,
    transition:
      duration > 0
        ? `background-color ${duration}ms cubic-bezier(0.16, 1, 0.3, 1), backdrop-filter ${duration}ms cubic-bezier(0.16, 1, 0.3, 1), -webkit-backdrop-filter ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`
        : "none",
  };
});

const panelStyle = computed(() => {
  if (!drawerMotionActive.value) return undefined;
  const duration = dragDuration.value;
  return {
    animation: "none",
    transform: `translate3d(${dragOffset.value}px, 0, 0)`,
    transition: duration > 0 ? `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)` : "none",
    willChange: "transform",
  };
});

async function animateDismiss(fromDrag = false) {
  if (closing.value) return;
  if (!mobile || props.inline || prefersReducedMotion()) {
    emit("close");
    return;
  }
  clearMotionTimer();
  closing.value = true;
  dragActive.value = false;
  if (!fromDrag) {
    dragDuration.value = 0;
    dragOffset.value = 0;
    await nextTick();
  }
  void panel.value?.offsetWidth;
  const duration = 220;
  dragDuration.value = duration;
  dragOffset.value = getPanelWidth() + 16;
  motionTimer = setTimeout(() => {
    motionTimer = undefined;
    emit("close");
  }, duration + 20);
}

function animateSnapBack() {
  clearMotionTimer();
  dragActive.value = false;
  if (dragOffset.value <= 0) {
    dragOffset.value = 0;
    dragDuration.value = 0;
    return;
  }
  const duration = prefersReducedMotion() ? 0 : 220;
  void panel.value?.offsetWidth;
  dragDuration.value = duration;
  dragOffset.value = 0;
  motionTimer = setTimeout(() => {
    motionTimer = undefined;
    dragDuration.value = 0;
  }, duration + 20);
}

function requestClose() {
  if (props.inline && document.querySelector('[aria-modal="true"]')) return;
  void animateDismiss(false);
}

const sheetDrag = useSheetDragDismiss(() => {
  requestClose();
});

watch(
  () => props.detail,
  (next) => {
    if (!next) sheetDrag.reset();
  },
);

useHorizontalSwipe({
  surface: panel,
  enabled: computed(() => mobile && !closing.value),
  allowScreenEdge: true,
  onDrag(distance) {
    if (props.inline || closing.value) return;
    clearMotionTimer();
    dragActive.value = true;
    dragDuration.value = 0;
    dragOffset.value = Math.max(0, distance);
  },
  onRelease(distance, velocity) {
    if (closing.value) return;
    if (props.inline) {
      if (document.querySelector('[aria-modal="true"]')) return;
      if (distance >= 48 || (distance >= 24 && velocity > 0.45)) {
        emit("close");
      }
      return;
    }
    const width = getPanelWidth();
    const shouldDismiss =
      distance > 0 && (distance >= width * 0.28 || (distance >= 24 && velocity > 0.45));
    if (shouldDismiss) {
      void animateDismiss(true);
    } else {
      animateSnapBack();
    }
  },
  onCancel() {
    if (!props.inline && !closing.value) animateSnapBack();
  },
});
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
  if (props.inline && document.querySelector('[aria-modal="true"]')) return;
  if (event.key === "Escape" && !event.isComposing) requestClose();
}
onMounted(() => window.addEventListener("keydown", closeOnEscape));
onUnmounted(() => {
  clearMotionTimer();
  window.removeEventListener("keydown", closeOnEscape);
});
</script>
<template>
  <div
    :class="[
      'detail-backdrop',
      {
        'inventory-detail-inline': inline,
        'mobile-detail-sheet-backdrop': mobile && !inline,
      },
    ]"
    :style="backdropStyle"
    @click.self="!inline && requestClose()"
  >
    <aside
      ref="panel"
      :class="[
        'detail-drawer',
        {
          'mobile-detail-sheet': mobile && !inline,
          'relic-detail-drawer': detail?.kind === 'relic',
          'character-detail-drawer': detail?.kind === 'character',
          'lightcone-detail-drawer': detail?.kind === 'lightCone',
        },
      ]"
      :style="panelStyle"
      :role="inline ? 'region' : 'dialog'"
      :aria-modal="inline ? undefined : true"
      aria-label="档案详情"
    >
      <header
        v-if="(mobile && !inline) || readOnly || detail?.kind !== 'character'"
        v-on="mobile && !inline ? sheetDrag.handlers : {}"
      >
        <div>
          <p class="eyebrow">
            {{
              detail?.kind === "character"
                ? "CHARACTER DATA"
                : detail?.kind === "relic"
                  ? "RELIC ANALYSIS"
                  : "LIGHT CONE DATA"
            }}
          </p>
          <h2>
            {{
              detail?.kind === "character"
                ? "角色档案详情"
                : detail?.kind === "relic"
                  ? "遗器档案详情"
                  : "光锥档案详情"
            }}
          </h2>
        </div>
        <button
          v-if="!mobile || inline"
          type="button"
          aria-label="关闭详情"
          @click="requestClose()"
        >
          ×
        </button>
      </header>
      <div class="detail-drawer-content">
        <div v-if="loading" class="detail-loading">正在加载详情…</div>
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
