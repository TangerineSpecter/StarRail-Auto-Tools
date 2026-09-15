import { describe, expect, it } from "vitest";
import type {
  CatalogueAbility,
  CatalogueRule,
  CatalogueSourceKind,
} from "../../src/shared/contracts/catalogue-rules";
import {
  evaluateCatalogueCoverage,
  type CatalogueAbilityAudit,
} from "../../src/shared/utils/catalogue-coverage";

const ability = (
  id = "character:a:skill",
  sourceKind: CatalogueSourceKind = "character",
): CatalogueAbility => ({
  id,
  sourceNodeId: id,
  ownerId: id.split(":").slice(0, 2).join(":"),
  groupId: "skills",
  slot: "skill",
  name: "Ability",
  descriptionTemplate: "Deal damage. Restore energy.",
  sourceKind,
  levelBinding: null,
  levels: [1],
  parameters: {},
  sourceHash: "current",
});
const rule = (sourceRef = ability().id, id = "damage"): CatalogueRule => ({
  id,
  sourceRef,
  sourceHash: "current",
  status: "reviewed",
  ruleVersion: 1,
  activation: { kind: "passive" },
  environments: ["combat"],
  unlock: { kind: "literal", value: true },
  effects: [
    {
      id: "effect",
      kind: "hit_definition",
      stat: "damage",
      unit: "flat",
      scope: { target: "enemy" },
      expression: { kind: "literal", value: 100 },
    },
  ],
});
const audit = (sourceRef = ability().id): CatalogueAbilityAudit => ({
  sourceRef,
  sourceHash: "current",
  status: "reviewed",
  clauses: [
    { id: "damage-clause", textHash: "damage-text", ruleIds: ["damage"] },
    { id: "energy-clause", textHash: "energy-text", ruleIds: ["energy"] },
  ],
});
const catalogue = { schemaVersion: 1 as const, abilities: [ability()] };
const rules = [rule(), rule(ability().id, "energy")];

describe("manual clause coverage", () => {
  it("requires derived dependencies to be current reviewed rules too", () => {
    const derived = {
      ...rule(),
      effects: [
        {
          ...rule().effects[0]!,
          expression: { kind: "derived" as const, contributionId: "energy/effect" },
        },
      ],
    };
    const candidate = { ...audit(), clauses: [audit().clauses[0]!] };
    expect(
      evaluateCatalogueCoverage(
        catalogue,
        [derived, { ...rules[1]!, status: "pending" }],
        [candidate],
      ).complete,
    ).toBe(false);
    expect(evaluateCatalogueCoverage(catalogue, [derived, rules[1]!], [candidate]).complete).toBe(
      true,
    );
  });
  it("requires every explicit clause, not merely a reviewed ability rule", () => {
    const incomplete = audit();
    incomplete.clauses = [incomplete.clauses[0]!, { ...incomplete.clauses[1]!, ruleIds: [] }];
    const report = evaluateCatalogueCoverage(catalogue, rules, [incomplete]);
    expect(report.complete).toBe(false);
    expect(report.summary).toMatchObject({
      completeAbilities: 0,
      mappedClauses: 1,
      pendingClauses: 1,
    });
    expect(report.issues).toContainEqual(
      expect.objectContaining({ reason: "unmapped-clause", clauseId: "energy-clause" }),
    );
    expect(evaluateCatalogueCoverage(catalogue, rules, [audit()]).complete).toBe(true);
  });
  it("never calls empty, missing or entirely pending data complete", () => {
    expect(evaluateCatalogueCoverage({ ...catalogue, abilities: [] }, [], []).complete).toBe(false);
    const missing = evaluateCatalogueCoverage(catalogue, rules, []);
    expect(missing.abilities[0]?.status).toBe("pending");
    expect(missing.issues[0]?.reason).toBe("missing-audit");
    for (const candidate of [
      { ...audit(), status: "pending" as const },
      { ...audit(), clauses: [] },
    ])
      expect(evaluateCatalogueCoverage(catalogue, rules, [candidate]).complete).toBe(false);
    expect(
      evaluateCatalogueCoverage(
        catalogue,
        rules.map((rule) => ({ ...rule, status: "pending" })),
        [audit()],
      ).summary.completeAbilities,
    ).toBe(0);
  });
  it("invalidates audit and mapped rules independently on source changes", () => {
    expect(
      evaluateCatalogueCoverage(catalogue, rules, [{ ...audit(), sourceHash: "old" }]).complete,
    ).toBe(false);
    expect(
      evaluateCatalogueCoverage(
        catalogue,
        [{ ...rules[0]!, sourceHash: "old" }, rules[1]!],
        [audit()],
      ).complete,
    ).toBe(false);
    const updated = {
      ...catalogue,
      abilities: [{ ...ability(), sourceHash: "new", descriptionTemplate: "Changed mechanics." }],
    };
    expect(evaluateCatalogueCoverage(updated, rules, [audit()]).summary.completeAbilities).toBe(0);
  });
  it("accepts only explicit pure-note exclusions with a nonempty reason and no rules", () => {
    const candidate = {
      ...audit(),
      clauses: [
        {
          id: "note",
          textHash: "note-hash",
          ruleIds: [],
          exclusionReason: {
            kind: "pure-note" as const,
            reason: "Animation description only; no computational effect.",
          },
        },
      ],
    };
    const report = evaluateCatalogueCoverage(catalogue, [], [candidate]);
    expect(report.complete).toBe(true);
    expect(report.summary).toMatchObject({ mappedClauses: 0, excludedClauses: 1 });
    for (const exclusionReason of [
      { kind: "pure-note", reason: " " },
      { kind: "unsupported", reason: "Not implemented" },
      "unsupported",
    ])
      expect(
        evaluateCatalogueCoverage(
          catalogue,
          [],
          [
            {
              ...candidate,
              clauses: [
                {
                  ...candidate.clauses[0]!,
                  exclusionReason,
                } as unknown as CatalogueAbilityAudit["clauses"][number],
              ],
            },
          ],
        ).complete,
      ).toBe(false);
    expect(
      evaluateCatalogueCoverage(catalogue, rules, [
        { ...candidate, clauses: [{ ...candidate.clauses[0]!, ruleIds: ["damage"] }] },
      ]).complete,
    ).toBe(false);
  });
  it("rejects missing, wrong-owner, duplicate, malformed and invalid mapped rules", () => {
    for (const candidates of [
      rules.slice(0, 1),
      [{ ...rules[0]!, sourceRef: "other" }, rules[1]!],
      [...rules, rules[0]!],
      [{ ...rules[0]!, ruleVersion: 2 } as unknown as CatalogueRule, rules[1]!],
      [{ ...rules[0]!, effects: [] }, rules[1]!],
    ])
      expect(evaluateCatalogueCoverage(catalogue, candidates, [audit()]).complete).toBe(false);
    expect(
      evaluateCatalogueCoverage(
        catalogue,
        [{ ...rules[0]!, unlock: { kind: "boolean" } } as unknown as CatalogueRule, rules[1]!],
        [audit()],
      ).complete,
    ).toBe(false);
  });
  it("rejects duplicate audits, clause IDs, rule IDs and missing text evidence", () => {
    expect(evaluateCatalogueCoverage(catalogue, rules, [audit(), audit()]).complete).toBe(false);
    for (const clauses of [
      [audit().clauses[0]!, audit().clauses[0]!],
      [{ ...audit().clauses[0]!, textHash: "" }],
      [{ ...audit().clauses[0]!, ruleIds: ["damage", "damage"] }],
    ])
      expect(evaluateCatalogueCoverage(catalogue, rules, [{ ...audit(), clauses }]).complete).toBe(
        false,
      );
    expect(evaluateCatalogueCoverage(catalogue, rules, [audit(), audit("unknown")]).complete).toBe(
      false,
    );
  });
  it("aggregates trace/eidolon under character and keeps summons and paths separate", () => {
    const abilities = [
      ability("character:march-hunt", "character"),
      ability("character:march-preservation:trace", "trace"),
      ability("character:march-preservation:rank", "eidolon"),
      ability("lightCone:1", "lightCone"),
      ability("relic:1", "relic"),
      ability("summon:1", "summon"),
    ];
    const audits = abilities.slice(0, -1).map((ability) => ({
      ...audit(ability.id),
      clauses: [
        {
          id: "note",
          textHash: "hash",
          ruleIds: [],
          exclusionReason: { kind: "pure-note" as const, reason: "Pure explanatory note" },
        },
      ],
    }));
    const report = evaluateCatalogueCoverage({ ...catalogue, abilities }, [], audits);
    expect(report.byKind.character).toMatchObject({
      abilities: 3,
      completeAbilities: 3,
      complete: true,
    });
    expect(report.byKind.lightCone.complete).toBe(true);
    expect(report.byKind.relic.complete).toBe(true);
    expect(report.byKind.summon).toMatchObject({
      abilities: 1,
      pendingAbilities: 1,
      complete: false,
    });
    expect(report.complete).toBe(false);
  });
  it("does not mutate input and has no complete flag for absent categories", () => {
    const inputs = [catalogue, rules, [audit()]] as const;
    const before = JSON.stringify(inputs);
    const report = evaluateCatalogueCoverage(...inputs);
    expect(JSON.stringify(inputs)).toBe(before);
    expect(report.byKind.summon.complete).toBe(false);
    expect(report.byKind.relic.complete).toBe(false);
  });
});
