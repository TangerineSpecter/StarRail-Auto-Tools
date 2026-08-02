import { describe, expect, it } from "vitest";
import { summarizeSetTargets } from "@/features/catalogue/set-target-summary";

describe("summarizeSetTargets", () => {
  it("unions cavern keep stats and excludes fixed head and hands main stats", () => {
    const summary = summarizeSetTargets("cavern", [
      {
        effectiveSubstats: ["CRIT Rate", "SPD"],
        mainStats: { Head: ["HP"], Body: ["CRIT Rate"], Feet: ["SPD"] },
      },
      {
        effectiveSubstats: ["CRIT DMG", "SPD"],
        mainStats: { Hands: ["ATK"], Body: ["CRIT DMG"], Feet: ["ATK%"] },
      },
    ]);

    expect(summary.substats).toEqual(["SPD", "CRIT Rate", "CRIT DMG"]);
    expect(summary.mainStats).toEqual([
      { slot: "Body", stats: ["CRIT Rate", "CRIT DMG"] },
      { slot: "Feet", stats: ["ATK%", "SPD"] },
    ]);
  });

  it("uses planar ornament slots only", () => {
    const summary = summarizeSetTargets("planar", [
      {
        effectiveSubstats: ["Break Effect"],
        mainStats: {
          PlanarSphere: ["Fire DMG Boost"],
          LinkRope: ["Energy Regeneration Rate"],
        },
      },
    ]);

    expect(summary.mainStats).toEqual([
      { slot: "PlanarSphere", stats: ["Fire DMG Boost"] },
      { slot: "LinkRope", stats: ["Energy Regeneration Rate"] },
    ]);
  });
});
