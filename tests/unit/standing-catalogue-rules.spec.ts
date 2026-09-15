import { describe, expect, it } from "vitest";
import definitions from "@/data/standing-rule-definitions.json";
import rawCatalogue from "@/data/catalogue-mechanics.json";
import compiled from "@/data/standing-catalogue-rules.json";
import type { MechanicCatalogue } from "@/shared/contracts/catalogue-rules";
import type {
  CatalogueAbility,
  CatalogueRule,
  RuleEvaluationContext,
} from "@/shared/contracts/catalogue-rules";
import { evaluateRules, validateCatalogueRules } from "@/shared/utils/catalogue-rules";
// @ts-expect-error Native sync module.
import { buildStandingCatalogueRules } from "../../scripts/lib/standing-catalogue-rules.mjs";

const cone: CatalogueAbility = {
  id: "lightcone:20003:skill",
  sourceNodeId: "skill",
  ownerId: "lightcone:20003",
  groupId: "skill",
  slot: "skill",
  name: "琥珀",
  descriptionTemplate:
    "使装备者的防御力提高 {p2:percent} 。当装备者当前生命值百分比小于 50% 时，其防御力额外提高 {p2:percent} 。",
  levelBinding: "superimposition",
  levels: [1, 2, 3, 4, 5],
  sourceKind: "lightCone",
  sourceHash: "raw",
  parameters: {
    p1: { kind: "constant", value: 999 },
    p2: { kind: "table", levels: [1, 2, 3, 4, 5], values: [0.16, 0.2, 0.24, 0.28, 0.32] },
  },
};
const context: RuleEvaluationContext = {
  environment: "standing",
  bindings: { superimposition: 5 },
  values: {
    "equipment.lightConeId": 20003,
    "equipment.superimposition": 5,
    "binding.superimposition": 5,
    "equipment.lightConePath": "存护",
    "character.path": "存护",
  },
  targets: [{ id: "self", kind: "self", values: {} }],
};
const build = (
  ability = cone,
  definition: unknown = definitions.lightCones[20003],
  selector: unknown = { lightConeId: 20003, path: "存护" },
) =>
  buildStandingCatalogueRules({ ability, definition, selector }) as {
    rules: CatalogueRule[];
    rejected: Array<{ reason: string }>;
  };

describe("standing canonical rule builder", () => {
  it("publishes valid partial canonical rules with explicit unmatched-source outcomes", () => {
    expect(compiled.rules).toHaveLength(160);
    expect(compiled.review.accepted).toBe(255);
    expect(compiled.review.empty).toBe(95);
    expect(compiled.review.fullMechanics).toBe("incomplete");
    expect(compiled.rejected).toHaveLength(6);
    expect(
      validateCatalogueRules(
        rawCatalogue as unknown as MechanicCatalogue,
        compiled.rules as CatalogueRule[],
      ).valid,
    ).toBe(true);
  });
  it("accepts authentic lowercase raw owner identities and rejects aliases", () => {
    const raw = rawCatalogue.abilities.find(
      (a) => a.ownerId === "lightcone:20003",
    )! as CatalogueAbility;
    expect(raw).toBeDefined();
    const result = build(raw);
    expect(result.rejected).toEqual([]);
    expect(result.rules[0]?.sourceRef).toBe(raw.id);
    expect(result.rules[0]?.sourceHash).toBe(raw.sourceHash);
    expect(result.rules[0]?.effects[0]?.expression).toEqual({ kind: "param", key: "p1" });
    expect(build({ ...raw, ownerId: "lightCone:20003" }).rejected[0]?.reason).toBe(
      "identity-mismatch",
    );
  });
  it("compiles energy offset and capped ratio, leaving missing entity state unknown", () => {
    const definition = definitions.lightCones[23058];
    const ability: CatalogueAbility = {
      ...(rawCatalogue.abilities.find((a) => a.ownerId === "lightcone:23058")! as CatalogueAbility),
      levelBinding: "superimposition",
    };
    const result = build(ability, definition, { lightConeId: 23058, path: "欢愉" });
    expect(result.rejected).toEqual([]);
    const catalogue = { schemaVersion: 1 as const, abilities: [ability] };
    const ctx: RuleEvaluationContext = {
      ...context,
      bindings: { superimposition: 1 },
      values: {
        "equipment.lightConeId": 23058,
        "equipment.superimposition": 1,
        "binding.superimposition": 1,
        "equipment.lightConePath": "欢愉",
        "character.path": "欢愉",
      },
    };
    expect(
      evaluateRules(catalogue, result.rules, ctx).trace.some(
        (t) => t.reason === "unknown" && t.missingKeys?.includes("context:entity.maxEnergy"),
      ),
    ).toBe(true);
    const expression = result.rules[0]!.effects[2]!.expression;
    expect(JSON.stringify(expression)).toContain('"key":"p5"');
    expect(JSON.stringify(expression)).toContain('"key":"p6"');
    expect(JSON.stringify(expression)).toContain('"key":"p7"');
    for (const [energy, expected] of [
      [100, 0],
      [200, 0.024],
      [600, 0.108],
    ]) {
      const evaluated = evaluateRules(catalogue, result.rules, {
        ...ctx,
        targets: [{ id: "self", kind: "self", values: { "entity.maxEnergy": energy } }],
      });
      expect(
        evaluated.contributions.find(
          (c) => c.stat === "Energy Regeneration Rate" && c.id.includes("conversion:0"),
        )?.value,
      ).toBeCloseTo(expected!);
    }
  });
  it("binds raw params after exact all-rank evidence and validates canonical AST", () => {
    const result = build();
    expect(result.rejected).toEqual([]);
    expect(result.rules[0]?.effects[0]?.expression).toEqual({ kind: "param", key: "p2" });
    expect(result.rules[0]?.sourceHash).toBe("raw");
    expect(
      validateCatalogueRules({ schemaVersion: 1, abilities: [cone] }, result.rules).valid,
    ).toBe(true);
    for (const environment of ["standing", "combat"] as const)
      expect(
        evaluateRules({ schemaVersion: 1, abilities: [cone] }, result.rules, {
          ...context,
          environment,
        }).contributions[0]?.value,
      ).toBe(0.32);
  });
  it("rejects equal names with different evidence, identity, or unmatched changing curves", () => {
    expect(
      build({ ...cone, descriptionTemplate: cone.descriptionTemplate.replace("50%", "49%") })
        .rejected[0]?.reason,
    ).toBe("description-mismatch");
    expect(build({ ...cone, ownerId: "lightcone:20004" }).rejected[0]?.reason).toBe(
      "identity-mismatch",
    );
    expect(
      build(cone, {
        ...definitions.lightCones[20003],
        bonuses: [
          {
            key: "DEF%",
            curve: {
              kind: "table",
              levels: [1, 2, 3, 4, 5],
              values: [0.11, 0.12, 0.13, 0.14, 0.15],
            },
          },
        ],
      }).rejected[0]?.reason,
    ).toBe("unmatched-curve");
  });
  it("locks wrong equipment, path and rank without silently clamping", () => {
    const rules = build().rules;
    for (const patch of [
      { "equipment.lightConeId": 20004 },
      { "character.path": "巡猎" },
      { "equipment.superimposition": 6 },
      { "binding.superimposition": 4 },
    ])
      expect(
        evaluateRules({ schemaVersion: 1, abilities: [cone] }, rules, {
          ...context,
          values: { ...context.values, ...patch },
        }).contributions,
      ).toEqual([]);
  });
  it("requires relic count and keeps conversions scoped and unknown until inputs exist", () => {
    const ability: CatalogueAbility = {
      ...cone,
      id: "relic:303:twoPiece",
      ownerId: "relic:303",
      sourceKind: "relic",
      slot: "twoPiece",
      levelBinding: null,
      levels: [1],
      descriptionTemplate:
        "使装备者的效果命中提高 {p1:percent} 。同时提高装备者等同于当前效果命中 {p2:percent} 的攻击力，最多提高 {p2:percent} 。",
      parameters: { p1: { kind: "constant", value: 0.1 }, p2: { kind: "constant", value: 0.25 } },
    };
    const result = build(ability, definitions.relics[303].twoPiece, { setId: 303, pieceCount: 2 });
    expect(result.rejected).toEqual([]);
    const catalogue = { schemaVersion: 1 as const, abilities: [ability] };
    const ctx = {
      ...context,
      values: { "equipment.relicCounts.303": 2 },
      targets: [{ id: "self", kind: "self" as const, values: {} }],
    };
    const unknown = evaluateRules(catalogue, result.rules, ctx);
    expect(
      unknown.trace.some(
        (t) => t.reason === "unknown" && t.missingKeys?.includes("context:stats.effectHitRate"),
      ),
    ).toBe(true);
    expect(unknown.contributions.map((c) => c.stat)).toEqual(["Effect Hit Rate"]);
    expect(
      evaluateRules(catalogue, result.rules, {
        ...ctx,
        values: { "equipment.relicCounts.303": 1, "stats.effectHitRate": 2 },
      }).contributions,
    ).toEqual([]);
    expect(
      evaluateRules(catalogue, result.rules, {
        ...ctx,
        values: { "equipment.relicCounts.303": 2 },
        targets: [{ id: "self", kind: "self", values: { "stats.effectHitRate": 2 } }],
      }).contributions.find((c) => c.stat === "ATK%")?.value,
    ).toBe(0.25);
  });
});
