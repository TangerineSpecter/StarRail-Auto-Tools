import { dashboard, relics } from "./mobile-fixtures";
import type { RelicMainStatGroupedResult, RelicMainStatSetGroup } from "@/types";

/** Mirrors the real scan's union-of-plan main stats and unequipped-only scope. */
export function mobileMainStatScan(): RelicMainStatGroupedResult {
  const allowedMainStats: Record<string, string[]> = {};
  for (const { plan } of dashboard) {
    for (const [slot, stats] of Object.entries(plan.mainStats)) {
      if (stats.length)
        allowedMainStats[slot] = [...new Set([...(allowedMainStats[slot] ?? []), ...stats])].sort();
    }
  }
  if (dashboard.length) {
    allowedMainStats.Head = ["HP"];
    allowedMainStats.Hands = ["ATK"];
  }
  const candidates = relics.filter(
    (item) =>
      item.equippedCharacterId === null && !allowedMainStats[item.slot]?.includes(item.mainStat),
  );
  const groups = new Map<number, RelicMainStatSetGroup>();
  for (const item of candidates) {
    let group = groups.get(item.setId);
    if (!group) {
      group = { setId: item.setId, setName: item.setName, parts: [] };
      groups.set(item.setId, group);
    }
    let part = group.parts.find((row) => row.slot === item.slot);
    if (!part) {
      part = { slot: item.slot, stats: [] };
      group.parts.push(part);
    }
    const stat = part.stats.find((row) => row.mainStat === item.mainStat);
    if (stat) stat.count += 1;
    else part.stats.push({ mainStat: item.mainStat, count: 1 });
  }
  return {
    groups: [...groups.values()],
    total: candidates.length,
    planCount: dashboard.length,
    allowedMainStats,
  };
}
