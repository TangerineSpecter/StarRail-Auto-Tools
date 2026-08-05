import { describe, expect, it } from "vitest";
import {
  RADAR_SLOT_ORDER,
  clampDrawPct,
  normalizeRadarPieces,
  pointsToPolygonAttr,
  polarPoint,
  radiusForPct,
  ringPoints,
  valuePolygonPoints,
} from "@/features/build-planner/radar-geometry";

describe("radar-geometry", () => {
  it("normalizes pieces into fixed six-slot order and fills missing slots", () => {
    const axes = normalizeRadarPieces([
      { slot: "Body", potentialPct: 62, letterGrade: "S" },
      { slot: "Head", potentialPct: 40, letterGrade: "A" },
    ]);

    expect(axes.map((axis) => axis.slot)).toEqual([...RADAR_SLOT_ORDER]);
    expect(axes[0]).toMatchObject({
      slot: "Head",
      potentialPct: 40,
      drawPct: 40,
      letterGrade: "A",
      missing: false,
    });
    expect(axes[2]).toMatchObject({
      slot: "Body",
      potentialPct: 62,
      letterGrade: "S",
      missing: false,
    });
    expect(axes[1].missing).toBe(true);
    expect(axes[1].drawPct).toBe(0);
    expect(axes[1].letterGrade).toBeNull();
  });

  it("clamps draw percent into 0–100 while keeping raw potential", () => {
    expect(clampDrawPct(-5)).toBe(0);
    expect(clampDrawPct(40)).toBe(40);
    expect(clampDrawPct(140)).toBe(100);
    expect(clampDrawPct(Number.NaN)).toBe(0);

    const axes = normalizeRadarPieces([{ slot: "Feet", potentialPct: 120, letterGrade: "SS" }]);
    const feet = axes.find((axis) => axis.slot === "Feet");
    expect(feet?.potentialPct).toBe(120);
    expect(feet?.drawPct).toBe(100);
  });

  it("places the first axis straight up and returns six ring points", () => {
    const top = polarPoint(100, 100, 50, 0);
    expect(top.x).toBeCloseTo(100, 5);
    expect(top.y).toBeCloseTo(50, 5);

    const ring = ringPoints(100, 100, 50);
    expect(ring).toHaveLength(6);
    expect(pointsToPolygonAttr(ring).split(" ")).toHaveLength(6);
  });

  it("builds a value polygon scaled by drawPct", () => {
    const axes = normalizeRadarPieces(
      RADAR_SLOT_ORDER.map((slot) => ({ slot, potentialPct: 50, letterGrade: "B" })),
    );
    const points = valuePolygonPoints(axes, 100, 100, 80);
    expect(points).toHaveLength(6);
    // 50% of radius 80 on the top axis → y = 100 - 40
    expect(points[0].x).toBeCloseTo(100, 5);
    expect(points[0].y).toBeCloseTo(60, 5);
  });

  it("maps threshold percent to ring radius", () => {
    expect(radiusForPct(40, 100)).toBe(40);
    expect(radiusForPct(0, 100)).toBe(0);
    expect(radiusForPct(150, 100)).toBe(100);
  });
});
