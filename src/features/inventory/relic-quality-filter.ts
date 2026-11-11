import { resolvePlanWeights, scoreRelic } from "@/shared/utils/relic-score";
import type { CharacterBuildPlan, RelicListItem } from "@/types";

export interface RelicQualityFilter {
  characterId: number | null;
  sortMode: "default" | "score-desc" | "score-asc";
  minGrade: string;
}

export const createRelicQualityFilter = (): RelicQualityFilter => ({
  characterId: null,
  sortMode: "default",
  minGrade: "",
});

const grades = [
  "AEON",
  "WTF+",
  "WTF",
  "SSS+",
  "SSS",
  "SS+",
  "SS",
  "S+",
  "S",
  "A+",
  "A",
  "B+",
  "B",
  "C+",
  "C",
  "D+",
  "D",
  "F+",
  "F",
];
export const relicQualityGradeOptions = [
  { label: "不限等级", value: "" },
  ...grades.map((grade) => ({ label: `≥ ${grade}`, value: grade })),
];
export const relicQualitySortOptions = [
  { label: "默认顺序", value: "default" },
  { label: "加权分从高到低", value: "score-desc" },
  { label: "加权分从低到高", value: "score-asc" },
];

function gradeRank(grade: string | null) {
  const index = grade ? grades.indexOf(grade) : -1;
  return index === -1 ? grades.length : index;
}

/** Preserve the desktop contract: quality filtering/sorting is local to the loaded page. */
export function filterRelicQuality(
  items: RelicListItem[],
  filter: Pick<RelicQualityFilter, "sortMode" | "minGrade">,
  plan: CharacterBuildPlan | null,
): RelicListItem[] {
  if (!filter.minGrade && filter.sortMode === "default") return [...items];
  const weights = resolvePlanWeights({
    substatWeights: plan?.substatWeights,
    effectiveSubstats: plan?.effectiveSubstats,
  });
  let rows = items.map((item) => ({
    item,
    score: scoreRelic(item, weights, { allowedMainStats: plan?.mainStats }),
  }));
  if (filter.minGrade) {
    const threshold = gradeRank(filter.minGrade);
    rows = rows.filter((row) => gradeRank(row.score.letterGrade) <= threshold);
  }
  if (filter.sortMode !== "default") {
    const direction = filter.sortMode === "score-desc" ? -1 : 1;
    rows.sort((a, b) => direction * (a.score.weightedRolls - b.score.weightedRolls));
  }
  return rows.map((row) => row.item);
}
