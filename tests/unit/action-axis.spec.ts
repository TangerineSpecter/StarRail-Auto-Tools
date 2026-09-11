import { describe, expect, it } from "vitest";
import {
  actionAxisHorizon,
  actionCycleAt,
  countStaticActions,
  cycleBoundaries,
  simulateStaticActionAxis,
} from "@/shared/utils/action-axis";

describe("static action axis", () => {
  it("uses 150 AV for the first cycle and 100 AV afterwards", () => {
    expect(actionAxisHorizon(1)).toBe(150);
    expect(actionAxisHorizon(10)).toBe(1050);
    expect(cycleBoundaries(3)).toEqual([150, 250, 350]);
  });

  it("matches the common 134 SPD breakpoint", () => {
    expect(countStaticActions({ speed: 134, cycles: 1 })).toBe(2);
    expect(countStaticActions({ speed: 134, cycles: 10 })).toBe(14);
  });

  it("places boundary actions in the cycle that ends at that boundary", () => {
    expect(actionCycleAt(150)).toBe(1);
    expect(actionCycleAt(150.001)).toBe(2);
    expect(actionCycleAt(250)).toBe(2);
  });

  it("applies one-time battle-entry action advance only to the first action", () => {
    const events = simulateStaticActionAxis({ speed: 100, cycles: 1, initialAdvance: 0.4 });
    expect(events.map((event) => event.actionValue)).toEqual([60]);
    expect(events[0]?.initialAdvanceApplied).toBe(true);
  });

  it("keeps exact speed decimals around action breakpoints", () => {
    expect(countStaticActions({ speed: 133.333, cycles: 1 })).toBe(1);
    expect(countStaticActions({ speed: 133.334, cycles: 1 })).toBe(2);
  });

  it("rejects invalid speed, cycles and advance values", () => {
    expect(() => simulateStaticActionAxis({ speed: 0, cycles: 1 })).toThrow();
    expect(() => simulateStaticActionAxis({ speed: 100, cycles: 11 })).toThrow();
    expect(() =>
      simulateStaticActionAxis({ speed: 100, cycles: 1, initialAdvance: 1.1 }),
    ).toThrow();
  });
});
