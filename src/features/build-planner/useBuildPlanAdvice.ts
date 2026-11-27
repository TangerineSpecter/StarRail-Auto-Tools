import { computed, onScopeDispose, reactive, ref, watch, type Ref } from "vue";
import { advisorApi } from "@/shared/api/advisor";
import { characterById } from "@/shared/catalogue";
import type { AdvicePlanDraft, CharacterBuildAdvice, CharacterBuildPlan } from "@/types";
import {
  applyAdviceField,
  buildAdviceCompareRows,
  clonePlan,
  defaultAdviceSelections,
  sanitizeAdvicePlan,
  type AdviceChoice,
  type AdviceCompareRow,
} from "./plan-advice";

export function useBuildPlanAdvice(options: {
  characterId: Ref<number>;
  planLoading: Ref<boolean>;
  plan: CharacterBuildPlan;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}) {
  const loading = ref(false);
  const error = ref("");
  const advice = ref<CharacterBuildAdvice | null>(null);
  const baseline = ref<CharacterBuildPlan | null>(null);
  const selections = reactive<Record<string, AdviceChoice>>({});
  let requestId = 0;

  const recommended = computed<AdvicePlanDraft | null>(() => {
    if (!advice.value) return null;
    const catalogue = characterById.get(options.characterId.value);
    return sanitizeAdvicePlan(advice.value.plan, {
      name: catalogue?.name,
      path: catalogue?.path,
    });
  });
  const rows = computed<AdviceCompareRow[]>(() => {
    if (!recommended.value || !baseline.value) return [];
    return buildAdviceCompareRows(baseline.value, recommended.value);
  });
  const pendingCount = computed(() => rows.value.filter((row) => !row.equal).length);

  function clearSelections() {
    for (const key of Object.keys(selections)) delete selections[key];
  }

  watch(
    options.characterId,
    () => {
      requestId += 1;
      advice.value = null;
      baseline.value = null;
      error.value = "";
      loading.value = false;
      clearSelections();
    },
    { flush: "sync" },
  );

  watch(
    [options.characterId, options.planLoading],
    async ([characterId, planLoading]) => {
      if (!characterId || planLoading) return;
      const currentRequestId = requestId;
      const cached = await advisorApi.cachedCharacterAdvice(characterId).catch(() => null);
      if (cached?.characterId !== characterId || currentRequestId !== requestId) return;
      baseline.value = clonePlan(options.plan);
      advice.value = cached;
      clearSelections();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    requestId += 1;
  });

  watch(
    rows,
    (next) => {
      const fresh = defaultAdviceSelections(next);
      for (const key of Object.keys(selections)) {
        if (!(key in fresh)) delete selections[key];
      }
      for (const [key, value] of Object.entries(fresh)) {
        if (selections[key] == null) selections[key] = value;
      }
    },
    { immediate: true },
  );

  async function query() {
    if (options.planLoading.value || loading.value) return;
    const currentRequestId = ++requestId;
    const characterId = options.characterId.value;
    loading.value = true;
    error.value = "";
    try {
      const catalogue = characterById.get(characterId);
      const snapshot = clonePlan(options.plan);
      const result = await advisorApi.adviseCharacter({
        characterId,
        slug: catalogue?.slug ?? "",
        element: catalogue?.element ?? "",
        currentPlan: snapshot,
      });
      if (currentRequestId !== requestId) return;
      baseline.value = snapshot;
      advice.value = result;
      clearSelections();
    } catch (cause) {
      if (currentRequestId !== requestId) return;
      error.value = String(cause);
      options.setError(String(cause));
    } finally {
      if (currentRequestId === requestId) loading.value = false;
    }
  }

  function writeField(key: string, choice: AdviceChoice) {
    if (!recommended.value || !baseline.value) return;
    selections[key] = choice;
    applyAdviceField(options.plan, choice === "ai" ? recommended.value : baseline.value, key);
  }

  function choose(key: string, choice: AdviceChoice) {
    writeField(key, choice);
  }

  function applySelected() {
    if (!recommended.value || !baseline.value) return;
    let appliedCount = 0;
    for (const row of rows.value) {
      if (row.equal) continue;
      writeField(row.key, "ai");
      appliedCount += 1;
    }
    options.setNotice(
      appliedCount > 0
        ? `已将 ${appliedCount} 项推荐写入表单，确认后请保存。`
        : "没有需要写入的推荐。",
    );
  }

  return {
    loading,
    error,
    advice,
    selections,
    rows,
    pendingCount,
    query,
    choose,
    applySelected,
  };
}
