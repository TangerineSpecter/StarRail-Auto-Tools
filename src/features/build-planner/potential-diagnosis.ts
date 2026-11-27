import { isFixedMainStatSlot, slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import {
  FLAT_SUBSTATS,
  GRADE5_SUBSTAT_ROLLS,
  SUBSTAT_KEYS,
  effectiveWeight,
  letterGradeFromPotential,
  qualityUnitsOnLine,
  totalRollsOnLine,
  usesEnhancementHitCount,
  type RelicScoreResult,
  type ScoreRelicInput,
  type SubstatKey,
} from "@/shared/utils/relic-score";
import { RADAR_SLOT_ORDER } from "./radar-geometry";
import { formatBuildProgressValue, type TargetProgress } from "./progress";

export type SuggestionTone = "critical" | "warn" | "info" | "done";

export interface UpgradeSuggestion {
  tone: SuggestionTone;
  label: string;
  text: string;
}

export interface PieceDiagnosis {
  slot: string;
  mainStat: string;
  mainStatCorrect: boolean | null;
  potentialPct: number;
  letterGrade: string | null;
  effectiveRolls: number;
  wastedRolls: number;
  totalRolls: number;
  avgRollQuality: number | null;
  qualityLossUnits: number;
  lowWeightLossUnits: number;
  idealPotential: number;
}

export interface PotentialDiagnosis {
  piecesBySlot: Record<string, PieceDiagnosis>;
  weightSummary: string;
  weightSourceLabel: string;
  totalEffectiveRolls: number;
  totalWastedRolls: number;
  avgRollQuality: number | null;
  qualityLossPct: number;
  lowWeightLossPct: number;
  explanationTip: string;
  suggestions: UpgradeSuggestion[];
}

export interface DiagnoseBuildPotentialInput {
  relics: ScoreRelicInput[];
  pieces: Array<RelicScoreResult & { slot: string; mainStat: string }>;
  weights: Record<string, number>;
  usingInferredWeights: boolean;
  recommendedSets: Array<{ set: { name: string }; pieces: number; matched: boolean }>;
  targets: TargetProgress[];
  averagePotentialPct: number;
  minPotentialPct: number;
  weakSlot: string | null;
}

const DIRECT_ROLL_ESTIMATE_KEYS = new Set<SubstatKey>([
  "SPD",
  "CRIT Rate",
  "CRIT DMG",
  "Break Effect",
  "Effect Hit Rate",
  "Effect RES",
]);

const PERCENT_TO_FLAT_LABEL: Record<string, string> = {
  "HP%": "小生命",
  "ATK%": "小攻击",
  "DEF%": "小防御",
};

function shortStatName(key: string): string {
  return statLabel(key).replace("百分比", "%");
}

function formatWeightNum(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(Number(value.toFixed(2)));
}

function buildWeightSummary(weights: Record<string, number>): {
  summary: string;
  maxWeight: number;
} {
  const entries = SUBSTAT_KEYS.filter((key) => !FLAT_SUBSTATS.has(key))
    .map((key) => [key, weights[key] ?? 0] as const)
    .filter(([, weight]) => weight > 0)
    .sort((left, right) => right[1] - left[1]);

  if (entries.length === 0) {
    return { summary: "未配置有效权重", maxWeight: 0 };
  }

  const maxWeight = entries[0]![1];
  const baseText = entries
    .map(([key, weight]) => `${shortStatName(key)} ${formatWeightNum(weight)}`)
    .join(" · ");

  const flatNotes = entries
    .filter(([key]) => key in PERCENT_TO_FLAT_LABEL)
    .map(([key, weight]) => `${PERCENT_TO_FLAT_LABEL[key]} ${formatWeightNum(weight * 0.4)}`);

  if (flatNotes.length === 1) {
    return { summary: `${baseText}（${flatNotes[0]} 自动计入）`, maxWeight };
  }
  if (flatNotes.length > 1) {
    return { summary: `${baseText}（对应小属性按 40% 自动计入）`, maxWeight };
  }
  return { summary: baseText, maxWeight };
}

function estimateTargetRollsHint(target: TargetProgress): string {
  const gap = target.gap ?? 0;
  const formattedGap = formatBuildProgressValue(target.statKey, gap);
  const unit = ["HP", "ATK", "DEF", "SPD"].includes(target.statKey) ? "" : "%";
  const label = shortStatName(target.statKey);
  if (DIRECT_ROLL_ESTIMATE_KEYS.has(target.statKey as SubstatKey)) {
    const mid = GRADE5_SUBSTAT_ROLLS[target.statKey as SubstatKey].mid;
    const rolls = Math.max(1, Math.ceil(gap / mid - 1e-9));
    return `${label}还差 ${formattedGap}${unit}（约 ${rolls} 条副词条）`;
  }
  return `${label}还差 ${formattedGap}${unit}`;
}

export function diagnoseBuildPotential(input: DiagnoseBuildPotentialInput): PotentialDiagnosis {
  const { summary: weightSummary, maxWeight } = buildWeightSummary(input.weights);
  const weightSourceLabel = input.usingInferredWeights ? "按有效词条推断" : "方案自定义权重";
  const relicBySlot = new Map<string, ScoreRelicInput>();
  for (const relic of input.relics) {
    if (!relicBySlot.has(relic.slot)) relicBySlot.set(relic.slot, relic);
  }

  const piecesBySlot: Record<string, PieceDiagnosis> = {};
  const lowWeightRollsByKey = new Map<string, { rolls: number; weight: number }>();

  let totalEffectiveRolls = 0;
  let totalWastedRolls = 0;
  let totalQualityUnits = 0;
  let qualityLossPctSum = 0;
  let lowWeightLossPctSum = 0;

  const hasGraded = input.pieces.some((piece) => piece.letterGrade !== null);
  const scoredPieces = hasGraded
    ? input.pieces.filter((piece) => piece.letterGrade !== null)
    : input.pieces;
  const gradedSlots = new Set(scoredPieces.map((piece) => piece.slot));

  for (const piece of input.pieces) {
    const relic = relicBySlot.get(piece.slot);
    const substats = (relic?.substats ?? []).filter((stat) => !stat.kind || stat.kind === "normal");
    const enhancementHits = usesEnhancementHitCount(substats);
    const rollOpts = { enhancementHits };

    let effectiveRolls = 0;
    let wastedRolls = 0;
    let pieceQualityUnits = 0;
    let qualityLossUnits = 0;
    let lowWeightLossUnits = 0;

    for (const stat of substats) {
      const rolls = totalRollsOnLine(stat, rollOpts);
      const weight = effectiveWeight(stat.key, input.weights);
      if (weight > 0) {
        const qualityUnits = qualityUnitsOnLine(stat, rollOpts);
        effectiveRolls += rolls;
        pieceQualityUnits += qualityUnits;
        qualityLossUnits += weight * Math.max(0, rolls - qualityUnits);
        if (!FLAT_SUBSTATS.has(stat.key) && maxWeight > 0 && weight < maxWeight - 1e-6) {
          lowWeightLossUnits += (maxWeight - weight) * qualityUnits;
          const prev = lowWeightRollsByKey.get(stat.key);
          lowWeightRollsByKey.set(stat.key, {
            rolls: (prev?.rolls ?? 0) + rolls,
            weight,
          });
        }
      } else {
        wastedRolls += rolls;
      }
    }

    totalEffectiveRolls += effectiveRolls;
    totalWastedRolls += wastedRolls;
    totalQualityUnits += pieceQualityUnits;

    if (gradedSlots.has(piece.slot) && piece.idealPotential > 0) {
      qualityLossPctSum += (qualityLossUnits / piece.idealPotential) * 100;
      lowWeightLossPctSum += (lowWeightLossUnits / piece.idealPotential) * 100;
    }

    piecesBySlot[piece.slot] = {
      slot: piece.slot,
      mainStat: piece.mainStat,
      mainStatCorrect: piece.mainStatCorrect,
      potentialPct: piece.potentialPct,
      letterGrade: piece.letterGrade,
      effectiveRolls,
      wastedRolls,
      totalRolls: effectiveRolls + wastedRolls,
      avgRollQuality: effectiveRolls > 0 ? pieceQualityUnits / effectiveRolls : null,
      qualityLossUnits,
      lowWeightLossUnits,
      idealPotential: piece.idealPotential,
    };
  }

  const denominatorCount = scoredPieces.length;
  const qualityLossPct = denominatorCount > 0 ? qualityLossPctSum / denominatorCount : 0;
  const lowWeightLossPct = denominatorCount > 0 ? lowWeightLossPctSum / denominatorCount : 0;
  const avgRollQuality = totalEffectiveRolls > 0 ? totalQualityUnits / totalEffectiveRolls : null;

  const explanationLines: string[] = [];
  if (input.pieces.length === 0) {
    explanationLines.push(`权重（${weightSourceLabel}）：${weightSummary}`);
    explanationLines.push("装备遗器后，按「当前加权词条分 ÷ 理论满高档极限」计算六件平均潜力。");
  } else {
    explanationLines.push(`权重（${weightSourceLabel}）：${weightSummary}`);
    explanationLines.push(
      "算法：单件加权分 ÷ 同主属性满高档极限（4词条开局+5次全进最高权），六件取均值。",
    );
    if (totalWastedRolls > 0) {
      explanationLines.push(
        `· 有效/歪词条：有效 ${totalEffectiveRolls} 条，歪无效 ${totalWastedRolls} 条（主要失分来源）`,
      );
    } else if (totalEffectiveRolls > 0) {
      explanationLines.push(`· 词条命中：有效 ${totalEffectiveRolls} 条，无无效词条`);
    }
    if (avgRollQuality !== null && qualityLossPct >= 0.5) {
      explanationLines.push(
        `· 数值档位：有效词条平均 ${avgRollQuality.toFixed(2)} 档（低0.8/中0.9/高1.0），全高档约 +${qualityLossPct.toFixed(1)}%`,
      );
    }
    if (lowWeightLossPct >= 0.5 && lowWeightRollsByKey.size > 0) {
      const lowSummary = [...lowWeightRollsByKey.entries()]
        .sort((left, right) => right[1].rolls - left[1].rolls)
        .slice(0, 2)
        .map(
          ([key, info]) =>
            `${shortStatName(key)} ${info.rolls} 条（${formatWeightNum(info.weight)}权）`,
        )
        .join("、");
      explanationLines.push(
        `· 次权词条：${lowSummary}，全换满权约 +${lowWeightLossPct.toFixed(1)}%`,
      );
    }
    explanationLines.push("评级参考：50% S 成型 · 60% SS 毕业 · 70% SSS 极品 · 80%+ WTF");
  }

  const suggestions = buildUpgradeSuggestions({
    input,
    piecesBySlot,
  });

  return {
    piecesBySlot,
    weightSummary,
    weightSourceLabel,
    totalEffectiveRolls,
    totalWastedRolls,
    avgRollQuality,
    qualityLossPct,
    lowWeightLossPct,
    explanationTip: explanationLines.join("\n"),
    suggestions,
  };
}

function buildUpgradeSuggestions({
  input,
  piecesBySlot,
}: {
  input: DiagnoseBuildPotentialInput;
  piecesBySlot: Record<string, PieceDiagnosis>;
}): UpgradeSuggestion[] {
  const suggestions: UpgradeSuggestion[] = [];
  const equippedSlots = new Set(input.pieces.map((piece) => piece.slot));
  const missingSlots = RADAR_SLOT_ORDER.filter((slot) => !equippedSlots.has(slot));

  // 1. Missing pieces
  if (missingSlots.length > 0) {
    const names = missingSlots
      .slice(0, 3)
      .map((slot) => slotLabel(slot))
      .join("、");
    const suffix = missingSlots.length > 3 ? "等" : "";
    suggestions.push({
      tone: "critical",
      label: "缺部位",
      text: `还缺 ${missingSlots.length} 件遗器（${names}${suffix}），优先补齐 6 件`,
    });
  }

  // 2. Wrong selectable main stat
  const wrongMainPieces = input.pieces.filter(
    (piece) => piece.mainStatCorrect === false && !isFixedMainStatSlot(piece.slot),
  );
  if (wrongMainPieces.length > 0) {
    const names = wrongMainPieces.map((piece) => slotLabel(piece.slot)).join("、");
    suggestions.push({
      tone: "critical",
      label: "主词条",
      text: `${names}主词条不符方案目标，优先更换正确主词条`,
    });
  }

  // 3. Unmatched sets
  const unmatchedSets = input.recommendedSets.filter((item) => !item.matched);
  if (unmatchedSets.length > 0 && suggestions.length < 2) {
    const first = unmatchedSets[0]!;
    suggestions.push({
      tone: "warn",
      label: "凑套装",
      text: `${first.set.name} ${first.pieces}件套未配齐，优先补齐套装效果`,
    });
  }

  // 4. Unmet stat target (pick most urgent)
  const unmetTargets = input.targets
    .filter((target) => target.percent !== null && target.percent < 100 && (target.gap ?? 0) > 0)
    .sort((left, right) => (left.percent ?? 0) - (right.percent ?? 0));
  if (unmetTargets.length > 0 && suggestions.length < 2) {
    const urgent = unmetTargets[0]!;
    suggestions.push({
      tone: "warn",
      label: "补目标",
      text: estimateTargetRollsHint(urgent),
    });
  }

  const weakDiag = input.weakSlot ? piecesBySlot[input.weakSlot] : undefined;
  const avgPct = input.averagePotentialPct;
  const grade = letterGradeFromPotential(avgPct);
  const allTargetsMet = unmetTargets.length === 0;
  const hasHardBlocker =
    missingSlots.length > 0 || wrongMainPieces.length > 0 || unmatchedSets.length > 0;

  // 5. High-grade graduation / stop-farming callout when core goals are satisfied
  if (!hasHardBlocker && allTargetsMet && input.pieces.length > 0 && avgPct >= 55) {
    const statusLabel = avgPct >= 60 ? "已毕业" : "已成型";
    const statusWord = avgPct >= 60 ? "毕业" : "成型";
    const hasNotableWeak =
      weakDiag &&
      (weakDiag.potentialPct < input.minPotentialPct || avgPct - weakDiag.potentialPct >= 10);

    if (hasNotableWeak && weakDiag) {
      const slotName = slotLabel(weakDiag.slot);
      const weakPct = Math.round(weakDiag.potentialPct);
      const targetSlotPct = Math.min(
        75,
        Math.max(input.minPotentialPct + 10, Math.round(avgPct + 5)),
      );
      const deltaAvg = Math.max(
        1,
        Math.round((targetSlotPct - weakDiag.potentialPct) / Math.max(input.pieces.length, 1)),
      );
      const reason =
        weakDiag.wastedRolls >= 3
          ? `歪 ${weakDiag.wastedRolls} 条无效词条`
          : `有效 ${weakDiag.effectiveRolls} 条`;
      suggestions.push({
        tone: "done",
        label: statusLabel,
        text: `已达 ${grade} (${Math.round(avgPct)}%) ${statusWord}；若继续提分优先换【${slotName}】(${weakPct}%，${reason}，换到 ${targetSlotPct}% 均分约 +${deltaAvg}%)`,
      });
    } else {
      suggestions.push({
        tone: "done",
        label: statusLabel,
        text: `已达 ${grade} (${Math.round(avgPct)}%) ${statusWord}且六件均衡，可优先刷其他角色`,
      });
    }
    return suggestions.slice(0, 2);
  }

  // 6. Weak-slot upgrade recommendation when room remains
  if (weakDiag && suggestions.length < 2) {
    const slotName = slotLabel(weakDiag.slot);
    const weakPct = Math.round(weakDiag.potentialPct);
    const belowMin = weakDiag.potentialPct < input.minPotentialPct;
    const targetSlotPct = Math.min(
      70,
      Math.max(input.minPotentialPct + 10, Math.round(avgPct + 8), 55),
    );
    const deltaAvg = Math.max(
      1,
      Math.round((targetSlotPct - weakDiag.potentialPct) / Math.max(input.pieces.length, 1)),
    );
    const reason =
      weakDiag.wastedRolls >= 3
        ? `歪了 ${weakDiag.wastedRolls} 条无效词条`
        : weakDiag.totalRolls > 0
          ? `有效仅 ${weakDiag.effectiveRolls} 条`
          : "词条潜力偏低";

    suggestions.push({
      tone: belowMin ? "warn" : "info",
      label: "换短板",
      text: `优先换【${slotName}】(${weakPct}%)：${reason}，换到 ${targetSlotPct}% 均分约 +${deltaAvg}%`,
    });
  }

  return suggestions.slice(0, 2);
}
