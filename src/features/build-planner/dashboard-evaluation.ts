import {
  characterDisplayName,
  lightConeById,
  relicSetById,
  resolveCharacterCatalogue,
} from "@/shared/catalogue";
import {
  averageCharacterPotential,
  planQualityCompletion,
  resolvePlanWeights,
} from "@/shared/utils/relic-score";
import { reviewedStandingRules, standingEquipment } from "@/shared/utils/standing-rule-catalogue";
import {
  calculateStandingStats,
  isMaxStandingEquipment,
  lightConeSkillEffect,
} from "@/shared/utils/standing-stats";
import { traceNodeEnabled } from "@/shared/utils/trace-settings";
import { primaryTraceNodes } from "@/shared/utils/trace-stats";
import type { BuildDashboardEntry, RelicSetCatalogueEntry } from "@/types";
import {
  buildTargetProgress,
  effectiveSubstatCounts,
  lowestTargetPercent,
  relicPieceCounts,
} from "./progress";
import { diagnoseBuildPotential } from "./potential-diagnosis";

export type BuildSortMode = "urgent" | "complete" | "custom";
export type BuildStatusFilter = "all" | "pending" | "complete";

export const BUILD_SORT_OPTIONS: ReadonlyArray<{ label: string; value: BuildSortMode }> = [
  { label: "最需提升", value: "urgent" },
  { label: "已达标优先", value: "complete" },
  { label: "自定义排序", value: "custom" },
];

export const BUILD_STATUS_OPTIONS: ReadonlyArray<{ label: string; value: BuildStatusFilter }> = [
  { label: "全部", value: "all" },
  { label: "待提升", value: "pending" },
  { label: "已达标", value: "complete" },
];

export function characterInitial(name: string) {
  return name.slice(0, 1);
}

export function planNote(plan: BuildDashboardEntry["plan"]) {
  return plan.note?.trim() ?? "";
}

export function recommendedSets(plan: BuildDashboardEntry["plan"]) {
  const cavernSets =
    plan.cavernMode === "fourPiece"
      ? [{ set: relicSetById.get(plan.cavernSetA), pieces: 4 }]
      : [
          { set: relicSetById.get(plan.cavernSetA), pieces: 2 },
          ...(plan.cavernSetB ? [{ set: relicSetById.get(plan.cavernSetB), pieces: 2 }] : []),
        ];
  return [...cavernSets, { set: relicSetById.get(plan.planarSetId), pieces: 2 }].filter(
    (item): item is { set: RelicSetCatalogueEntry; pieces: number } => !!item.set,
  );
}

export function getProgressClass(percent: number | null) {
  if (percent === null) return "progress-unknown";
  if (percent >= 100) return "progress-complete";
  if (percent >= 80) return "progress-high";
  if (percent >= 50) return "progress-medium";
  return "progress-low";
}

export function getCompletionClass(ratio: number) {
  return getProgressClass(ratio * 100);
}

export function evaluateDashboardState(
  entry: BuildDashboardEntry,
  disabledTraceNodes: Record<string, number[]>,
) {
  const character = entry.character;
  const catalogue = resolveCharacterCatalogue({
    characterId: character.characterId,
    name: character.name,
  });
  const cone = character.equippedLightCone;
  const coneEntry = cone ? lightConeById.get(cone.templateId) : undefined;
  const coneBase = coneEntry?.baseStats;
  if (!catalogue?.baseStats)
    return { available: false as const, reason: "该角色的满级基础属性尚未同步。", stats: [] };
  if (!cone)
    return { available: false as const, reason: "未装备光锥，无法汇总完整站街属性。", stats: [] };
  if (!coneBase)
    return { available: false as const, reason: "该光锥的满级基础属性尚未同步。", stats: [] };
  if (!isMaxStandingEquipment(character, cone))
    return {
      available: false as const,
      reason: "角色与已装备光锥需均为 Lv.80、满突破后展示。",
      stats: [],
    };
  const equipment = standingEquipment(cone, character.equippedRelics ?? [], catalogue.path);
  const rules = reviewedStandingRules(equipment);
  if (rules.missingInputs.length)
    return {
      available: false as const,
      reason: `缺少属性输入：${rules.missingInputs.join("、").replaceAll("Max Energy", "最大能量")}。`,
      stats: [],
    };
  if (rules.unreviewedSources.length)
    return {
      available: false as const,
      reason: `装备来源规则尚未审核：${rules.unreviewedSources.join("、")}。`,
      stats: [],
    };
  const pieceCounts = new Map<number, number>();
  for (const relic of character.equippedRelics ?? [])
    pieceCounts.set(relic.setId, (pieceCounts.get(relic.setId) ?? 0) + 1);
  const setEffects: string[] = [];
  for (const [setId, count] of pieceCounts) {
    if (count < 2) continue;
    const effect = relicSetById.get(setId)?.effects.twoPiece;
    if (effect) setEffects.push(effect);
  }
  const lightConeEffect = lightConeSkillEffect(coneEntry?.skill, cone.superimposition);
  return {
    available: true as const,
    reason: "",
    stats: calculateStandingStats({
      characterBase: catalogue.baseStats,
      lightConeBase: coneBase,
      relics: character.equippedRelics ?? [],
      traces: primaryTraceNodes(catalogue.traceStats ?? [])
        .filter((trace) => traceNodeEnabled(disabledTraceNodes, character.characterId, trace.id))
        .flatMap((trace) => trace.stats),
      setEffects,
      lightConeEffects: lightConeEffect ? [lightConeEffect] : [],
      equipment,
    }),
  };
}

export function evaluateDashboardEntry(
  entry: BuildDashboardEntry,
  disabledTraceNodes: Record<string, number[]>,
) {
  const character = entry.character;
  const catalogue = resolveCharacterCatalogue({
    characterId: character.characterId,
    name: character.name,
  });
  const state = evaluateDashboardState(entry, disabledTraceNodes);
  if (!state.available) {
    return { entry, character, state, card: null };
  }
  const targets = buildTargetProgress(entry.plan.targets, state.stats);
  const effective = effectiveSubstatCounts(
    character.equippedRelics ?? [],
    entry.plan.effectiveSubstats,
  );
  const equippedPieceCounts = relicPieceCounts(character.equippedRelics ?? []);
  const completed = targets.filter(
    (target) => target.percent !== null && target.percent >= 100,
  ).length;
  // Lightweight scoring only — full Estimated TBP enumeration is too slow for list load.
  const weights = resolvePlanWeights({
    substatWeights: entry.plan.substatWeights,
    effectiveSubstats: entry.plan.effectiveSubstats,
  });
  const relicInputs = (character.equippedRelics ?? []).map((relic, index) => ({
    slot:
      relic.slot ??
      (["Head", "Hands", "Body", "Feet", "PlanarSphere", "LinkRope"][index] || "Head"),
    mainStat: relic.mainStat,
    substats: relic.substats,
  }));
  const quality = planQualityCompletion(relicInputs, weights, {
    allowedMainStats: entry.plan.mainStats,
    minPotentialPct: entry.plan.minPotentialPct ?? 40,
  });
  const potential = averageCharacterPotential(relicInputs, weights, {
    allowedMainStats: entry.plan.mainStats,
  });
  const recommended = recommendedSets(entry.plan).map((item) => ({
    ...item,
    matched: (equippedPieceCounts.get(item.set.id) ?? 0) >= item.pieces,
  }));
  const usingInferredWeights =
    !entry.plan.substatWeights || Object.keys(entry.plan.substatWeights).length === 0;
  const diagnosis = diagnoseBuildPotential({
    relics: relicInputs,
    pieces: potential.pieces,
    weights,
    usingInferredWeights,
    recommendedSets: recommended,
    targets,
    averagePotentialPct: potential.averagePotentialPct,
    minPotentialPct: entry.plan.minPotentialPct ?? 40,
    weakSlot: potential.weakSlot,
  });
  const radarPieces = potential.pieces.map((piece) => {
    const pieceDiag = diagnosis.piecesBySlot[piece.slot];
    return {
      ...piece,
      effectiveRolls: pieceDiag?.effectiveRolls,
      wastedUpgrades: pieceDiag?.wastedUpgrades,
    };
  });
  const cone = character.equippedLightCone;
  const coneEntry = cone ? lightConeById.get(cone.templateId) : undefined;
  return {
    entry,
    character,
    state,
    card: {
      entry,
      character,
      displayName: characterDisplayName(character),
      image: catalogue?.image,
      equippedLightCone: cone
        ? {
            name: cone.name || coneEntry?.name || `光锥 #${cone.templateId}`,
            image: coneEntry?.image ?? null,
            level: cone.level,
            superimposition: cone.superimposition ?? 1,
          }
        : null,
      recommendedSets: recommended,
      state,
      targets,
      effective,
      effectiveTotal: effective.reduce((sum, item) => sum + item.count, 0),
      completed,
      quality,
      averagePotentialPct: potential.averagePotentialPct,
      weakSlot: potential.weakSlot,
      pieces: radarPieces,
      diagnosis,
      minPotentialPct: entry.plan.minPotentialPct ?? 40,
    },
  };
}

export type EvaluatedDashboardEntry = ReturnType<typeof evaluateDashboardEntry>;
export type DashboardCardModel = NonNullable<EvaluatedDashboardEntry["card"]>;

export function compareDashboardCards(
  left: Pick<DashboardCardModel, "entry" | "completed" | "targets">,
  right: Pick<DashboardCardModel, "entry" | "completed" | "targets">,
  sortMode: BuildSortMode,
) {
  if (left.entry.pinned !== right.entry.pinned)
    return Number(right.entry.pinned) - Number(left.entry.pinned);
  if (sortMode === "custom") {
    return left.entry.displayOrder - right.entry.displayOrder;
  }
  if (sortMode === "complete") {
    return right.completed - left.completed || left.entry.displayOrder - right.entry.displayOrder;
  }
  return (
    left.targets.length - left.completed - (right.targets.length - right.completed) ||
    lowestTargetPercent(left.targets) - lowestTargetPercent(right.targets) ||
    left.entry.displayOrder - right.entry.displayOrder
  );
}

export function filterAndSortDashboardCards(
  evaluated: EvaluatedDashboardEntry[],
  options: { search: string; status: BuildStatusFilter; sort: BuildSortMode },
): DashboardCardModel[] {
  const keyword = options.search.trim();
  const filtered: DashboardCardModel[] = [];
  for (const item of evaluated) {
    const card = item.card;
    if (!card) continue;
    if (keyword && !card.character.name.includes(keyword) && !card.displayName.includes(keyword)) {
      continue;
    }
    if (options.status === "complete") {
      if (!(card.targets.length > 0 && card.completed >= card.targets.length)) continue;
    } else if (options.status === "pending") {
      if (!(card.targets.length === 0 || card.completed < card.targets.length)) continue;
    }
    filtered.push(card);
  }
  return filtered.sort((left, right) => compareDashboardCards(left, right, options.sort));
}

export function orderedEntryIds(entries: BuildDashboardEntry[]) {
  return [...entries]
    .sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        left.displayOrder - right.displayOrder ||
        left.character.characterId - right.character.characterId,
    )
    .map((entry) => entry.character.characterId);
}

export function orderedEntryIdsForDrag(entries: BuildDashboardEntry[], preferred: number[]) {
  const known = new Set(preferred);
  return [...preferred, ...orderedEntryIds(entries).filter((id) => !known.has(id))];
}
