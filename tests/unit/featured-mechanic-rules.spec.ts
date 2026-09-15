import { describe, expect, it } from "vitest";
import rawCatalogue from "../../src/data/catalogue-mechanics.json";
import publishedRules from "../../src/data/catalogue-rules.json";
import {
  createFeaturedMechanicRules,
  FEATURED_REVIEW_SNAPSHOT,
  FEATURED_INCOMPLETE_CLAUSES,
} from "../../scripts/lib/featured-mechanic-rules.mjs";
import { semanticHash } from "../../scripts/lib/catalogue-source.mjs";
import {
  evaluateExpression,
  evaluateRules,
  resolveAbility,
  validateCatalogueRules,
} from "../../src/shared/utils/catalogue-rules";
import type {
  CatalogueAbility,
  CatalogueRule,
  RuleExpression,
  RuleValue,
} from "../../src/shared/contracts/catalogue-rules";

const snapshot = FEATURED_REVIEW_SNAPSHOT as CatalogueAbility[];
const authored = () => createFeaturedMechanicRules(snapshot).rules as CatalogueRule[];
function rule(suffix: string) {
  const match = authored().find((entry) => entry.id.endsWith(suffix));
  if (!match) throw new Error(`Missing authored rule ${suffix}`);
  return match;
}
function value(
  entry: CatalogueRule,
  stat: string,
  values: Record<string, RuleValue> = {},
  level = 10,
) {
  const ability = snapshot.find((a) => a.id === entry.sourceRef)!;
  const parameters = resolveAbility(ability, level).parameters;
  const effect = entry.effects.find((e) => e.stat === stat)!;
  return evaluateExpression(effect.expression, { parameters, values });
}
function condition(entry: CatalogueRule, values: Record<string, RuleValue> = {}, level = 10) {
  const ability = snapshot.find((a) => a.id === entry.sourceRef)!;
  const parameters = resolveAbility(ability, level).parameters;
  return evaluateExpression(
    "condition" in entry.activation
      ? (entry.activation.condition as RuleExpression)
      : { kind: "literal", value: true },
    { parameters, values },
  );
}

describe("manually reviewed featured mechanics", () => {
  it("restores every supported level using exact frozen parameter curves and source formats", () => {
    for (const reviewed of snapshot) {
      const actual = rawCatalogue.abilities.find(
        (ability) => ability.id === reviewed.id,
      )! as CatalogueAbility;
      expect(actual.levels).toEqual(reviewed.levels);
      for (const level of reviewed.levels) {
        const resolved = resolveAbility(actual, level);
        expect(resolved.parameters).toEqual(resolveAbility(reviewed, level).parameters);
        expect(resolved.description).toBe(resolveAbility(reviewed, level).description);
        expect(resolved.description).not.toMatch(/\{p\d+:|\?/);
        for (const [key, curve] of Object.entries(reviewed.parameters)) {
          expect(resolved.parameters[key]).toBe(
            curve.kind === "constant" ? curve.value : curve.values[curve.levels.indexOf(level)],
          );
        }
      }
    }
  });
  it("preserves manually checked integer and fractional percent source formats", () => {
    const rin = snapshot.find((ability) => ability.id.endsWith("33536761"))!;
    expect(rin.descriptionTemplate).toContain("{p1:percentInteger}");
    expect(rin.descriptionTemplate).toContain("{p4:integer}");
    expect(resolveAbility(rin, 10).description).toContain("600%");
    expect(resolveAbility(rin, 10).description).toContain("恢复1个战技点");
    const robin = snapshot.find((ability) => ability.id.endsWith("4049802"))!;
    expect(robin.descriptionTemplate).toContain("{p8:percentFixed1}");
    expect(robin.descriptionTemplate).toContain("{p9:percentFixed1}");
    expect(resolveAbility(robin, 10).description).toContain("15.0%+气氛值*0.5%");
  });
  it("keeps old reviewed rules inactive against a changed source even when fresh source hashes are valid", () => {
    const oldRule = rule("33056465:basic");
    const changed = structuredClone(snapshot.find((ability) => ability.id === oldRule.sourceRef)!);
    changed.parameters = { p1: { kind: "constant", value: 123 } };
    changed.sourceHash = semanticHash(changed);
    expect(changed.sourceHash).not.toBe(oldRule.sourceHash);
    const result = evaluateRules({ schemaVersion: 1, abilities: [changed] }, [oldRule], {
      environment: "combat",
      event: "rin.basic",
      bindings: { basic: 6 },
      values: { "owner.attack": 1000 },
      targets: [{ id: "enemy", kind: "enemy", values: { "target.isPrimary": true } }],
    });
    expect(result.contributions).toEqual([]);
    expect(result.triggerCandidates).toEqual([]);
    expect(
      result.trace.some((entry) => entry.reason === "hash-mismatch" || entry.reason === "invalid"),
    ).toBe(true);
  });
  it("validates published rules against real raw data and exact frozen hashes", () => {
    const result = createFeaturedMechanicRules(rawCatalogue);
    expect(result.rejected).toEqual([]);
    expect(result.rules).toEqual(
      publishedRules.rules.filter((rule) =>
        ["1508", "1512", "1505"].includes(rule.sourceRef.split(":")[1]!),
      ),
    );
    const validation = validateCatalogueRules(
      rawCatalogue as { schemaVersion: 1; abilities: CatalogueAbility[] },
      result.rules,
    );
    expect(validation.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    for (const rule of result.rules as CatalogueRule[])
      expect(
        rawCatalogue.abilities.find((ability) => ability.id === rule.sourceRef)?.sourceHash,
      ).toBe(rule.sourceHash);
    expect(publishedRules.review.complete).toBe(false);
  });
  it("accepts reordered object keys but not changed semantic content", () => {
    const reordered = snapshot.map((ability) => ({
      ...ability,
      parameters: Object.fromEntries(Object.entries(ability.parameters).reverse()),
    }));
    expect(createFeaturedMechanicRules(reordered).rejected).toEqual([]);
  });
  it("binds frozen exact hashes and validates authored ASTs without reviewing unknown owners", () => {
    const result = createFeaturedMechanicRules(snapshot);
    expect(result.rejected).toEqual([]);
    expect(result.rules).toHaveLength(103);
    expect(
      validateCatalogueRules({ schemaVersion: 1, abilities: snapshot }, result.rules).issues.filter(
        (x) => x.severity === "error",
      ),
    ).toEqual([]);
    expect(new Set(result.rules.map((r: CatalogueRule) => r.sourceRef.split(":")[1]))).toEqual(
      new Set(["1508", "1512", "1505"]),
    );
    expect(FEATURED_INCOMPLETE_CLAUSES.length).toBeGreaterThan(0);
  });

  it("rejects changed parameters even with a freshly recomputed source hash", () => {
    const fresh = structuredClone(snapshot);
    const ability = fresh.find((a) => a.id === "character:1508:skills:33536761")!;
    ability.parameters = { ...ability.parameters, p1: { kind: "constant", value: 999 } };
    ability.sourceHash = semanticHash(ability);
    const result = createFeaturedMechanicRules(fresh);
    expect(result.rules.some((r: CatalogueRule) => r.sourceRef === ability.id)).toBe(false);
    expect(result.rejected.some((r: { sourceRef: string }) => r.sourceRef === ability.id)).toBe(
      true,
    );
  });

  it("rejects forged hashes, duplicate IDs, changed templates and changed level bindings", () => {
    for (const field of ["descriptionTemplate", "levelBinding", "sourceHash", "slot"] as const) {
      const fresh = structuredClone(snapshot);
      fresh[0][field] = "changed";
      expect(
        createFeaturedMechanicRules(fresh).rules.some(
          (r: CatalogueRule) => r.sourceRef === fresh[0].id,
        ),
      ).toBe(false);
    }
    expect(
      createFeaturedMechanicRules([...snapshot, snapshot[0]]).rules.some(
        (r: CatalogueRule) => r.sourceRef === snapshot[0].id,
      ),
    ).toBe(false);
  });

  it("locks Rin ultimate parameter positions to primary 600%, other 200%, SP +1, vulnerability 20% for 3 turns", () => {
    const entry = rule("33536761:ultimate");
    expect(value(entry, "quantum.ultimate.primary", { "owner.attack": 1000 })).toBe(6000);
    expect(value(entry, "quantum.ultimate.other", { "owner.attack": 1000 })).toBe(2000);
    expect(value(entry, "skillPoints")).toBe(1);
    expect(value(entry, "damageTaken")).toBe(0.2);
    expect(entry.effects.find((e) => e.stat === "damageTaken")?.duration).toEqual({
      kind: "turns",
      value: 3,
    });
    for (const effect of entry.effects.slice(0, 2))
      expect(evaluateExpression(effect.scope.filter!, { parameters: {}, values: {} })).toBeNull();
    expect(value(entry, "quantum.ultimate.primary", { "owner.attack": 1000 }, 99)).toBeNull();
  });

  it("requires unused linked attack AND low SP OR five circuit skills; uses Archer's own attack", () => {
    const entry = rule("33496730:linked-attack");
    expect(
      condition(entry, {
        "rin.linkedAttackUsed": false,
        "team.skillPoints": 3,
        "archer.circuitActiveSkillCount": 0,
      }),
    ).toBe(true);
    expect(
      condition(entry, {
        "rin.linkedAttackUsed": true,
        "team.skillPoints": 3,
        "archer.circuitActiveSkillCount": 5,
      }),
    ).toBe(false);
    expect(
      condition(entry, {
        "rin.linkedAttackUsed": false,
        "team.skillPoints": 4,
        "archer.circuitActiveSkillCount": 4,
      }),
    ).toBe(false);
    expect(
      condition(entry, {
        "rin.linkedAttackUsed": false,
        "team.skillPoints": 4,
        "archer.circuitActiveSkillCount": 5,
      }),
    ).toBe(true);
    expect(
      value(entry, "quantum.linked.archer", { "owner.attack": 1000, "archer.attack": 2000 }),
    ).toBe(6000);
  });

  it("stops gem repeats independently at insufficient gems, 33 rounds or no living enemy", () => {
    const entry = rule("33478499:gem-repeat");
    const values = {
      "rin.usingShadowGems": false,
      "rin.gems": 3,
      "rin.enhancedRepeatCount": 32,
      "enemy.aliveCount": 1,
    };
    expect(condition(entry, values)).toBe(true);
    for (const [key, v] of [
      ["rin.gems", 2],
      ["rin.enhancedRepeatCount", 33],
      ["enemy.aliveCount", 0],
    ] as const)
      expect(condition(entry, { ...values, [key]: v })).toBe(false);
    expect(value(entry, "rin.gems")).toBe(-3);
    expect(value(rule("33478499:convert-sp"), "rin.gems", { "team.skillPoints": 7 })).toBe(10);
  });

  it("uses Robin HP, energy cap and exact Fever atmosphere formula", () => {
    expect(value(rule("4087223:basic"), "wind.basic", { "owner.maxHp": 8000 }, 6)).toBe(4000);
    expect(value(rule("3799442:ultimate"), "energy.fixed", { "target.maxEnergy": 160 })).toBe(32);
    const fever = rule("4049802:fever-defense-ignore");
    expect(value(fever, "defenseIgnore", { "summerRobin.atmosphere": 50 })).toBe(0.4);
    expect(condition(fever, {})).toBeNull();
    expect(condition(fever, { "summerRobin.fever": false })).toBe(false);
  });

  it("shares talent levels across grouped subabilities and uses memosprite talent binding", () => {
    expect(snapshot.find((a) => a.id.endsWith("33496730"))?.levelBinding).toBe("talent");
    expect(snapshot.find((a) => a.id.endsWith("10032094"))?.levelBinding).toBe("memosprite:talent");
    expect(snapshot.find((a) => a.id.endsWith("10057535"))?.levelBinding).toBe("memosprite:talent");
    const countdown = rule("10032094:countdown");
    expect(value(countdown, "summerRobin.atmosphere", { "summerRobin.atmosphere": 50 }, 6)).toBe(
      -25,
    );
    expect(value(countdown, "summerRobin.atmosphere", { "summerRobin.atmosphere": 10 }, 6)).toBe(
      -10,
    );
  });

  it("keeps trace attack/crit branches unknown when actor attack is unknown", () => {
    const entries = [rule("1512101:attack-branch"), rule("1512101:crit-branch")];
    for (const entry of entries)
      expect(
        evaluateExpression(entry.effects[0].scope.filter!, {
          parameters: {},
          values: { "target.isEventActor": true, "owner.attack": 1000 },
        }),
      ).toBeNull();
  });

  it("locks Evanescia adjacent damage and resource synchronization caps/origins", () => {
    const skill = rule("52167:skill");
    expect(value(skill, "physical.skill.primary", { "owner.attack": 1000 })).toBe(3000);
    expect(value(skill, "physical.skill.adjacent", { "owner.attack": 1000 })).toBe(1500);
    expect(value(skill, "punchline")).toBe(10);
    const sync = rule("28644:energy-to-reward");
    expect(value(sync, "evanescia.reward", { "event.energyGained": 300 })).toBe(100);
    expect(value(sync, "evanescia.energyCounter", { "event.energyGained": 300 })).toBe(240);
    expect(condition(sync, { "event.fromRewardSync": true })).toBe(false);
    expect(condition(sync, {})).toBeNull();
  });

  it("binds E6 amplification at 1000 reward cap and energy every fourth ultimate after first", () => {
    const amp = rule("character:1505:ranks:6:elation-amplification");
    expect(value(amp, "elation.amplification", { "evanescia.reward": 1500 })).toBeCloseTo(0.35);
    const energy = rule("character:1505:ranks:6:ultimate-energy");
    for (const count of [1, 5, 9])
      expect(condition(energy, { "evanescia.ultimateCastCount": count })).toBe(true);
    for (const count of [2, 4, 6])
      expect(condition(energy, { "evanescia.ultimateCastCount": count })).toBe(false);
    expect(value(energy, "energy.fixed")).toBe(120);
    expect(
      evaluateExpression(energy.unlock, {
        parameters: {},
        values: { "character:1505.eidolon": 5 },
      }),
    ).toBe(false);
  });
});
