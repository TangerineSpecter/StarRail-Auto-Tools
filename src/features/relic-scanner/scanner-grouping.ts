import { characterDisplayName, relicImage, resolveCharacterCatalogue } from "@/shared/catalogue";
import { scanUpgradeRecommendations } from "@/shared/utils/relic-score";
import type { BuildDashboardEntry, RelicListItem, RelicMainStatGroupedResult } from "@/types";

export const SCANNER_SLOTS = [
  { key: "Body", label: "躯干", icon: "🎽" },
  { key: "Feet", label: "脚部", icon: "👟" },
  { key: "PlanarSphere", label: "位面球", icon: "🔮" },
  { key: "LinkRope", label: "连结绳", icon: "📿" },
  { key: "Head", label: "头部", icon: "🪖" },
  { key: "Hands", label: "手部", icon: "🥊" },
] as const;

export interface ScannerUsefulnessRow {
  item: RelicListItem;
  bestCharacterId: number | null;
  bestLabel: string;
  characterDisplayLabel: string;
  characterAvatar: string | null;
  characterElement: string | null;
  grade: string | null;
  weightedRolls: number;
  equippedWeightedRolls: number | null;
  deltaWeightedRolls: number;
  effectiveSubstatWeights: Record<string, number>;
}

export type SubstatEffectiveTier = "core" | "minor" | "none";

export function substatEffectiveTier(
  weights: Record<string, number> | undefined,
  statKey: string,
): SubstatEffectiveTier {
  const weight = weights?.[statKey] ?? 0;
  if (weight >= 0.5) return "core";
  if (weight > 0) return "minor";
  return "none";
}

export function formatSubstatWeightHint(
  weights: Record<string, number> | undefined,
  statKey: string,
): string {
  const weight = weights?.[statKey] ?? 0;
  if (weight <= 0) return "非目标词条";
  const rounded = Number(weight.toFixed(2));
  return weight >= 0.5 ? `有效词条 · 权重 ${rounded}` : `次要有效 · 权重 ${rounded}`;
}

export function gradeClass(grade: string | null): string {
  if (!grade) return "grade-none";
  return `grade-${grade.toLowerCase().replace("+", "-plus")}`;
}

export function isPlanarSet(setGroup: { setId: number; parts: { slot: string }[] }): boolean {
  return (
    setGroup.setId >= 300 ||
    setGroup.parts.some((p) => p.slot === "PlanarSphere" || p.slot === "LinkRope")
  );
}

export function getSetHeaderIcon(setGroup: { setId: number; parts: { slot: string }[] }) {
  if (isPlanarSet(setGroup)) {
    return relicImage(setGroup.setId, "PlanarSphere") || relicImage(setGroup.setId, "Head");
  }
  return relicImage(setGroup.setId, "Head") || relicImage(setGroup.setId, "Body");
}

export function getStatThemeClass(mainStat: string): string {
  if (["CRIT Rate", "CRIT DMG"].includes(mainStat)) return "stat-crit";
  if (["Outgoing Healing Boost"].includes(mainStat)) return "stat-heal";
  if (["Energy Regeneration Rate"].includes(mainStat)) return "stat-energy";
  if (["SPD"].includes(mainStat)) return "stat-speed";
  if (mainStat.endsWith("DMG Boost")) return "stat-element";
  if (["Break Effect", "Effect Hit Rate"].includes(mainStat)) return "stat-special";
  return "stat-basic";
}

export function summarizeMainStatGroups(result: RelicMainStatGroupedResult | null) {
  if (!result) return null;
  let cavernCount = 0;
  let planarCount = 0;
  let cavernSets = 0;
  let planarSets = 0;
  const slotCounts: Record<string, number> = {
    Body: 0,
    Feet: 0,
    PlanarSphere: 0,
    LinkRope: 0,
    Head: 0,
    Hands: 0,
  };

  for (const group of result.groups) {
    const isPlanar = isPlanarSet(group);
    let groupTotal = 0;
    for (const part of group.parts) {
      const partCount = part.stats.reduce((acc, s) => acc + s.count, 0);
      groupTotal += partCount;
      slotCounts[part.slot] = (slotCounts[part.slot] || 0) + partCount;
    }
    if (isPlanar) {
      planarCount += groupTotal;
      planarSets += 1;
    } else {
      cavernCount += groupTotal;
      cavernSets += 1;
    }
  }

  return { cavernCount, planarCount, cavernSets, planarSets, slotCounts };
}

export function filterMainStatGroups(
  result: RelicMainStatGroupedResult | null,
  options: { searchQuery: string; slotFilter: string; categoryFilter: string },
) {
  if (!result) return [];
  const q = options.searchQuery.trim().toLowerCase();
  return result.groups
    .map((group) => {
      const isPlanar = isPlanarSet(group);
      if (options.categoryFilter === "cavern" && isPlanar) return null;
      if (options.categoryFilter === "planar" && !isPlanar) return null;
      if (q && !group.setName.toLowerCase().includes(q)) return null;

      let filteredParts = group.parts;
      if (options.slotFilter !== "all") {
        filteredParts = filteredParts.filter((p) => p.slot === options.slotFilter);
      }
      if (!filteredParts.length) return null;

      const groupTotal = filteredParts.reduce(
        (sum, p) => sum + p.stats.reduce((acc, s) => acc + s.count, 0),
        0,
      );

      return { ...group, parts: filteredParts, groupTotal, isPlanar };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);
}

export function groupFilteredSetsBySlot(
  filteredGroups: ReturnType<typeof filterMainStatGroups>,
  slotFilter: string,
) {
  const map = new Map<
    string,
    Array<{
      setName: string;
      setId: number;
      isPlanar: boolean;
      stats: Array<{ mainStat: string; count: number }>;
    }>
  >();

  for (const group of filteredGroups) {
    for (const part of group.parts) {
      if (!map.has(part.slot)) map.set(part.slot, []);
      map.get(part.slot)!.push({
        setName: group.setName,
        setId: group.setId,
        isPlanar: group.isPlanar,
        stats: part.stats,
      });
    }
  }

  return SCANNER_SLOTS.filter((s) => slotFilter === "all" || slotFilter === s.key)
    .map((s) => {
      const items = map.get(s.key) ?? [];
      const total = items.reduce(
        (sum, item) => sum + item.stats.reduce((acc, st) => acc + st.count, 0),
        0,
      );
      return { slot: s.key, label: s.label, icon: s.icon, items, total };
    })
    .filter((s) => s.items.length > 0);
}

export function buildUsefulnessRows(
  items: RelicListItem[],
  plans: BuildDashboardEntry[],
): ScannerUsefulnessRow[] {
  const planInputs = plans.map((entry) => ({
    characterId: entry.character.characterId,
    planLabel: entry.character.name,
    substatWeights: entry.plan.substatWeights,
    effectiveSubstats: entry.plan.effectiveSubstats,
    mainStats: entry.plan.mainStats,
    cavernMode: entry.plan.cavernMode,
    cavernSetA: entry.plan.cavernSetA,
    cavernSetB: entry.plan.cavernSetB,
    planarSetId: entry.plan.planarSetId,
    equippedRelics: (entry.character.equippedRelics ?? [])
      .filter((relic) => relic.slot != null)
      .map((relic) => ({
        slot: relic.slot!,
        mainStat: relic.mainStat,
        setId: relic.setId,
        substats: (relic.substats ?? []).map((s) => ({
          ...s,
          key: s.key ?? (s as { stat?: string }).stat,
        })),
      })),
  }));

  const recommendations = scanUpgradeRecommendations(
    items.map((item) => ({
      slot: item.slot,
      mainStat: item.mainStat,
      substats: (item.substats ?? []).map((s) => ({
        ...s,
        key: s.key ?? (s as { stat?: string }).stat,
      })),
      rarity: item.rarity,
      level: item.level,
      setId: item.setId,
      itemId: item.itemId,
      name: item.name,
      setName: item.setName,
    })),
    planInputs,
  );

  const itemById = new Map(items.map((item) => [item.itemId, item]));
  return recommendations
    .map((row) => {
      const item = itemById.get(row.relic.itemId ?? -1);
      if (!item) return null;
      const catalogueEntry = resolveCharacterCatalogue({
        characterId: row.characterId,
        name: row.planLabel ?? "",
      });
      const characterDisplayLabel = characterDisplayName({
        characterId: row.characterId,
        name: row.planLabel ?? "—",
      });
      const effectiveSubstatWeights: Record<string, number> = {};
      for (const entry of row.candidateScore.breakdown) {
        if (entry.weight > 0) {
          effectiveSubstatWeights[entry.key] = entry.weight;
        }
      }
      return {
        item,
        bestCharacterId: row.characterId,
        bestLabel: row.planLabel ?? "—",
        characterDisplayLabel,
        characterAvatar: catalogueEntry?.image ?? null,
        characterElement: catalogueEntry?.element ?? null,
        grade: row.candidateScore.letterGrade,
        weightedRolls: row.candidateScore.weightedRolls,
        equippedWeightedRolls: row.equippedScore?.weightedRolls ?? null,
        deltaWeightedRolls: row.deltaWeightedRolls,
        effectiveSubstatWeights,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
}
