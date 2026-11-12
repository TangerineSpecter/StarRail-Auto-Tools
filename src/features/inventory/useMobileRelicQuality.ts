import { computed, onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { buildPlanApi } from "@/shared/api/build-plan";
import type { BuildDashboardEntry, RelicListItem } from "@/types";
import { createRelicQualityFilter, filterRelicQuality } from "./relic-quality-filter";

export function useMobileRelicQuality(
  items: Ref<RelicListItem[]>,
  setError: (error: string) => void,
) {
  const plans = ref<BuildDashboardEntry[]>([]);
  const draft = ref(createRelicQualityFilter());
  const applied = ref(createRelicQualityFilter());
  let disposed = false;
  const draftPlan = computed(
    () =>
      plans.value.find((entry) => entry.character.characterId === draft.value.characterId)?.plan ??
      null,
  );
  const activePlan = computed(
    () =>
      plans.value.find((entry) => entry.character.characterId === applied.value.characterId)
        ?.plan ?? null,
  );
  const displayItems = computed(() =>
    filterRelicQuality(items.value, applied.value, activePlan.value),
  );
  const activeCount = computed(
    () =>
      [
        applied.value.characterId !== null,
        applied.value.sortMode !== "default",
        Boolean(applied.value.minGrade),
      ].filter(Boolean).length,
  );
  function begin() {
    draft.value = { ...applied.value };
  }
  function apply() {
    applied.value = { ...draft.value };
  }
  function resetDraft() {
    draft.value = createRelicQualityFilter();
  }
  function reset() {
    resetDraft();
    apply();
  }
  onMounted(async () => {
    try {
      const result = await buildPlanApi.dashboard();
      if (!disposed) plans.value = result;
    } catch (error) {
      if (!disposed) setError(String(error));
    }
  });
  onBeforeUnmount(() => {
    disposed = true;
  });
  const preview = (rows: RelicListItem[]) =>
    filterRelicQuality(rows, applied.value, activePlan.value);
  return {
    plans,
    draft,
    draftPlan,
    displayItems,
    activeCount,
    begin,
    apply,
    resetDraft,
    reset,
    preview,
  };
}
