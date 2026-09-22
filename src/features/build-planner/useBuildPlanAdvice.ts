import { computed, reactive, ref, watch, type Ref } from "vue";
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

  watch(
    () => options.characterId.value,
    () => {
      requestId += 1;
      advice.value = null;
      baseline.value = null;
      error.value = "";
      loading.value = false;
      for (const key of Object.keys(selections)) delete selections[key];
    },
  );

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
    if (options.planLoading.value) return;
    const currentRequestId = ++requestId;
    loading.value = true;
    error.value = "";
    try {
      const catalogue = characterById.get(options.characterId.value);
      const snapshot = clonePlan(options.plan);
      const result = await advisorApi.adviseCharacter({
        characterId: options.characterId.value,
        slug: catalogue?.slug ?? "",
        element: catalogue?.element ?? "",
        currentPlan: snapshot,
      });
      if (currentRequestId !== requestId) return;
      result.plan = sanitizeAdvicePlan(result.plan, {
        name: catalogue?.name,
        path: catalogue?.path,
      });
      baseline.value = snapshot;
      advice.value = result;
      for (const key of Object.keys(selections)) delete selections[key];
    } catch (cause) {
      if (currentRequestId !== requestId) return;
      advice.value = null;
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
