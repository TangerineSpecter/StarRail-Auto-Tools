import { describe, expect, it } from "vitest";
import {
  buildTargetProgress,
  effectiveSubstatCounts,
  lowestTargetPercent,
  relicPieceCounts,
} from "@/features/build-planner/progress";

describe("buildTargetProgress", () => {
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
              { kind: "normal", key: "SPD", count: 3 },
              { kind: "reroll", key: "SPD", count: 2 },
            ],
          },
          {
            substats: [
              { kind: "normal", key: "CRIT Rate", count: 2 },
              { kind: "normal", key: "HP", count: 5 },
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
