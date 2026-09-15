import { createHash } from "node:crypto";
import { stripHtml } from "./catalogue-source.mjs";

/** Ignore presentation whitespace and corrupt control characters, never numbers or words. */
export function normalizeReviewedEffect(text) {
  return stripHtml(text)
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, "");
}

export function reviewedEffectsHash(effects) {
  return createHash("sha256")
    .update(JSON.stringify(effects.map(normalizeReviewedEffect)))
    .digest("hex");
}

export function standingDefinitionMatches(definition, effects) {
  return (
    !!definition &&
    Array.isArray(effects) &&
    definition.review?.standing === "reviewed" &&
    definition.reviewedEffectsHash === reviewedEffectsHash(definition.reviewedEffects) &&
    definition.reviewedEffectsHash === reviewedEffectsHash(effects)
  );
}

function parameterValue(ability, key, level) {
  const curve = ability.parameters?.[key];
  return resolveStandingCurve(curve, level);
}

/** Render explicit source tokens, including unused source parameters without shifting indices. */
export function renderAbilityEffects(ability) {
  const levels = ability.levels;
  if (!Array.isArray(levels) || !levels.length) throw new Error("Missing ability levels");
  return levels.map((level) =>
    ability.descriptionTemplate.replace(
      /\{(p\d+):(percentInteger|percentFixed1|percentFixed2|integer|percent|fixed1|fixed2|number)\}/g,
      (_, key, format) => {
        const value = parameterValue(ability, key, level);
        if (!Number.isFinite(value)) throw new Error(`Unresolved ${key} at level ${level}`);
        if (format === "fixed1") return value.toFixed(1);
        if (format === "fixed2") return value.toFixed(2);
        if (format === "integer") return String(Math.round(value));
        if (format === "percentInteger") return `${Math.round(value * 100)}%`;
        if (format === "percentFixed1") return `${(value * 100).toFixed(1)}%`;
        if (format === "percentFixed2") return `${(value * 100).toFixed(2)}%`;
        if (format === "percent") return `${Number((value * 100).toFixed(8))}%`;
        return String(value);
      },
    ),
  );
}

/** Fresh raw hashes may be bound only after all rank snippets match the reviewed evidence. */
export function bindStandingDefinition(definition, ability) {
  if (!ability || typeof ability.sourceHash !== "string" || !ability.sourceHash) return null;
  let effects;
  try {
    effects = renderAbilityEffects(ability);
  } catch {
    return null;
  }
  if (
    effects.some((text) => /\{p\d+:/.test(text)) ||
    !standingDefinitionMatches(definition, effects)
  )
    return null;
  return {
    ...definition,
    sourceRef: ability.id,
    sourceHash: ability.sourceHash,
    reviewedTemplate: ability.descriptionTemplate,
    reviewedSourceHash: ability.sourceHash,
    // This is deliberately NOT a full CatalogueRule completeness claim.
    review: { ...definition.review, combat: "incomplete" },
  };
}

export function resolveStandingCurve(curve, level = 1) {
  const value = curve.kind === "constant" ? curve.value : curve.values[curve.levels.indexOf(level)];
  if (!Number.isFinite(value)) throw new Error(`Unknown standing curve level ${level}`);
  return value;
}
