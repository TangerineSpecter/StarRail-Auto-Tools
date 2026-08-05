import { nextTick, onBeforeUnmount, reactive, ref, watch, type Ref } from "vue";
import { buildPlanApi } from "@/shared/api/build-plan";
import { relicCatalogue } from "@/shared/catalogue";
import { relicSlots } from "@/shared/catalogue/relic-options";
import type { BuildRecommendation, CharacterBuildPlan } from "@/types";

interface BuildEditorOptions {
  characterId: Ref<number>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  onDeleted: () => void;
  onSaved?: () => void;
}
const emptyPlan = (characterId: number): CharacterBuildPlan => ({
  characterId,
  cavernMode: "fourPiece",
  cavernSetA: 0,
  cavernSetB: null,
  planarSetId: 0,
  mainStats: Object.fromEntries(relicSlots.map((slot) => [slot.value, []])),
  targets: [],
  effectiveSubstats: [],
  note: "",
  substatWeights: {},
  minPotentialPct: 40,
  spdTarget: 0,
});

async function yieldForCalculationFeedback() {
  await nextTick();
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export function useBuildPlanEditor(options: BuildEditorOptions) {
  const loading = ref(false);
  const saving = ref(false);
  const calculating = ref(false);
  const includeEquipped = ref(false);
  const deleteArmed = ref(false);
  const recommendation = ref<BuildRecommendation | null>(null);
  const draggedTargetIndex = ref<number | null>(null);
  const dragTargetIndex = ref<number | null>(null);
  const plan = reactive<CharacterBuildPlan>(emptyPlan(options.characterId.value));
  let targetDragPreview: HTMLElement | undefined;
  let targetDragCleanup: (() => void) | undefined;
  const setOptions = relicCatalogue.sets.map((set) => ({
    setId: set.id,
    name: set.name,
    kind: set.kind,
  }));
  const cavernSets = setOptions.filter((set) => set.kind === "cavern");
  const planarSets = setOptions.filter((set) => set.kind === "planar");

  function firstDifferentCavernSet(setId: number) {
    return cavernSets.find((set) => set.setId !== setId)?.setId ?? null;
  }
  function setCavernMode(mode: CharacterBuildPlan["cavernMode"]) {
    plan.cavernMode = mode;
    if (mode === "twoPlusTwo" && plan.cavernSetB === plan.cavernSetA)
      plan.cavernSetB = firstDifferentCavernSet(plan.cavernSetA);
  }
  function setCavernSetA(setId: number) {
    plan.cavernSetA = setId;
    if (plan.cavernMode === "twoPlusTwo" && plan.cavernSetB === setId)
      plan.cavernSetB = firstDifferentCavernSet(setId);
  }

  async function load(characterId: number) {
    loading.value = true;
    recommendation.value = null;
    includeEquipped.value = false;
    deleteArmed.value = false;
    try {
      Object.assign(plan, emptyPlan(characterId), (await buildPlanApi.get(characterId)) ?? {});
      if (typeof plan.note !== "string") plan.note = "";
      if (!plan.substatWeights || typeof plan.substatWeights !== "object") plan.substatWeights = {};
      if (typeof plan.minPotentialPct !== "number" || !Number.isFinite(plan.minPotentialPct))
        plan.minPotentialPct = 40;
      if (typeof plan.spdTarget !== "number" || !Number.isFinite(plan.spdTarget)) plan.spdTarget = 0;
    } catch (cause) {
      options.setError(String(cause));
    } finally {
      loading.value = false;
    }
  }
  function addTarget() {
    if (plan.targets.length < 3)
      plan.targets.push({
        statKey: "CRIT DMG",
        target: 160,
        minimum: 140,
        priority: plan.targets.length + 1,
      });
  }
  function removeTarget(index: number) {
    plan.targets.splice(index, 1);
    plan.targets.forEach((target, position) => (target.priority = position + 1));
  }
  function moveTargetTo(index: number, next: number) {
    if (index === next || next < 0 || next >= plan.targets.length) return;
    const [target] = plan.targets.splice(index, 1);
    plan.targets.splice(next, 0, target);
    plan.targets.forEach((item, position) => (item.priority = position + 1));
  }
  function copyTargetRowValues(source: HTMLElement, preview: HTMLElement) {
    const sourceFields = source.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "input, select",
    );
    const previewFields = preview.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "input, select",
    );
    sourceFields.forEach((field, index) => {
      const previewField = previewFields[index];
      if (previewField) previewField.value = field.value;
    });
  }
  function beginTargetDrag(event: PointerEvent, index: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    targetDragCleanup?.();
    draggedTargetIndex.value = index;
    dragTargetIndex.value = index;
    const row = (event.currentTarget as HTMLElement).closest(".target-row") as HTMLElement | null;
    if (!row) return;
    const preview = row.cloneNode(true) as HTMLElement;
    const bounds = row.getBoundingClientRect();
    preview.classList.add("target-drag-preview");
    preview.style.width = `${bounds.width + 56}px`;
    copyTargetRowValues(row, preview);
    document.body.append(preview);
    targetDragPreview = preview;
    const offsetX = Math.min(48, Math.max(16, event.clientX - bounds.left));
    const offsetY = Math.min(20, Math.max(12, event.clientY - bounds.top));
    const move = (moveEvent: PointerEvent) => {
      const previewBounds = preview.getBoundingClientRect();
      preview.style.left = `${Math.max(
        12,
        Math.min(moveEvent.clientX - offsetX, window.innerWidth - previewBounds.width - 12),
      )}px`;
      preview.style.top = `${Math.max(
        12,
        Math.min(moveEvent.clientY - offsetY, window.innerHeight - previewBounds.height - 12),
      )}px`;
      const target = document
        .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest<HTMLElement>(".target-row");
      const targetIndex = Number(target?.dataset.targetIndex);
      if (!Number.isNaN(targetIndex)) dragTargetIndex.value = targetIndex;
    };
    const finish = () => {
      const from = draggedTargetIndex.value;
      const to = dragTargetIndex.value;
      draggedTargetIndex.value = null;
      dragTargetIndex.value = null;
      targetDragPreview?.remove();
      targetDragPreview = undefined;
      targetDragCleanup = undefined;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (from !== null && to !== null) moveTargetTo(from, to);
    };
    targetDragCleanup = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    move(event);
  }
  async function save() {
    if (saving.value || calculating.value) return;
    if (plan.cavernMode === "twoPlusTwo" && plan.cavernSetA === plan.cavernSetB) {
      options.setError("2+2 件套不能选择相同的遗器套装");
      return;
    }
    saving.value = true;
    try {
      plan.note = typeof plan.note === "string" ? plan.note.trim() : "";
      options.setNotice("正在保存培养方案…");
      await yieldForCalculationFeedback();
      await buildPlanApi.save(JSON.parse(JSON.stringify(plan)));
      options.setNotice("培养方案已保存");
      // Close immediately after a successful save; recommendation can be recomputed later.
      options.onSaved?.();
    } catch (cause) {
      options.setError(String(cause));
    } finally {
      saving.value = false;
    }
  }
  async function calculate(): Promise<boolean> {
    if (calculating.value) return false;
    calculating.value = true;
    try {
      options.setNotice("正在计算推荐组合…");
      await yieldForCalculationFeedback();
      recommendation.value = await buildPlanApi.recommend(plan.characterId, includeEquipped.value);
      return true;
    } catch (cause) {
      options.setError(String(cause));
      return false;
    } finally {
      calculating.value = false;
    }
  }
  async function remove() {
    if (!deleteArmed.value) {
      deleteArmed.value = true;
      return;
    }
    try {
      await buildPlanApi.delete(plan.characterId);
      options.setNotice("培养方案已删除");
      options.onDeleted();
    } catch (cause) {
      options.setError(String(cause));
    }
  }
  watch(
    options.characterId,
    (id) => {
      if (id) void load(id);
    },
    { immediate: true },
  );
  onBeforeUnmount(() => targetDragCleanup?.());
  return {
    loading,
    saving,
    calculating,
    includeEquipped,
    deleteArmed,
    recommendation,
    draggedTargetIndex,
    dragTargetIndex,
    plan,
    cavernSets,
    planarSets,
    setCavernMode,
    setCavernSetA,
    addTarget,
    removeTarget,
    moveTargetTo,
    beginTargetDrag,
    save,
    calculate,
    remove,
  };
}
