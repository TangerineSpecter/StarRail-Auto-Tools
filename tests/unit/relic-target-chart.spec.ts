import { describe, expect, it } from "vitest";
import { sortRelicSetsByTargetCount } from "@/features/catalogue/relic-target-chart";

const set = (id: number, name: string) => ({
  id,
  name,
  kind: "cavern" as const,
  effects: { twoPiece: "", fourPiece: "" },
  image: null,
});

describe("sortRelicSetsByTargetCount", () => {
  it("sorts descending, includes zero-count sets, and stabilizes ties by name", () => {
    const items = sortRelicSetsByTargetCount(
      [set(3, "乙套"), set(1, "甲套"), set(2, "丙套")],
      [
        { setId: 3, count: 1 },
        { setId: 2, count: 4 },
      ],
    );

    expect(items.map((item) => [item.set.name, item.targetCount])).toEqual([
      ["丙套", 4],
      ["乙套", 1],
      ["甲套", 0],
    ]);
  });

  it("uses the set id as a final tie breaker", () => {
    const items = sortRelicSetsByTargetCount([set(12, "同名"), set(4, "同名")], []);

    expect(items.map((item) => item.set.id)).toEqual([4, 12]);
  });
});
