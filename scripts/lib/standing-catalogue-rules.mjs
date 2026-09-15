import { bindStandingDefinition, resolveStandingCurve } from "./standing-rule-definitions.mjs";

const literal = (value) => ({ kind: "literal", value });
const context = (key) => ({ kind: "context", key });
const compare = (op, left, right) => ({ kind: "compare", op, left, right });
const arithmetic = (op, left, right) => ({ kind: "arithmetic", op, left, right });
const and = (operands) => ({ kind: "boolean", op: "and", operands });
const energyTemplate =
  "使装备者的暴击伤害提高{p1:percentInteger}，能量恢复效率提高{p4:percentFixed1}。装备者的能量上限大于{p5:integer}时，每超出10点能量上限额外使能量恢复效率提高{p6:percentFixed1}，最多计入{p7:integer}点超出的能量上限。装备者施放欢愉技时，使敌方全体受到的伤害提高{p2:percentFixed1}，持续{p3:integer}回合，同类效果无法叠加。";
const param = (key) => ({ kind: "param", key });

/** Exact numeric equality across every reviewed level; never select by parameter name. */
function expressionForCurve(curve, ability) {
  const expected = ability.levels.map((level) => resolveStandingCurve(curve, level));
  for (const key of Object.keys(ability.parameters).sort()) {
    const raw = ability.parameters[key];
    let values;
    try {
      values = ability.levels.map((level) => resolveStandingCurve(raw, level));
    } catch {
      continue;
    }
    if (values.every((value, index) => value === expected[index])) return { kind: "param", key };
  }
  // Reviewed authored constants need no duplicated parameter table.
  if (curve.kind === "constant") return literal(curve.value);
  throw new Error("unmatched-curve");
}

/**
 * selector: {lightConeId,path} or {setId,pieceCount:2|4}.
 * Context contract: equipment.lightConeId, equipment.superimposition,
 * character.path, equipment.lightConePath, equipment.relicCounts.<id>.
 * Conversion inputs are ratios under stats.effectHitRate / stats.effectRes,
 * or flat points under entity.maxEnergy. Missing values stay evaluator-unknown.
 * No runtime integration or full mechanic coverage claim is performed here.
 */
export function buildStandingCatalogueRules({ definition, ability, selector }) {
  const reject = (reason) => ({
    rules: [],
    rejected: [{ sourceRef: ability?.id ?? null, reason }],
  });
  const bound = bindStandingDefinition(definition, ability);
  if (!bound) return reject("description-mismatch");
  let unlock;
  if (ability.sourceKind === "lightCone") {
    if (
      !Number.isInteger(selector?.lightConeId) ||
      ability.ownerId !== `lightcone:${selector.lightConeId}` ||
      typeof selector.path !== "string" ||
      !selector.path
    )
      return reject("identity-mismatch");
    unlock = and([
      compare("eq", context("equipment.lightConeId"), literal(selector.lightConeId)),
      compare("eq", context("equipment.lightConePath"), literal(selector.path)),
      compare("eq", context("character.path"), literal(selector.path)),
      {
        kind: "boolean",
        op: "or",
        operands: ability.levels.map((level) =>
          compare("eq", context("equipment.superimposition"), literal(level)),
        ),
      },
      ...(ability.levelBinding
        ? [
            compare(
              "eq",
              context("equipment.superimposition"),
              context(`binding.${ability.levelBinding}`),
            ),
          ]
        : []),
    ]);
  } else if (ability.sourceKind === "relic") {
    if (
      !Number.isInteger(selector?.setId) ||
      ability.ownerId !== `relic:${selector.setId}` ||
      ![2, 4].includes(selector.pieceCount) ||
      ability.slot !== (selector.pieceCount === 2 ? "twoPiece" : "fourPiece")
    )
      return reject("identity-mismatch");
    unlock = compare(
      "gte",
      context(`equipment.relicCounts.${selector.setId}`),
      literal(selector.pieceCount),
    );
  } else return reject("source-kind");
  const effects = [];
  try {
    for (const [index, bonus] of definition.bonuses.entries())
      effects.push({
        id: `bonus:${index}`,
        kind: "stat_modifier",
        stat: bonus.key,
        unit: ["SPD", "Base SPD"].includes(bonus.key) ? "flat" : "ratio",
        expression: expressionForCurve(bonus.curve, ability),
        scope: { target: "self" },
        operation: "add",
      });
    const inputs = {
      "Effect Hit Rate": "stats.effectHitRate",
      "Effect RES": "stats.effectRes",
      "Max Energy": "entity.maxEnergy",
    };
    for (const [index, conversion] of definition.conversions.entries()) {
      const inputKey = inputs[conversion.inputKey];
      if (!inputKey) throw new Error("unsupported-conversion-input");
      const offset = conversion.inputOffset ?? 0;
      if (!Number.isFinite(offset)) throw new Error("invalid-offset");
      const energy = ability.ownerId === "lightcone:23058" && conversion.inputKey === "Max Energy";
      if (
        energy &&
        (ability.descriptionTemplate !== energyTemplate ||
          ability.levels.some(
            (level) =>
              resolveStandingCurve(ability.parameters.p5, level) !== 120 ||
              resolveStandingCurve(ability.parameters.p6, level) !== 0.0029999998 ||
              resolveStandingCurve(ability.parameters.p7, level) !== 360,
          ))
      )
        throw new Error("unreviewed-energy-parameter-mapping");
      const ratio = energy
        ? arithmetic("divide", param("p6"), literal(10))
        : expressionForCurve(conversion.ratio, ability);
      const cap = energy
        ? arithmetic("multiply", param("p7"), ratio)
        : expressionForCurve(conversion.cap, ability);
      effects.push({
        id: `conversion:${index}`,
        kind: "stat_modifier",
        stat: conversion.key,
        unit: "ratio",
        scope: { target: "self" },
        operation: "add",
        expression: {
          kind: "clamp",
          min: literal(0),
          max: cap,
          value: arithmetic(
            "multiply",
            arithmetic(
              "max",
              literal(0),
              arithmetic("subtract", context(inputKey), energy ? param("p5") : literal(offset)),
            ),
            ratio,
          ),
        },
      });
    }
  } catch (error) {
    return reject(error.message);
  }
  return {
    rules: effects.length
      ? [
          {
            id: `${ability.id}:standing`,
            sourceRef: ability.id,
            sourceHash: ability.sourceHash,
            status: "reviewed",
            ruleVersion: 1,
            activation: { kind: "passive" },
            environments: ["standing", "combat"],
            unlock,
            effects,
          },
        ]
      : [],
    rejected: [],
    review: { standing: "reviewed", combatStatPassives: "reviewed", fullMechanics: "incomplete" },
  };
}
