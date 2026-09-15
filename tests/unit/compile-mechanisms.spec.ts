// @vitest-environment node
import { describe, expect, it } from "vitest";
import raw from "@/data/catalogue-mechanics.json";
// @ts-expect-error Native maintenance compiler.
import { compileMechanisms } from "../../scripts/lib/compile-mechanisms.mjs";
// @ts-expect-error Native source fingerprint helper.
import { semanticHash } from "../../scripts/lib/catalogue-source.mjs";

function fixture(description: string) {
  const ability = {
    ...structuredClone(raw.abilities.find((a) => a.id === "character:1001:skills:524962")!),
    descriptionTemplate: description,
    parameters: { p1: { kind: "constant", value: 0.45 }, p2: { kind: "constant", value: 600 } },
    levels: [1],
  };
  ability.sourceHash = semanticHash(ability);
  const owner = {
    ...structuredClone(raw.owners.find((o) => o.id === ability.ownerId)!),
    abilityIds: [ability.id],
  };
  return { schemaVersion: 1, owners: [owner], abilities: [ability] };
}

describe("exhaustive clause indexing", () => {
  it.each([
    "为我方全体提供等同于防御力{p1:percent}+{p2:integer}的护盾。",
    "为我方全体提供等同于{p1:percent}防御力+{p2:integer}的护盾。",
  ])("retains the fixed offset in either scaling order: %s", (description) => {
    const op = compileMechanisms(fixture(description)).library.definitions[0].clauses[0]
      .operations[0];
    expect(op.kind).toBe("shield");
    expect(op.amount).toEqual({ kind: "parameter", key: "p1" });
    expect(op.offset).toEqual({ kind: "parameter", key: "p2" });
  });
  it("retains source spans for literal offsets", () => {
    const description = "为我方全体提供等同于45%防御力 + 600的护盾。";
    const op = compileMechanisms(fixture(description)).library.definitions[0].clauses[0]
      .operations[0];
    expect(op.offset.value).toBe(600);
    expect(description.slice(op.offset.start, op.offset.end)).toBe("600");
  });
  it.each([
    "我方其他角色施放终结技后，发动追加攻击，对敌方全体造成等同于生命上限{p1:percent}的伤害。",
    "充能达到7点后，对指定敌方单体造成等同于攻击力{p1:percent}的伤害。",
    "召唤物行动时，对敌方全体造成等同于攻击力{p1:percent}的伤害。",
    "对触电状态下的敌方目标造成等同于攻击力{p1:percent}的伤害。",
    "施放终结技后，获得强化。对指定敌方单体造成等同于攻击力{p1:percent}的伤害。",
    "特殊机制生效，对指定敌方单体造成等同于攻击力{p1:percent}的伤害。",
    "特殊条件成立。对指定敌方单体造成等同于攻击力{p1:percent}的伤害。",
  ])("does not execute unresolved or inherited conditions: %s", (description) => {
    const clauses = compileMechanisms(fixture(description)).library.definitions[0].clauses;
    expect(
      clauses.every((c: { activation: string }) => c.activation === "unresolvedCondition"),
    ).toBe(true);
  });
  it("keeps the unconditional first hit before a conditional follow-up", () => {
    const description =
      "对指定敌方单体造成等同于攻击力{p1:percent}的伤害。施放终结技后，对敌方全体造成等同于攻击力{p1:percent}的伤害。";
    const clauses = compileMechanisms(fixture(description)).library.definitions[0].clauses;
    expect(clauses[0].operations[0].kind).toBe("damage");
    expect(clauses[1].activation).toBe("unresolvedCondition");
  });
  it("compiles random enemy targets without changing selected targeting", () => {
    for (const [text, expected] of [
      ["随机敌方单体", "randomEnemy"],
      ["指定敌方单体", "enemy"],
    ]) {
      const op = compileMechanisms(fixture(`对${text}造成等同于攻击力{p1:percent}的伤害。`)).library
        .definitions[0].clauses[0].operations[0];
      expect(op.target).toBe(expected);
    }
  });
  it("rejects invalid source fingerprints before generating adopted candidates", () => {
    const changed = structuredClone(raw);
    changed.abilities[0].sourceHash = "changed";
    expect(() => compileMechanisms(changed)).toThrow("source hash");
  });
  it("is deterministic, covers every source identity and retains unused parameters", () => {
    const result = compileMechanisms(raw);
    expect(result).toEqual(compileMechanisms(raw));
    expect(result.library.definitions).toHaveLength(raw.abilities.length);
    for (const [i, definition] of result.library.definitions.entries()) {
      const ability = raw.abilities[i];
      expect(
        definition.clauses
          .map((c: { start: number; end: number }) =>
            ability.descriptionTemplate.slice(c.start, c.end),
          )
          .join(""),
      ).toBe(ability.descriptionTemplate);
      expect(
        new Set([
          ...definition.unusedParameters,
          ...definition.clauses.flatMap((c: { parameterRefs: string[] }) => c.parameterRefs),
        ]),
      ).toEqual(new Set(Object.keys(ability.parameters)));
    }
    expect(result.report.semanticCoverageComplete).toBe(false);
    expect(result.report.executableClauses).toBeLessThan(result.report.clauses);
  });
  it("never turns equipment or conditional text into unconditional damage", () => {
    const result = compileMechanisms(raw);
    for (const definition of result.library.definitions) {
      const ability = raw.abilities.find((a) => a.id === definition.sourceRef)!;
      if (["lightCone", "relic", "eidolon", "trace"].includes(ability.sourceKind))
        expect(
          definition.clauses.every(
            (c: { activation: string }) => c.activation === "unresolvedCondition",
          ),
        ).toBe(true);
    }
  });
});
