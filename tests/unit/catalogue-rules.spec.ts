import { describe, expect, it } from "vitest";
import type {
  CatalogueAbility,
  CatalogueRule,
  RuleEvaluationContext,
  RuleExpression,
} from "../../src/shared/contracts/catalogue-rules";
import {
  evaluateExpression,
  evaluateRules,
  resolveAbility,
  validateCatalogueRules,
} from "../../src/shared/utils/catalogue-rules";

const literal = (value: number | boolean | null): RuleExpression => ({ kind: "literal", value });
const ability: CatalogueAbility = {
  id: "march-preservation",
  sourceNodeId: "skill",
  ownerId: "march-preservation",
  groupId: "skill",
  slot: "skill",
  name: "Shield",
  descriptionTemplate: "{bonus} / {unused} / {missing}",
  levelBinding: "skill",
  levels: [1, 2],
  sourceKind: "character",
  sourceHash: "hash-a",
  parameters: {
    bonus: { kind: "table", levels: [1, 2], values: [0.1, 0.2] },
    unused: { kind: "constant", value: 7 },
  },
};
const catalogue = { schemaVersion: 1 as const, abilities: [ability] };
const rule = (overrides: Partial<CatalogueRule> = {}): CatalogueRule => ({
  id: "bonus",
  sourceRef: ability.id,
  sourceHash: ability.sourceHash,
  status: "reviewed",
  ruleVersion: 1,
  activation: { kind: "passive" },
  environments: ["standing", "combat"],
  unlock: { kind: "context", key: "unlocked" },
  effects: [
    {
      id: "atk",
      kind: "stat_modifier",
      stat: "atk",
      unit: "ratio",
      expression: { kind: "param", key: "bonus" },
      scope: { target: "self" },
    },
  ],
  ...overrides,
});
const context: RuleEvaluationContext = {
  environment: "standing",
  bindings: { skill: 2 },
  values: { unlocked: true },
  targets: [
    { id: "march-preservation", kind: "self", values: {} },
    { id: "march-hunt", kind: "team", values: {} },
  ],
};
const expressionContext = { parameters: {}, values: {} };

describe("catalogue rule contract", () => {
  it.each([
    [1.49, "1 / 149% / 149.0% / 149.00% / 149%"],
    [1.5, "2 / 150% / 150.0% / 150.00% / 150%"],
    [0.123456789, "0 / 12% / 12.3% / 12.35% / 12.3456789%"],
    [0.026999999, "0 / 3% / 2.7% / 2.70% / 2.6999999%"],
    [0.1 + 0.2, "0 / 30% / 30.0% / 30.00% / 30%"],
    [-1.5, "-1 / -150% / -150.0% / -150.00% / -150%"],
  ])("preserves source format rounding for numeric value %s", (value, description) => {
    const source: CatalogueAbility = {
      ...ability,
      descriptionTemplate:
        "{p1:integer} / {p1:percentInteger} / {p1:percentFixed1} / {p1:percentFixed2} / {p1:percent}",
      parameters: { p1: { kind: "constant", value } },
    };
    const resolved = resolveAbility(source, 1);
    expect(resolved.description).toBe(description);
    expect(resolved.parameters.p1).toBe(value);
  });
  it("keeps all formatted table references unknown at unsupported levels", () => {
    const source = {
      ...ability,
      descriptionTemplate:
        "{bonus:integer}/{bonus:percentInteger}/{bonus:percentFixed1}/{bonus:percentFixed2}",
    };
    expect(resolveAbility(source, 3).description).toBe("?/?/?/?");
  });
  it("formats source numbers exactly without guessing units", () => {
    const source = {
      ...ability,
      descriptionTemplate:
        "{bonus:percent} / {unused:fixed1} / {unused:number} / {bonus} / {unused:fixed2}",
    };
    expect(resolveAbility(source, 2).description).toBe("20% / 7.0 / 7 / 0.2 / 7.00");
    expect(resolveAbility(source, 3).description).toBe("? / 7.0 / 7 / ? / 7.00");
  });
  it("rejects malformed expressions without throwing", () => {
    for (const malformed of [
      { kind: "boolean", op: "and" },
      { kind: "arithmetic", op: "execute", left: literal(1), right: literal(2) },
      { kind: "if", condition: literal(true) },
    ]) {
      const expression = malformed as RuleExpression;
      expect(evaluateExpression(expression, expressionContext)).toBeNull();
      expect(validateCatalogueRules(catalogue, [rule({ unlock: expression })]).valid).toBe(false);
      expect(
        evaluateRules(catalogue, [rule({ unlock: expression })], context).contributions,
      ).toEqual([]);
    }
  });
  it("validates explicit units and reports missing inputs", () => {
    const annotated = {
      ...catalogue,
      abilities: [
        { ...ability, parameterUnits: { bonus: "ratio" as const, unused: "count" as const } },
      ],
    };
    const incompatible = rule({
      effects: [
        {
          ...rule().effects[0]!,
          expression: {
            kind: "arithmetic",
            op: "add",
            left: { kind: "param", key: "bonus" },
            right: { kind: "param", key: "unused" },
          },
        },
      ],
    });
    expect(
      validateCatalogueRules(annotated, [incompatible]).issues.some(
        (issue) => issue.code === "expression-unit",
      ),
    ).toBe(true);
    expect(
      evaluateRules(catalogue, [rule()], { ...context, values: {} }).trace[0]?.missingKeys,
    ).toContain("context:unlocked");
  });
  it("captures requested snapshot inputs and fails closed when missing", () => {
    const candidate = rule({
      effects: [
        {
          ...rule().effects[0]!,
          operation: "multiply",
          snapshot: "activation",
          snapshotKeys: ["stats.atk"],
          duration: { kind: "turns", value: 2, clock: "target", expiry: "end" },
        },
      ],
    });
    expect(evaluateRules(catalogue, [candidate], context).contributions).toEqual([]);
    expect(
      evaluateRules(catalogue, [candidate], {
        ...context,
        values: { ...context.values, "stats.atk": 1200 },
      }).contributions[0],
    ).toMatchObject({ operation: "multiply", snapshotValues: { "stats.atk": 1200 } });
  });
  it("validates cycles even before evaluation and keeps pending coverage unreviewed", () => {
    const candidate = rule({
      effects: [
        { ...rule().effects[0]!, expression: { kind: "derived", contributionId: "bonus/atk" } },
      ],
    });
    expect(
      validateCatalogueRules(catalogue, [candidate]).issues.some((issue) => issue.code === "cycle"),
    ).toBe(true);
    expect(
      validateCatalogueRules(catalogue, [rule(), rule({ id: "pending", status: "pending" })])
        .coverage.reviewed,
    ).toBe(0);
  });
  it("resolves exact curves, retains unused parameters and renders description", () => {
    expect(resolveAbility(ability, 2)).toMatchObject({
      parameters: { bonus: 0.2, unused: 7 },
      description: "0.2 / 7 / ?",
    });
    expect(resolveAbility(ability, 3).parameters.bonus).toBeNull();
    expect(resolveAbility(ability, {}).parameters.bonus).toBeNull();
    expect(resolveAbility(ability, 1.5).parameters.bonus).toBeNull();
  });
  it("uses tri-state logic without coercion or prototype lookups", () => {
    expect(
      evaluateExpression(
        { kind: "boolean", op: "and", operands: [literal(null), literal(false)] },
        expressionContext,
      ),
    ).toBe(false);
    expect(
      evaluateExpression(
        { kind: "boolean", op: "or", operands: [literal(null), literal(true)] },
        expressionContext,
      ),
    ).toBe(true);
    expect(
      evaluateExpression({ kind: "not", operand: literal(null) }, expressionContext),
    ).toBeNull();
    expect(evaluateExpression({ kind: "context", key: "toString" }, expressionContext)).toBeNull();
    expect(
      evaluateExpression(
        { kind: "compare", op: "eq", left: literal(1), right: literal(true) },
        expressionContext,
      ),
    ).toBeNull();
    expect(
      evaluateExpression(
        { kind: "arithmetic", op: "divide", left: literal(1), right: literal(0) },
        expressionContext,
      ),
    ).toBeNull();
    expect(
      evaluateExpression(
        { kind: "arithmetic", op: "multiply", left: literal(Number.MAX_VALUE), right: literal(2) },
        expressionContext,
      ),
    ).toBeNull();
  });
  it("evaluates conditionals lazily and supports rounding and bounded clamp", () => {
    expect(
      evaluateExpression(
        {
          kind: "if",
          condition: literal(true),
          then: { kind: "ceil", operand: literal(1.2) },
          else: { kind: "context", key: "absent" },
        },
        expressionContext,
      ),
    ).toBe(2);
    expect(evaluateExpression({ kind: "floor", operand: literal(1.9) }, expressionContext)).toBe(1);
    expect(evaluateExpression({ kind: "round", operand: literal(1.9) }, expressionContext)).toBe(2);
    expect(
      evaluateExpression(
        { kind: "clamp", value: literal(8), min: literal(0), max: literal(5) },
        expressionContext,
      ),
    ).toBe(5);
    expect(
      evaluateExpression(
        { kind: "clamp", value: literal(8), min: literal(5), max: literal(0) },
        expressionContext,
      ),
    ).toBeNull();
    expect(
      evaluateExpression(
        { kind: "if", condition: literal(null), then: literal(1), else: literal(2) },
        expressionContext,
      ),
    ).toBeNull();
  });
  it("fails closed for review, hash, environment, explicit unlock and unknown inputs", () => {
    for (const candidate of [
      rule({ status: "pending" }),
      rule({ sourceHash: "old" }),
      rule({ environments: ["combat"] }),
      rule({ unlock: literal(false) }),
    ]) {
      expect(evaluateRules(catalogue, [candidate], context).contributions).toEqual([]);
    }
    expect(evaluateRules(catalogue, [rule()], { ...context, values: {} }).trace).toContainEqual(
      expect.objectContaining({ reason: "unknown" }),
    );
    const result = evaluateRules(catalogue, [rule()], context);
    expect(result.contributions).toHaveLength(1);
    expect(result.contributions[0]).toMatchObject({
      sourceRef: ability.id,
      sourceHash: "hash-a",
      targetId: "march-preservation",
      value: 0.2,
    });
  });
  it("applies condition and target filter independently, rejecting unknown filters", () => {
    const candidate = rule({
      activation: { kind: "condition", condition: { kind: "context", key: "combatBuff" } },
    });
    expect(evaluateRules(catalogue, [candidate], context).contributions).toEqual([]);
    candidate.effects = [
      {
        ...candidate.effects[0]!,
        scope: { target: "team", filter: { kind: "context", key: "eligible" } },
      },
    ];
    const result = evaluateRules(catalogue, [candidate], {
      ...context,
      values: { unlocked: true, combatBuff: true },
      targets: [
        { id: "ally", kind: "team", values: { eligible: true } },
        { id: "other", kind: "team", values: {} },
      ],
    });
    expect(result.contributions.map((item) => item.targetId)).toEqual(["ally"]);
  });
  it("returns event hit candidates and metadata without mutating any input", () => {
    const eventRule = rule({
      activation: { kind: "event", event: "basic-hit" },
      environments: ["combat"],
      effects: [
        {
          ...rule().effects[0]!,
          kind: "hit_definition",
          stat: "hit",
          unit: "count",
          expression: literal(2),
          duration: { kind: "turns", value: 2 },
          stacking: { key: "hit", mode: "max", maxStacks: 1 },
          snapshot: "activation",
        },
      ],
    });
    const eventContext = { ...context, environment: "combat" as const, event: "basic-hit" };
    const before = JSON.stringify([catalogue, eventRule, eventContext]);
    const result = evaluateRules(catalogue, [eventRule], eventContext);
    expect(result.contributions).toEqual([]);
    expect(result.triggerCandidates[0]?.contributions[0]).toMatchObject({
      kind: "hit_definition",
      value: 2,
      snapshot: "activation",
      duration: { kind: "turns", value: 2 },
    });
    expect(JSON.stringify([catalogue, eventRule, eventContext])).toBe(before);
    expect(
      evaluateRules(catalogue, [eventRule], { ...eventContext, event: "other" }).triggerCandidates,
    ).toEqual([]);
  });
  it("resolves derived contributions independent of order and detects cycles", () => {
    const derived = rule({
      id: "derived",
      effects: [
        {
          ...rule().effects[0]!,
          expression: {
            kind: "arithmetic",
            op: "multiply",
            left: { kind: "derived", contributionId: "bonus/atk" },
            right: literal(2),
          },
        },
      ],
    });
    expect(
      evaluateRules(catalogue, [derived, rule()], context).contributions.map((item) => item.value),
    ).toEqual([0.4, 0.2]);
    const cycle = rule({
      effects: [
        { ...rule().effects[0]!, expression: { kind: "derived", contributionId: "derived/atk" } },
      ],
    });
    const result = evaluateRules(catalogue, [derived, cycle], context);
    expect(result.contributions).toEqual([]);
    expect(result.trace.some((item) => item.reason === "cycle")).toBe(true);
  });
  it("includes self in team effects and permits explicit exclusion", () => {
    const team = rule({
      effects: [{ ...rule().effects[0]!, scope: { target: "team" } }],
    });
    const targets: RuleEvaluationContext = {
      ...context,
      targets: [
        { ...context.targets[0]!, values: { allyOnly: false } },
        { ...context.targets[1]!, values: { allyOnly: true } },
        { id: "enemy", kind: "enemy", values: { allyOnly: true } },
      ],
    };
    expect(evaluateRules(catalogue, [team], targets).contributions.map((c) => c.targetId)).toEqual(
      context.targets.map((target) => target.id),
    );
    team.effects[0]!.scope.filter = { kind: "context", key: "allyOnly" };
    expect(evaluateRules(catalogue, [team], targets).contributions.map((c) => c.targetId)).toEqual([
      context.targets[1]!.id,
    ]);
  });
  it("does not leak event dependencies through a passive cache in either rule order", () => {
    const event = rule({
      activation: { kind: "event", event: "hit" },
      effects: [
        rule().effects[0]!,
        {
          ...rule().effects[0]!,
          id: "use",
          expression: { kind: "derived", contributionId: "passive/atk" },
        },
      ],
    });
    const passive = rule({
      id: "passive",
      effects: [
        { ...rule().effects[0]!, expression: { kind: "derived", contributionId: "bonus/atk" } },
      ],
    });
    for (const rules of [
      [event, passive],
      [passive, event],
    ]) {
      expect(validateCatalogueRules(catalogue, rules).valid).toBe(true);
      const result = evaluateRules(catalogue, rules, { ...context, event: "hit" });
      expect(result.contributions).toEqual([]);
      expect(result.triggerCandidates.flatMap((c) => c.contributions).map((c) => c.id)).toEqual([
        "bonus/atk",
      ]);
      expect(result.trace.some((c) => c.ruleId === "passive" && c.reason === "unknown")).toBe(true);
    }
  });
  it("never derives passive stats from hypothetical event effects", () => {
    const event = rule({ activation: { kind: "event", event: "hit" } });
    const passive = rule({
      id: "passive",
      effects: [
        { ...rule().effects[0]!, expression: { kind: "derived", contributionId: "bonus/atk" } },
      ],
    });
    expect(
      evaluateRules(catalogue, [event, passive], { ...context, event: "hit" }).contributions,
    ).toEqual([]);
  });
  it("rejects duplicate rules, effects, targets and invalid refs", () => {
    expect(evaluateRules(catalogue, [rule(), rule()], context).contributions).toEqual([]);
    expect(
      evaluateRules(
        catalogue,
        [rule({ effects: [rule().effects[0]!, rule().effects[0]!] })],
        context,
      ).contributions,
    ).toEqual([]);
    expect(
      evaluateRules(catalogue, [rule()], {
        ...context,
        targets: [context.targets[0]!, context.targets[0]!],
      }).contributions,
    ).toEqual([]);
    expect(
      validateCatalogueRules(catalogue, [
        rule({
          effects: [{ ...rule().effects[0]!, expression: { kind: "param", key: "absent" } }],
        }),
      ]).valid,
    ).toBe(false);
  });
  it("reports coverage honestly and validates table shape, units and review hash", () => {
    expect(validateCatalogueRules(catalogue, []).coverage).toEqual({
      total: 1,
      covered: 0,
      reviewed: 0,
    });
    expect(validateCatalogueRules(catalogue, [rule({ status: "pending" })]).coverage.reviewed).toBe(
      0,
    );
    expect(validateCatalogueRules(catalogue, [rule({ sourceHash: "stale" })]).valid).toBe(false);
    const bad = {
      ...ability,
      parameters: { bonus: { kind: "table" as const, levels: [1, 1], values: [1] } },
    };
    expect(
      validateCatalogueRules({ ...catalogue, abilities: [bad] }, []).issues.some(
        (item) => item.code === "level-coverage",
      ),
    ).toBe(true);
  });
});
