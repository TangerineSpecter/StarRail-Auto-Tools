import { describe, expect, it } from "vitest";
import definitions from "@/data/standing-rule-definitions.json";
import lightCones from "@/data/light-cones.json";
import relics from "@/data/relic-sets.json";
import bindings from "@/data/standing-rule-bindings.json";
import rawCatalogue from "@/data/catalogue-mechanics.json";
import fingerprints from "@/data/catalogue-mechanics-fingerprints.json";
import { staticSetStats } from "@/shared/utils/standing-stats";
// @ts-expect-error Sync helpers intentionally run as native JavaScript.
import {
  bindStandingDefinition,
  reviewedEffectsHash,
  resolveStandingCurve,
  renderAbilityEffects,
  standingDefinitionMatches,
} from "../../scripts/lib/standing-rule-definitions.mjs";

describe("curated standing review", () => {
  it("ties all 261 protected bindings to exact all-level evidence and the same fingerprint batch", () => {
    expect(Object.keys(bindings.lightCones)).toHaveLength(169);
    expect(Object.keys(bindings.relics)).toHaveLength(60);
    const sources = new Map(rawCatalogue.abilities.map((ability) => [ability.id, ability]));
    let count = 0;
    const check = (binding: { sourceRef: string; sourceHash: string }, definition: unknown) => {
      const ability = sources.get(binding.sourceRef);
      expect(ability).toBeDefined();
      expect(bindStandingDefinition(definition, ability)?.sourceHash).toBe(binding.sourceHash);
      expect(fingerprints[binding.sourceRef as keyof typeof fingerprints]).toBe(binding.sourceHash);
      count++;
    };
    for (const [id, binding] of Object.entries(bindings.lightCones))
      check(binding, definitions.lightCones[id as keyof typeof definitions.lightCones]);
    for (const [id, parts] of Object.entries(bindings.relics))
      for (const [slot, binding] of Object.entries(parts))
        check(
          binding,
          definitions.relics[id as keyof typeof definitions.relics][
            slot as "twoPiece" | "fourPiece"
          ],
        );
    expect(count).toBe(261);
  });
  it("preserves source integer rounding at negative half ties and explicit percent precision", () => {
    expect(
      renderAbilityEffects({
        levels: [1],
        descriptionTemplate:
          "{p1:integer}/{p2:percentInteger}/{p3:percentFixed1}/{p3:percentFixed2}",
        parameters: {
          p1: { kind: "constant", value: -7.5 },
          p2: { kind: "constant", value: -0.075 },
          p3: { kind: "constant", value: 0.0029999998 },
        },
      }),
    ).toEqual(["-7/-7%/0.3%/0.30%"]);
  });
  it("preserves every previously parsed standing bonus at all ranks", () => {
    for (const cone of lightCones.lightCones) {
      // Old parser crossed current-HP, kill-stack, and HP-change prerequisites.
      if ([20016, 21027, 22003].includes(cone.id)) continue;
      const block = definitions.lightCones[String(cone.id) as keyof typeof definitions.lightCones];
      cone.skill.effects.forEach((effect, index) => {
        const actual = block.bonuses.map((bonus) => ({
          key: bonus.key,
          value: resolveStandingCurve(bonus.curve, index + 1),
        }));
        for (const prior of staticSetStats([effect]))
          expect(actual, `${cone.id}/${index + 1}`).toContainEqual(prior);
      });
    }
    for (const set of relics.sets) {
      const block = definitions.relics[String(set.id) as keyof typeof definitions.relics];
      for (const part of ["twoPiece", "fourPiece"] as const) {
        // Memosprite-in-field and holding a supplied shield are combat prerequisites.
        if ([123, 128].includes(set.id) && part === "fourPiece") continue;
        if (set.id === 325 && part === "twoPiece") continue; // First combat elation threshold.
        const actual = block[part].bonuses.map((bonus) => ({
          key: bonus.key,
          value: resolveStandingCurve(bonus.curve),
        }));
        for (const prior of staticSetStats([set.effects[part]]))
          expect(actual, `${set.id}/${part}`).toContainEqual(prior);
      }
    }
    expect(() => resolveStandingCurve(definitions.lightCones[23036].bonuses[0].curve, 6)).toThrow();
  });
  it("explicitly covers every current ID and every rank, including empty standing outcomes", () => {
    expect(Object.keys(definitions.lightCones)).toHaveLength(169);
    expect(Object.keys(definitions.relics)).toHaveLength(60);
    for (const cone of lightCones.lightCones) {
      const block = definitions.lightCones[String(cone.id) as keyof typeof definitions.lightCones];
      expect(standingDefinitionMatches(block, cone.skill.effects), cone.name).toBe(true);
      expect(block.review.combat).toBe("incomplete");
      for (const bonus of block.bonuses)
        for (let rank = 1; rank <= 5; rank++) {
          expect(Number.isFinite(resolveStandingCurve(bonus.curve, rank))).toBe(true);
        }
    }
    for (const set of relics.sets) {
      const block = definitions.relics[String(set.id) as keyof typeof definitions.relics];
      for (const part of ["twoPiece", "fourPiece"] as const) {
        expect(
          standingDefinitionMatches(block[part], [set.effects[part]]),
          `${set.name}/${part}`,
        ).toBe(true);
      }
    }
  });

  it("excludes triggered and team gains but retains permanent penalties and resist wording", () => {
    expect(definitions.lightCones[20000].bonuses).toEqual([]);
    expect(definitions.lightCones[21024].bonuses).toEqual([]);
    expect(definitions.lightCones[24000].bonuses).toEqual([]);
    expect(definitions.relics[124].fourPiece.bonuses[0]).toEqual({
      key: "SPD%",
      curve: { kind: "constant", value: -0.08 },
    });
    expect(definitions.relics[310].twoPiece.bonuses[0].key).toBe("Effect RES");
    expect(definitions.lightCones[23005].bonuses).toHaveLength(2);
  });

  it("keeps conversion caps in ratios and base speed in flat units", () => {
    const galaxy = definitions.relics[303].twoPiece.conversions[0];
    expect(
      Math.min(0.5 * resolveStandingCurve(galaxy.ratio), resolveStandingCurve(galaxy.cap)),
    ).toBe(0.125);
    expect(Math.min(2 * resolveStandingCurve(galaxy.ratio), resolveStandingCurve(galaxy.cap))).toBe(
      0.25,
    );
    const healing = definitions.lightCones[21014].conversions[0];
    expect(resolveStandingCurve(healing.ratio, 5)).toBe(0.45);
    expect(resolveStandingCurve(healing.cap, 5)).toBe(0.27);
    expect(resolveStandingCurve(definitions.lightCones[23036].bonuses[0].curve, 5)).toBe(20);
    const energy = definitions.lightCones[23058].conversions[0];
    expect(
      Math.min(
        Math.max(480 - energy.inputOffset, 0) * resolveStandingCurve(energy.ratio),
        resolveStandingCurve(energy.cap),
      ),
    ).toBeCloseTo(0.108);
  });

  it("gates fresh raw hashes on all rendered ranks, without assuming parameter positions", () => {
    const block = definitions.lightCones[20003];
    const ability = {
      id: "lightCone:20003:skill",
      sourceHash: "fresh-raw-hash",
      levels: [1, 2, 3, 4, 5],
      descriptionTemplate:
        "使装备者的防御力提高 {p2:percent} 。当装备者当前生命值百分比小于 50% 时，其防御力额外提高 {p2:percent} 。",
      parameters: {
        p1: { kind: "constant", value: 999 },
        p2: { kind: "table", levels: [1, 2, 3, 4, 5], values: [0.16, 0.2, 0.24, 0.28, 0.32] },
      },
    };
    expect(bindStandingDefinition(block, ability)?.sourceHash).toBe("fresh-raw-hash");
    expect(
      bindStandingDefinition(block, {
        ...ability,
        descriptionTemplate: ability.descriptionTemplate.replace("50%", "49%"),
      }),
    ).toBeNull();
    expect(
      bindStandingDefinition(block, {
        ...ability,
        parameters: { p2: { kind: "constant", value: 0.16 } },
      }),
    ).toBeNull();
    expect(
      bindStandingDefinition(block, {
        ...ability,
        parameters: {
          p2: { kind: "table", levels: [1, 2, 3, 4], values: [0.16, 0.2, 0.24, 0.28] },
        },
      }),
    ).toBeNull();
    expect(
      standingDefinitionMatches({ ...block, reviewedEffectsHash: "fake" }, block.reviewedEffects),
    ).toBe(false);
    expect(reviewedEffectsHash(["攻击力提高 12 % 。"])).toBe(
      reviewedEffectsHash(["攻击力提高12%。"]),
    );
    expect(reviewedEffectsHash(["攻击力提高13%。"])).not.toBe(
      reviewedEffectsHash(["攻击力提高12%。"]),
    );
  });
});
