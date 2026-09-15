import { onBeforeUnmount, reactive, ref, watch, type Ref } from "vue";
import { buildPlanApi } from "@/shared/api/build-plan";
import { lightConeById, relicCatalogue, resolveCharacterCatalogue } from "@/shared/catalogue";
import { optimizeRelics, type RelicOptimizerRunInput } from "@/shared/utils/relic-optimizer";
import { loadDisabledTraceNodes, traceNodeEnabled } from "@/shared/utils/trace-settings";
import { primaryTraceNodes } from "@/shared/utils/trace-stats";
import { lightConeSkillEffect } from "@/shared/utils/standing-stats";
import { reviewedStandingRules, standingEquipment } from "@/shared/utils/standing-rule-catalogue";
import type { CharacterBuildPlan, RelicOptimizerOptions, RelicOptimizerResult } from "@/types";

interface RelicOptimizerControllerOptions {
  characterId: Ref<number>;
  plan: CharacterBuildPlan;
  inventoryRevision?: Ref<number>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}

type WorkerResponse = { id: number; result?: RelicOptimizerResult; error?: string };

export function useRelicOptimizer(options: RelicOptimizerControllerOptions) {
  const calculating = ref(false);
  const phase = ref("");
  const result = ref<RelicOptimizerResult | null>(null);
  const resultOpen = ref(false);
  const optimizerOptions = reactive<RelicOptimizerOptions>({
    includeEquipped: false,
    includeUnfinished: false,
    includeDiscarded: false,
    includeRelaxed: false,
  });
  let worker: Worker | null = null;
  let requestId = 0;
  let rejectRunning: ((reason: Error) => void) | null = null;

  function cancel(message?: string) {
    requestId += 1;
    worker?.terminate();
    worker = null;
    rejectRunning?.(new Error("计算已取消"));
    rejectRunning = null;
    calculating.value = false;
    phase.value = "";
    resultOpen.value = false;
    if (message) options.setNotice(message);
  }

  function validatePlan(plan: CharacterBuildPlan) {
    if (!plan.cavernSetA || !plan.planarSetId) throw new Error("请先选择隧洞遗器和位面套装。");
    if (
      plan.cavernMode === "twoPlusTwo" &&
      (!plan.cavernSetB || plan.cavernSetA === plan.cavernSetB)
    )
      throw new Error("2+2 方案需要两个不同的隧洞套装。");
  }

  async function runInWorker(
    input: RelicOptimizerRunInput,
    id: number,
  ): Promise<RelicOptimizerResult> {
    if (typeof Worker === "undefined") return optimizeRelics(input);
    return new Promise<RelicOptimizerResult>((resolve, reject) => {
      rejectRunning = reject;
      const runningWorker = new Worker(
        new URL("../../shared/utils/relic-optimizer/optimizer.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker = runningWorker;
      runningWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.id !== id || id !== requestId || worker !== runningWorker) return;
        runningWorker.terminate();
        worker = null;
        rejectRunning = null;
        if (event.data.error) reject(new Error(event.data.error));
        else if (event.data.result) resolve(event.data.result);
        else reject(new Error("优化器没有返回结果。"));
      };
      runningWorker.onerror = (event) => {
        if (id !== requestId || worker !== runningWorker) return;
        runningWorker.terminate();
        worker = null;
        rejectRunning = null;
        reject(new Error(event.message || "优化器运行失败。"));
      };
      runningWorker.postMessage({ id, input });
    });
  }

  async function calculate(): Promise<boolean> {
    if (calculating.value) return false;
    const plan = JSON.parse(JSON.stringify(options.plan)) as CharacterBuildPlan;
    let id = requestId;
    try {
      validatePlan(plan);
      id = ++requestId;
      calculating.value = true;
      result.value = null;
      resultOpen.value = true;
      phase.value = "正在读取全背包候选…";
      const revision = options.inventoryRevision?.value;
      const context = await buildPlanApi.optimizerContext(options.characterId.value);
      if (id !== requestId) throw new Error("计算已取消");
      if (revision !== undefined && revision !== options.inventoryRevision?.value)
        throw new Error("背包数据已变化，请重新运行优化。");

      const character = resolveCharacterCatalogue({
        characterId: context.character.characterId,
        name: context.character.name,
        path: context.character.path,
      });
      if (!character?.baseStats) throw new Error("该角色的 80 级基础属性尚未同步。");
      if (!context.equippedLightCone) throw new Error("请先为该角色装备光锥。");
      const lightCone = lightConeById.get(context.equippedLightCone.templateId);
      if (!lightCone?.baseStats) throw new Error("当前光锥的 80 级基础属性尚未同步。");
      const reviewed = reviewedStandingRules(
        standingEquipment(context.equippedLightCone, [], context.character.path ?? ""),
      );
      if (reviewed.missingInputs.length)
        throw new Error(
          `缺少可信的角色属性，无法完整优化：${reviewed.missingInputs.join("、").replaceAll("Max Energy", "最大能量")}`,
        );
      if (reviewed.unreviewedSources.length)
        throw new Error(`装备规则待审核，无法完整优化：${reviewed.unreviewedSources.join("、")}`);

      const disabledTraceNodes = loadDisabledTraceNodes();
      const traces = primaryTraceNodes(character.traceStats ?? [])
        .filter((node) =>
          traceNodeEnabled(disabledTraceNodes, context.character.characterId, node.id),
        )
        .flatMap((node) => node.stats);
      const lightConeEffect = lightConeSkillEffect(
        lightCone.skill,
        context.equippedLightCone.superimposition,
      );
      phase.value = `正在分析 ${context.relics.length} 件遗器…`;
      const input: RelicOptimizerRunInput = {
        context,
        plan,
        options: { ...optimizerOptions },
        characterBase: character.baseStats,
        lightConeBase: lightCone.baseStats,
        traces,
        useReviewedEquipment: true,
        lightConeEffects: lightConeEffect ? [lightConeEffect] : [],
        sets: relicCatalogue.sets,
      };
      result.value = await runInWorker(input, id);
      if (id !== requestId) throw new Error("计算已取消");
      if (revision !== undefined && revision !== options.inventoryRevision?.value)
        throw new Error("背包数据已变化，请重新运行优化。");
      phase.value = "";
      return true;
    } catch (cause) {
      if (id !== requestId) return false;
      const message = cause instanceof Error ? cause.message.trim() : String(cause);
      if (message !== "计算已取消") options.setError(message);
      resultOpen.value = message === "计算已取消" ? resultOpen.value : false;
      return false;
    } finally {
      if (id === requestId) {
        calculating.value = false;
        phase.value = "";
      }
    }
  }

  if (options.inventoryRevision) {
    watch(options.inventoryRevision, () => {
      if (calculating.value) cancel("背包数据已更新，已取消过期计算。");
      else if (result.value) {
        result.value = null;
        resultOpen.value = false;
        options.setNotice("背包数据已更新，请重新运行全局优化。");
      }
    });
  }
  watch(options.characterId, () => {
    if (calculating.value) cancel();
    result.value = null;
    resultOpen.value = false;
  });
  onBeforeUnmount(() => cancel());

  return {
    calculating,
    phase,
    result,
    resultOpen,
    optimizerOptions,
    calculate,
    cancel,
  };
}
