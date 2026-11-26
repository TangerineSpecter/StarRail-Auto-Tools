import { spdBreakpointHelper, type ScoreRelicInput } from "@/shared/utils/relic-score";
import type { RelicListItem } from "@/types";
import type { RelicDetailData } from "./detail-types";

export type RelicScoreCandidateInput = ScoreRelicInput & {
  itemId?: number;
  name?: string;
  setName?: string;
  setId?: number;
  mainStatValue?: number;
  location?: string;
  equippedCharacterId?: number | null;
  locked?: boolean;
  discard?: boolean;
  updatedAt?: number;
};

export function listItemToDetail(item: RelicListItem): RelicDetailData {
  return {
    itemId: item.itemId,
    setId: item.setId,
    name: item.name,
    setName: item.setName,
    slot: item.slot,
    rarity: item.rarity,
    level: item.level,
    mainStat: item.mainStat,
    mainStatValue: item.mainStatValue,
    location: item.location,
    equippedCharacterId: item.equippedCharacterId,
    locked: item.locked,
    discard: item.discard,
    updatedAt: item.updatedAt,
    substats: item.substats,
  };
}

export function candidateToDetail(relic: RelicScoreCandidateInput): RelicDetailData {
  return {
    itemId: relic.itemId ?? 0,
    setId: relic.setId ?? 0,
    name: relic.name ?? "未知遗器",
    setName: relic.setName ?? "",
    slot: relic.slot,
    rarity: relic.rarity ?? 5,
    level: relic.level ?? 0,
    mainStat: relic.mainStat,
    mainStatValue: relic.mainStatValue ?? 0,
    location: relic.location ?? "",
    equippedCharacterId: relic.equippedCharacterId ?? null,
    locked: relic.locked ?? false,
    discard: relic.discard ?? false,
    updatedAt: relic.updatedAt ?? 0,
    substats: (relic.substats ?? []).map((stat, index) => ({
      kind: stat.kind ?? "normal",
      position: index,
      key: stat.key,
      value: stat.value ?? 0,
      count: stat.count ?? 0,
      step: stat.step ?? 0,
    })),
  };
}

export function gradeBadgeClass(grade: string | null): string {
  if (!grade) return "grade-none";
  if (grade.startsWith("SSS")) return "grade-sss";
  if (grade.startsWith("SS")) return "grade-ss";
  if (grade.startsWith("S+")) return "grade-sp";
  if (grade.startsWith("S")) return "grade-s";
  if (grade.startsWith("A")) return "grade-a";
  if (grade.startsWith("B")) return "grade-b";
  return "grade-c";
}

export function adviceClass(advice: string): string {
  if (advice === "可停刷") return "is-stop";
  if (advice === "主属性不符") return "is-mismatch";
  if (advice === "优先刷") return "is-priority";
  return "is-continue";
}

export function formatDays(days: number): string {
  if (!Number.isFinite(days)) return "∞";
  return `${days.toFixed(1)} 天`;
}

export function equippedRelicSpdBonus(relics: RelicDetailData[] | undefined): number {
  let spd = 0;
  for (const relic of relics ?? []) {
    if (relic.mainStat === "SPD") spd += relic.mainStatValue ?? 0;
    for (const sub of relic.substats ?? []) {
      if ((!sub.kind || sub.kind === "normal") && sub.key === "SPD") spd += sub.value ?? 0;
    }
  }
  return spd;
}

export function buildSpdHelp(currentSpd: number | null | undefined, target: number) {
  if (target <= 0) return null;
  if (typeof currentSpd === "number" && Number.isFinite(currentSpd)) {
    return {
      ...spdBreakpointHelper(currentSpd, target),
      mode: "total" as const,
    };
  }
  return {
    ...spdBreakpointHelper(0, target),
    mode: "gap-only" as const,
    note: `站街速度不可用：按「还差 ${target.toFixed(1)} 速」估算（约 ${Math.ceil(target / 2.6)} 条高 roll）。请装备满级光锥并同步基础属性以使用总速度对比。`,
  };
}
