import { describe, expect, it } from "vitest";
import {
  buildTargetProgress,
  effectiveSubstatCounts,
  formatBuildProgressValue,
  lowestTargetPercent,
  relicPieceCounts,
} from "@/features/build-planner/progress";

describe("buildTargetProgress", () => {
  it("formats flat progress stats without decimal places", () => {
    expect(formatBuildProgressValue("ATK", 3295.04)).toBe("3295");
    expect(formatBuildProgressValue("SPD", 25.03)).toBe("25");
    expect(formatBuildProgressValue("CRIT Rate", 61.94)).toBe("61.9");
  });

  it("keeps progress above 100 percent and reports shortages", () => {
    const progress = buildTargetProgress(
      [
        { statKey: "SPD", target: 180, minimum: 160, priority: 1 },
        { statKey: "CRIT Rate", target: 80, minimum: 65, priority: 2 },
      ],
      [
        { key: "speed", value: 160 },
        { key: "critRate", value: 92 },
      ],
    );
    expect(progress[0]).toMatchObject({ current: 160, gap: 20 });
    expect(progress[0].percent).toBeCloseTo(88.8889, 4);
    expect(progress[1]).toMatchObject({ current: 92, gap: 0 });
    expect(progress[1].percent).toBeCloseTo(115, 4);
  });

  it("counts only configured normal equipped substats", () => {
    expect(
      effectiveSubstatCounts(
        [
          {
            substats: [
              { kind: "normal", key: "SPD", count: 4 },
              { kind: "reroll", key: "SPD", count: 2 },
            ],
          },
          {
            substats: [
              { kind: "normal", key: "CRIT Rate", count: 3 },
              { kind: "normal", key: "HP", count: 6 },
            ],
          },
        ],
        ["SPD", "CRIT Rate"],
      ),
    ).toEqual([
      { key: "SPD", count: 3 },
      { key: "CRIT Rate", count: 2 },
    ]);
  });

  it("does not count the initial roll as an enhancement hit", () => {
    // Live inventory: count is total rolls including initial (never 0 on a real line).
    expect(
      effectiveSubstatCounts(
        [
          {
            substats: [
              { kind: "normal", key: "SPD", count: 1 },
              { kind: "normal", key: "CRIT Rate", count: 6 },
              { kind: "normal", key: "HP", count: 1 },
            ],
          },
        ],
        ["SPD", "CRIT Rate", "HP"],
      ),
    ).toEqual([{ key: "CRIT Rate", count: 5 }]);
  });

  it("uses legacy enhancement-hit counts when any line is 0", () => {
    expect(
      effectiveSubstatCounts(
        [
          {
            substats: [
              { kind: "normal", key: "SPD", count: 0 },
              { kind: "normal", key: "CRIT Rate", count: 2 },
            ],
          },
        ],
        ["SPD", "CRIT Rate"],
      ),
    ).toEqual([{ key: "CRIT Rate", count: 2 }]);
  });

  it("finds the lowest progress without forcing it to zero", () => {
    expect(lowestTargetPercent([{ percent: 82 }, { percent: 65.5 }])).toBe(65.5);
  });

  it("counts equipped relic pieces by set for target matching", () => {
    expect(relicPieceCounts([{ setId: 101 }, { setId: 101 }, { setId: 301 }])).toEqual(
      new Map([
        [101, 2],
        [301, 1],
      ]),
    );
  });
});
