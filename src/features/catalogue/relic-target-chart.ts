import type { RelicSetCatalogueEntry, RelicSetTargetCount } from "@/types";

export interface RelicSetTargetChartItem {
  set: RelicSetCatalogueEntry;
  targetCount: number;
}

/** Sorts every visible set by distinct target-character count, then by name for stable ties. */
export function sortRelicSetsByTargetCount(
  sets: RelicSetCatalogueEntry[],
  counts: RelicSetTargetCount[],
): RelicSetTargetChartItem[] {
  const countBySetId = new Map(counts.map((item) => [item.setId, item.count]));
  return sets
    .map((set) => ({ set, targetCount: countBySetId.get(set.id) ?? 0 }))
    .sort(
      (left, right) =>
        right.targetCount - left.targetCount ||
        left.set.name.localeCompare(right.set.name, "zh-CN") ||
        left.set.id - right.set.id,
    );
}
