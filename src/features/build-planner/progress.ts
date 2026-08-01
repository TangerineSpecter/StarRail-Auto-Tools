import type { BuildTarget } from "@/types";

type StandingStat = { key: string; value: number };

export type TargetProgress = BuildTarget & {
  current: number | null;
  percent: number | null;
  gap: number | null;
};

const standingKeyByBuildKey: Record<string, string> = {
  HP: "hp",
  ATK: "attack",
  DEF: "defense",
  SPD: "speed",
  "CRIT Rate": "critRate",
  "CRIT DMG": "critDmg",
  "Effect Hit Rate": "effectHitRate",
  "Effect RES": "effectRes",
  "Break Effect": "breakEffect",
  "Outgoing Healing Boost": "healingBoost",
  "Energy Regeneration Rate": "energyRegen",
  "Physical DMG Boost": "physicalDmg",
  "Fire DMG Boost": "fireDmg",
  "Ice DMG Boost": "iceDmg",
  "Lightning DMG Boost": "lightningDmg",
  "Wind DMG Boost": "windDmg",
  "Quantum DMG Boost": "quantumDmg",
  "Imaginary DMG Boost": "imaginaryDmg",
};

export function buildTargetProgress(
  targets: BuildTarget[],
  standingStats: StandingStat[],
): TargetProgress[] {
  const values = new Map(standingStats.map((stat) => [stat.key, stat.value]));
  return [...targets]
    .sort((left, right) => left.priority - right.priority)
    .map((target) => {
      const current = values.get(standingKeyByBuildKey[target.statKey]);
      if (current === undefined || target.target <= 0) {
        return { ...target, current: null, percent: null, gap: null };
      }
      return {
        ...target,
        current,
        percent: (current / target.target) * 100,
        gap: Math.max(0, target.target - current),
      };
    });
}

export function lowestTargetPercent(targets: Array<Pick<TargetProgress, "percent">>): number {
  return Math.min(...targets.map((target) => target.percent ?? 0));
}

export function effectiveSubstatCounts(
  relics: Array<{ substats?: Array<{ kind: string; key: string; count: number }> }>,
  effectiveSubstats: string[],
) {
  const selected = new Set(effectiveSubstats);
  const counts = new Map<string, number>();
  for (const relic of relics) {
    for (const stat of relic.substats ?? []) {
      if (stat.kind === "normal" && selected.has(stat.key)) {
        counts.set(stat.key, (counts.get(stat.key) ?? 0) + stat.count);
      }
    }
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count }));
}
