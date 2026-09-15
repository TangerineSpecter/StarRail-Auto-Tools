// @vitest-environment node
import { describe, expect, it } from "vitest";
import raw from "@/data/catalogue-mechanics.json";
import libraryJson from "@/data/catalogue-rules.json";
import {
  createBailuMechanicRules,
  BAILU_REFERENCE,
} from "../../scripts/lib/bailu-mechanic-rules.mjs";
import { buildCatalogueRules } from "../../scripts/build-catalogue-rules.mjs";
import { semanticHash } from "../../scripts/lib/catalogue-source.mjs";
import {
  evaluateRules,
  validateCatalogueRules,
  resolveAbility,
} from "@/shared/utils/catalogue-rules";
import { evaluateCatalogueCoverage } from "@/shared/utils/catalogue-coverage";
import { adaptCatalogueAccount } from "@/shared/utils/catalogue-account";
import type { AccountLevelDelta } from "@/shared/utils/catalogue-account";
import type { CatalogueAbilityAudit } from "@/shared/utils/catalogue-coverage";
import type {
  CatalogueRule,
  MechanicCatalogue,
  RuleEvaluationContext,
} from "@/shared/contracts/catalogue-rules";

const catalogue = raw as unknown as MechanicCatalogue;
const authored = createBailuMechanicRules(catalogue);
const rules = authored.rules as CatalogueRule[];
const context: RuleEvaluationContext = {
  environment: "combat",
  event: "bailu.skill",
  bindings: { basic: 6, skill: 1, ult: 10, talent: 10 },
  values: { "owner.maxHp": 6000, "owner.attack": 1000, "character:1211.eidolon": 0 },
  targets: [
    {
      id: "bailu",
      kind: "self",
      values: {
        "target.bailuSkillHit0": true,
        "target.bailuSkillHit1": false,
        "target.bailuSkillHit2": false,
      },
    },
    {
      id: "ally",
      kind: "team",
      values: {
        "target.bailuSkillHit0": false,
        "target.bailuSkillHit1": true,
        "target.bailuSkillHit2": true,
      },
    },
    {
      id: "enemy",
      kind: "enemy",
      values: {
        "target.bailuSkillHit0": true,
        "target.bailuSkillHit1": true,
        "target.bailuSkillHit2": true,
      },
    },
  ],
};
const evaluate = (key: string, input = context) =>
  evaluateRules(
    catalogue,
    rules.filter((r) => r.sourceRef === `character:1211:${key}`),
    input,
  );
const candidates = (key: string, input = context) =>
  evaluate(key, input).triggerCandidates.flatMap((candidate) => candidate.contributions);

describe("Station parameters adapted from Fribbels mechanism definitions", () => {
  it("publishes 28 validated rules and 24 explicit full-clause audits, not full catalogue completion", () => {
    expect(authored.rejected).toEqual([]);
    expect(rules).toHaveLength(28);
    expect(authored.audits).toHaveLength(24);
    expect(validateCatalogueRules(catalogue, rules).valid).toBe(true);
    const report = evaluateCatalogueCoverage(
      catalogue,
      rules,
      authored.audits as CatalogueAbilityAudit[],
    );
    expect(report.summary.completeAbilities).toBe(24);
    expect(report.complete).toBe(false);
    expect(
      report.abilities.find((a) => a.sourceRef === "character:1211:skills:545893")?.status,
    ).toBe("pending");
    expect(rules.every((rule) => rule.reference?.commit === BAILU_REFERENCE.commit)).toBe(true);
  });
  it("resolves all 15 source levels without using rounded descriptions or max-level constants", () => {
    const ability = catalogue.abilities.find((a) => a.id === "character:1211:skills:947065")!;
    for (const level of ability.levels) {
      const parameters = resolveAbility(ability, level).parameters;
      const hits = candidates("skills:947065", { ...context, bindings: { skill: level } });
      expect(hits).toHaveLength(3);
      const base = 6000 * (parameters.p1 as number) + (parameters.p2 as number);
      expect(hits.map((h) => h.value)).toEqual([base, base * 0.85, base * (0.85 * 0.85)]);
      expect(hits[0]!.parameters).toEqual(parameters);
    }
    expect(candidates("skills:947065")[0]!.value).toBe(546);
    expect(
      candidates("skills:947065", { ...context, bindings: { skill: 2 } })[0]!.parameters?.p2,
    ).toBe(124.8);
  });
  it("keeps repeated random heals on the same ally distinct and excludes enemies", () => {
    const before = JSON.stringify(context);
    const hits = candidates("skills:947065");
    expect(hits.map((h) => h.targetId)).toEqual(["bailu", "ally", "ally"]);
    expect(hits.map((h) => h.settlement?.sequenceIndex)).toEqual([0, 1, 2]);
    expect(hits.map((h) => h.settlement?.selection)).toEqual(["selected", "random", "random"]);
    expect(hits.every((h) => h.settlement?.kind === "base_healing")).toBe(true);
    expect(JSON.stringify(context)).toBe(before);
    expect(evaluate("skills:947065").contributions).toEqual([]);
  });
  it("fails closed for missing HP, random targets and unsupported levels", () => {
    const missingHp = evaluate("skills:947065", { ...context, values: {} });
    expect(missingHp.triggerCandidates).toEqual([]);
    expect(missingHp.trace.some((t) => t.missingKeys?.includes("context:owner.maxHp"))).toBe(true);
    const missingTarget = evaluate("skills:947065", {
      ...context,
      targets: [{ id: "ally", kind: "team", values: {} }],
    });
    expect(missingTarget.triggerCandidates).toEqual([]);
    expect(missingTarget.trace.some((t) => t.reason === "unknown")).toBe(true);
    expect(candidates("skills:947065", { ...context, bindings: { skill: 16 } })).toEqual([]);
  });
  it("heals all friendly targets on ult without silently resetting existing invigoration charges", () => {
    const result = candidates("skills:31006", {
      ...context,
      event: "bailu.ult",
      values: { "owner.maxHp": 6000, "bailu.invigorationChargeLimit": 3 },
      targets: [
        { id: "bailu", kind: "self", values: { "target.bailuInvigorated": false } },
        {
          id: "ally",
          kind: "team",
          values: { "target.bailuInvigorated": true, "target.bailuInvigorationTurns": 1 },
        },
        { id: "enemy", kind: "enemy", values: {} },
      ],
    });
    expect(result.filter((r) => r.kind === "healing").map((r) => r.targetId)).toEqual([
      "bailu",
      "ally",
    ]);
    expect(result.find((r) => r.stat === "state.bailu.invigorationChargesRemaining")?.value).toBe(
      3,
    );
    expect(
      result.filter((r) => r.stat === "state.bailu.invigorationChargesRemaining"),
    ).toHaveLength(1);
    expect(
      result.find((r) => r.targetId === "ally" && r.stat === "state.bailu.invigorationTurns")
        ?.value,
    ).toBe(2);
  });
  it("returns talent heals only for attacked invigorated targets with charges", () => {
    const input: RuleEvaluationContext = {
      ...context,
      event: "attack.received",
      targets: [
        {
          id: "ally",
          kind: "team",
          values: {
            "target.isEventActor": true,
            "target.bailuInvigorated": true,
            "target.bailuInvigorationChargesRemaining": 1,
          },
        },
      ],
    };
    const effects = candidates("skills:746479", input);
    expect(effects.find((c) => c.kind === "healing")?.value).toBe(468);
    expect(effects.find((c) => c.stat === "state.bailu.invigorationChargesRemaining")?.value).toBe(
      0,
    );
    expect(
      candidates("skills:746479", {
        ...input,
        targets: [
          {
            ...input.targets[0]!,
            values: { ...input.targets[0]!.values, "target.bailuInvigorationChargesRemaining": 0 },
          },
        ],
      }),
    ).toEqual([]);
  });
  it("prevents a teammate fatal hit but never revives the owner or exceeds supplied capacity", () => {
    const input: RuleEvaluationContext = {
      ...context,
      event: "attack.fatal",
      values: {
        ...context.values,
        "event.targetIsAlly": true,
        "event.targetIsOwner": false,
        "bailu.revivesRemaining": 1,
      },
      targets: [
        { id: "bailu", kind: "self", values: { "target.isEventActor": false } },
        { id: "ally", kind: "team", values: { "target.isEventActor": true } },
      ],
    };
    const effects = candidates("skills:746479", input);
    expect(effects.find((c) => c.kind === "healing")?.value).toBe(1560);
    expect(effects.find((c) => c.stat === "resource.bailu.revivesRemaining")?.value).toBe(-1);
    for (const values of [{ "event.targetIsOwner": true }, { "bailu.revivesRemaining": 0 }])
      expect(
        candidates("skills:746479", { ...input, values: { ...input.values, ...values } }),
      ).toEqual([]);
  });
  it("separates E2 healing bonus and E4 per-heal damage stacks from base healing", () => {
    const input = {
      ...context,
      event: "bailu.ult",
      values: { ...context.values, "character:1211.eidolon": 4 },
    };
    const e2 = candidates("ranks:2", input)[0]!;
    expect(e2.value).toBe(0.15);
    expect(e2.duration).toMatchObject({ value: 2, clock: "owner", expiry: "end" });
    const e4 = candidates("ranks:4", {
      ...input,
      event: "bailu.skill.healed",
      targets: [{ id: "ally", kind: "team", values: { "target.isEventActor": true } }],
    })[0]!;
    expect(e4.value).toBe(0.1);
    expect(e4.stacking).toEqual({ key: "bailu.e4", mode: "add", maxStacks: 3 });
    expect(e4.duration?.value).toBe(2);
    expect(
      candidates("ranks:2", { ...input, values: { ...input.values, "character:1211.eidolon": 1 } }),
    ).toEqual([]);
  });
  it("requires full health at E1 expiry and real trace unlock state", () => {
    const input = {
      ...context,
      event: "bailu.invigoration.expired",
      values: { ...context.values, "character:1211.eidolon": 1 },
      targets: [
        {
          id: "ally",
          kind: "team" as const,
          values: { "target.isEventActor": true, "target.hp": 1000, "target.maxHp": 1000 },
        },
      ],
    };
    expect(candidates("ranks:1", input)[0]!.value).toBe(8);
    expect(
      candidates("ranks:1", {
        ...input,
        targets: [
          { ...input.targets[0]!, values: { ...input.targets[0]!.values, "target.hp": 999 } },
        ],
      }),
    ).toEqual([]);
    expect(
      evaluate("traces:1211201", { ...context, environment: "standing" }).contributions,
    ).toEqual([]);
    expect(
      evaluate("traces:1211201", {
        ...context,
        environment: "standing",
        values: { "character:1211.trace.1211201": true },
      }).contributions[0]?.value,
    ).toBe(0.04);
  });
  it("binds account base levels to E3/E5 once, caps levels and preserves identity isolation", () => {
    const detail = {
      characterId: 1211,
      path: "Abundance",
      abilityVersion: 0,
      skills: { basic: 6, skill: 10, ult: 10, talent: 10 },
      eidolon: 5,
      traces: {},
    };
    const variant = { gameId: 1211, path: "Abundance", abilityVersion: 0 };
    const result = adaptCatalogueAccount(
      detail,
      variant,
      catalogue.abilities,
      authored.accountLevelDeltas as AccountLevelDelta[],
    );
    expect(result.baseLevels.skill).toBe(10);
    expect(result.bindings).toMatchObject({ basic: 7, skill: 12, ult: 12, talent: 12 });
    const capped = adaptCatalogueAccount(
      { ...detail, skills: { basic: 10, skill: 15, ult: 14, talent: 15 } },
      variant,
      catalogue.abilities,
      authored.accountLevelDeltas as AccountLevelDelta[],
    );
    expect(capped.bindings).toMatchObject({ basic: 10, skill: 15, ult: 15, talent: 15 });
    expect(
      adaptCatalogueAccount(
        detail,
        { ...variant, path: "Preservation" },
        catalogue.abilities,
        authored.accountLevelDeltas as AccountLevelDelta[],
      ).bindings,
    ).toEqual({});
  });
  it("never renews review hashes automatically after a source change", () => {
    const changed = structuredClone(catalogue);
    const ability = changed.abilities.find((a) => a.id === "character:1211:skills:947065")!;
    ability.parameters = { ...ability.parameters, p3: { kind: "constant", value: 0.2 } };
    ability.sourceHash = semanticHash({ ...ability, description: ability.descriptionTemplate });
    const result = createBailuMechanicRules(changed);
    expect(result.rejected).toContainEqual({
      sourceRef: ability.id,
      reason: "missing-or-changed-reviewed-source",
    });
    expect(result.audits.some((a: CatalogueAbilityAudit) => a.sourceRef === ability.id)).toBe(
      false,
    );
    expect(() => buildCatalogueRules(changed, libraryJson, evaluateCatalogueCoverage)).toThrow(
      "Reviewed source changed",
    );
  });
  it("keeps invigoration reduction conditional and declares complement multiplication", () => {
    const input: RuleEvaluationContext = {
      ...context,
      values: { "character:1211.trace.1211103": true },
      targets: [
        { id: "bailu", kind: "self", values: { "target.bailuInvigorated": true } },
        { id: "ally", kind: "team", values: { "target.bailuInvigorated": false } },
        { id: "enemy", kind: "enemy", values: { "target.bailuInvigorated": true } },
      ],
    };
    expect(evaluate("traces:1211103", input).contributions).toMatchObject([
      { targetId: "bailu", value: 0.1, operation: "multiplicative_complement" },
    ]);
    expect(evaluate("traces:1211103", { ...input, environment: "standing" }).contributions).toEqual(
      [],
    );
  });
  it("validates parameter-bound durations, references and settlement metadata", () => {
    const source = rules.find((r) => r.sourceRef === "character:1211:ranks:2")!;
    const withDuration = (expression: CatalogueRule["effects"][number]["expression"]) => ({
      ...source,
      effects: [
        {
          ...source.effects[0]!,
          duration: { kind: "turns" as const, valueExpression: expression },
        },
      ],
    });
    const input = { ...context, event: "bailu.ult", values: { "character:1211.eidolon": 2 } };
    const missing = evaluateRules(
      catalogue,
      [withDuration({ kind: "context", key: "missing.duration" })],
      input,
    );
    expect(missing.triggerCandidates).toEqual([]);
    expect(missing.trace.some((t) => t.missingKeys?.includes("context:missing.duration"))).toBe(
      true,
    );
    expect(
      validateCatalogueRules(catalogue, [withDuration({ kind: "literal", value: true })]).valid,
    ).toBe(false);
    expect(
      validateCatalogueRules(catalogue, [withDuration({ kind: "param", key: "unknown" })]).valid,
    ).toBe(false);
    for (const value of [0, 1.5, -1])
      expect(
        evaluateRules(catalogue, [withDuration({ kind: "literal", value })], input)
          .triggerCandidates,
      ).toEqual([]);
    expect(
      validateCatalogueRules(catalogue, [
        { ...source, reference: { ...BAILU_REFERENCE, commit: "main" } },
      ]).valid,
    ).toBe(false);
    expect(
      validateCatalogueRules(catalogue, [
        {
          ...source,
          effects: [
            {
              ...source.effects[0]!,
              settlement: {
                kind: "base_healing",
                scalingStat: "hp",
                entity: "owner",
                attributeStage: "effective",
                readAt: "hit",
                selection: "all",
              },
            },
          ],
        },
      ]).valid,
    ).toBe(false);
  });
  it("compiles deterministically, preserves unrelated records and rejects manual collisions", () => {
    const first = buildCatalogueRules(catalogue, libraryJson, evaluateCatalogueCoverage);
    expect(buildCatalogueRules(catalogue, first.library, evaluateCatalogueCoverage)).toEqual(first);
    expect(first.library).toEqual(libraryJson);
    const previous = { schemaVersion: 1, rules: [rules[0]], audits: [] };
    expect(() => buildCatalogueRules(catalogue, previous, evaluateCatalogueCoverage)).toThrow(
      "Refusing to overwrite manual record",
    );
    const invalid = structuredClone(first.library);
    invalid.audits.push({
      sourceRef: invalid.rules[0].sourceRef,
      sourceHash: invalid.rules[0].sourceHash,
      status: "reviewed",
      clauses: [{ id: "manual", textHash: "manual-text-hash", ruleIds: ["absent-rule"] }],
    });
    expect(() => buildCatalogueRules(catalogue, invalid, evaluateCatalogueCoverage)).toThrow(
      "Invalid audit references",
    );
  });
});
