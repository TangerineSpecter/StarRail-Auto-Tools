import { describe, expect, it, vi } from "vitest";
import bindings from "@/data/standing-rule-bindings.json";
import fingerprints from "@/data/catalogue-mechanics-fingerprints.json";
import lightCones from "@/data/light-cones.json";
import definitions from "@/data/standing-rule-definitions.json";
import { reviewedStandingRules, standingEquipment } from "@/shared/utils/standing-rule-catalogue";
import { calculateStandingStats } from "@/shared/utils/standing-stats";

describe("reviewed standing ID reader", () => {
  it("approves all reviewed equipment IDs with exact protected provenance", () => {
    expect(Object.keys(definitions.lightCones)).toHaveLength(169);
    expect(Object.keys(definitions.relics)).toHaveLength(60);
    let bindingCount = Object.keys(bindings.lightCones).length;
    for (const cone of lightCones.lightCones) {
      const result = reviewedStandingRules({
        lightConeId: cone.id,
        superimposition: 1,
        sets: [],
        characterPath: cone.path,
        entityStats: { "Max Energy": 200 },
      });
      expect(result.unreviewedSources, cone.name).toEqual([]);
      expect(result.missingInputs, cone.name).toEqual([]);
      const binding = bindings.lightCones[String(cone.id) as keyof typeof bindings.lightCones];
      for (const item of [...result.contributions, ...result.conversions])
        expect(item).toEqual(expect.objectContaining(binding));
    }
    for (const [id, parts] of Object.entries(bindings.relics)) {
      bindingCount += Object.keys(parts).length;
      const result = reviewedStandingRules({
        lightConeId: 0,
        superimposition: 1,
        sets: [{ setId: Number(id), count: 4 }],
      });
      expect(result.unreviewedSources).toEqual([]);
      for (const item of [...result.contributions, ...result.conversions])
        expect(Object.values(parts)).toContainEqual({
          sourceRef: item.sourceRef,
          sourceHash: item.sourceHash,
        });
    }
    expect(bindingCount).toBe(261);
  });

  it("accepts normalized matching paths and excludes mismatched or unknown equipped paths", () => {
    const equipment = { lightConeId: 23005, superimposition: 1, sets: [{ setId: 102, count: 2 }] };
    for (const characterPath of ["Preservation", "存护"]) {
      expect(
        reviewedStandingRules({ ...equipment, characterPath }).contributions.some(
          (c) => c.sourceId === "lightCone/23005",
        ),
      ).toBe(true);
    }
    const mismatch = reviewedStandingRules({ ...equipment, characterPath: "Hunt" });
    expect(mismatch.contributions.map((c) => c.sourceId)).toEqual(["relic/102/2"]);
    const unknown = reviewedStandingRules({ ...equipment, characterPath: "" });
    expect(unknown.missingInputs).toEqual(["character.path"]);
    expect(unknown.contributions.map((c) => c.sourceId)).toEqual(["relic/102/2"]);
  });

  it("fails closed for changed or absent current fingerprints even with unchanged old text", async () => {
    const ref = bindings.lightCones[23005].sourceRef;
    try {
      for (const stale of ["changed-source-hash", undefined]) {
        vi.resetModules();
        vi.doMock("@/data/catalogue-mechanics-fingerprints.json", () => ({
          default: { ...fingerprints, [ref]: stale },
        }));
        const reader = await import("@/shared/utils/standing-rule-catalogue");
        const result = reader.reviewedStandingRules({
          lightConeId: 23005,
          superimposition: 1,
          sets: [{ setId: 102, count: 2 }],
        });
        expect(result.unreviewedSources).toEqual(["lightCone/23005"]);
        expect(result.contributions.map((c) => c.sourceId)).toEqual(["relic/102/2"]);
        expect(result.conversions).toEqual([]);
      }
    } finally {
      vi.doUnmock("@/data/catalogue-mechanics-fingerprints.json");
      vi.resetModules();
    }
  });
  it("resolves exact rank bonuses and combines duplicate set counts", () => {
    const result = reviewedStandingRules({
      lightConeId: 23005,
      superimposition: 5,
      sets: [
        { setId: 102, count: 2 },
        { setId: 102, count: 2 },
      ],
    });
    expect(result.contributions).toEqual([
      { sourceId: "lightCone/23005", ...bindings.lightCones[23005], key: "DEF%", value: 0.4 },
      {
        sourceId: "lightCone/23005",
        ...bindings.lightCones[23005],
        key: "Effect Hit Rate",
        value: 0.4,
      },
      { sourceId: "relic/102/2", ...bindings.relics[102].twoPiece, key: "ATK%", value: 0.12 },
      { sourceId: "relic/102/4", ...bindings.relics[102].fourPiece, key: "SPD%", value: 0.06 },
    ]);
    expect(result.unreviewedSources).toEqual([]);
    expect(result.missingInputs).toEqual([]);
  });

  it("distinguishes reviewed empty outcomes from unknown IDs and unsupported ranks", () => {
    expect(
      reviewedStandingRules({ lightConeId: 20000, superimposition: 1, sets: [] }).unreviewedSources,
    ).toEqual([]);
    expect(
      reviewedStandingRules({ lightConeId: 99999, superimposition: 1, sets: [] }).unreviewedSources,
    ).toEqual(["lightCone/99999"]);
    const unsupported = reviewedStandingRules({ lightConeId: 23036, superimposition: 6, sets: [] });
    expect(unsupported.contributions).toEqual([]);
    expect(unsupported.unreviewedSources).toEqual(["lightCone/23036"]);
  });

  it("reports unknown energy dependency without emitting a zero-derived conversion", () => {
    for (const entityStats of [
      undefined,
      {},
      { "Max Energy": Number.NaN },
      { "Max Energy": Infinity },
    ]) {
      const result = reviewedStandingRules({
        lightConeId: 23058,
        superimposition: 1,
        sets: [],
        entityStats,
      });
      expect(result.missingInputs).toEqual(["lightCone/23058:Max Energy"]);
      expect(result.conversions).toEqual([]);
      expect(result.unreviewedSources).toEqual([]);
      expect(result.contributions).toContainEqual({
        sourceId: "lightCone/23058",
        ...bindings.lightCones[23058],
        key: "Energy Regeneration Rate",
        value: 0.1,
      });
    }
  });

  it("resolves supplied energy state with explicit offset and cap", () => {
    const equipment = {
      lightConeId: 23058,
      superimposition: 1,
      sets: [],
      entityStats: { "Max Energy": 200 },
    };
    const result = reviewedStandingRules(equipment);
    expect(result.missingInputs).toEqual([]);
    expect(result.conversions).toEqual([
      {
        sourceId: "lightCone/23058",
        ...bindings.lightCones[23058],
        key: "Energy Regeneration Rate",
        inputKey: "Max Energy",
        ratio: 0.0003,
        cap: 0.108,
        inputOffset: 120,
      },
    ]);
    const input = {
      characterBase: { hp: 1000, attack: 500, defense: 500, speed: 100, taunt: 100 },
      lightConeBase: { hp: 0, attack: 0, defense: 0 },
      relics: [],
      traces: [],
      equipment,
    };
    for (const [energy, expected] of [
      [100, 110],
      [120, 110],
      [200, 112.4],
      [480, 120.8],
      [600, 120.8],
    ]) {
      const stats = calculateStandingStats({
        ...input,
        equipment: { ...equipment, entityStats: { "Max Energy": energy } },
      });
      expect(stats.find((stat) => stat.key === "energyRegen")?.value).toBeCloseTo(expected);
    }
  });

  it("takes ID rules ahead of conflicting legacy text and preserves base-speed units", () => {
    const stats = calculateStandingStats({
      characterBase: { hp: 1000, attack: 500, defense: 500, speed: 100, taunt: 100 },
      lightConeBase: { hp: 0, attack: 0, defense: 0 },
      relics: [],
      traces: [],
      lightConeEffects: ["使装备者的速度提高 99% 。"],
      setEffects: ["攻击力提高 99% 。"],
      equipment: { lightConeId: 23036, superimposition: 5, sets: [{ setId: 102, count: 4 }] },
    });
    expect(stats.find((stat) => stat.key === "speed")?.value).toBe(127);
    expect(stats.find((stat) => stat.key === "attack")?.value).toBe(560);
    expect(
      standingEquipment({ templateId: 23036, superimposition: 5 }, [
        { setId: 102 },
        { setId: 102 },
      ]),
    ).toEqual({ lightConeId: 23036, superimposition: 5, sets: [{ setId: 102, count: 2 }] });
  });
});
