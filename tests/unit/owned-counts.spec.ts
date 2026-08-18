import { describe, expect, it } from "vitest";
import {
  formatOwnedCount,
  lightConeOwnedCountMap,
  ownedCountOf,
  relicOwnedCountMap,
} from "@/features/catalogue/owned-counts";

const counts = {
  relics: [
    { setId: 101, count: 12 },
    { setId: 301, count: 4 },
  ],
  lightCones: [
    { templateId: 20000, count: 2 },
    { templateId: 23062, count: 1 },
  ],
};

describe("owned-counts", () => {
  it("maps relic set and light cone template counts", () => {
    const relics = relicOwnedCountMap(counts);
    const lightCones = lightConeOwnedCountMap(counts);

    expect(ownedCountOf(relics, 101)).toBe(12);
    expect(ownedCountOf(relics, 301)).toBe(4);
    expect(ownedCountOf(relics, 999)).toBe(0);
    expect(ownedCountOf(lightCones, 20000)).toBe(2);
    expect(ownedCountOf(lightCones, 21000)).toBe(0);
  });

  it("formats an owned count without exposing catalogue ids", () => {
    expect(formatOwnedCount(12, "件")).toBe("持有 12 件");
    expect(formatOwnedCount(2, "把")).toBe("持有 2 把");
    expect(formatOwnedCount(0, "件")).toBe("未持有");
    expect(formatOwnedCount(0, "把")).not.toContain("#");
  });
});
