import definitionsJson from "@/data/standing-rule-definitions.json";
import lightConesJson from "@/data/light-cones.json";
import relicsJson from "@/data/relic-sets.json";
import { pathLabel } from "@/shared/catalogue/relic-options";
import bindingsJson from "@/data/standing-rule-bindings.json";
import fingerprintsJson from "@/data/catalogue-mechanics-fingerprints.json";

type NumericCurve =
  { kind: "constant"; value: number } | { kind: "table"; levels: number[]; values: number[] };
interface StandingDefinition {
  review: { standing: string };
  reviewedEffects: string[];
  bonuses: Array<{ key: string; curve: NumericCurve }>;
  conversions: Array<{
    key: string;
    inputKey: string;
    ratio: NumericCurve;
    cap: NumericCurve;
    inputOffset?: number;
  }>;
}
interface StandingDefinitions {
  lightCones: Record<string, StandingDefinition>;
  relics: Record<string, { twoPiece: StandingDefinition; fourPiece: StandingDefinition }>;
}
export interface StandingEquipment {
  lightConeId: number;
  superimposition: number;
  sets: Array<{ setId: number; count: number }>;
  /** Explicit account/entity values. Never infer an unknown energy cap as zero. */
  entityStats?: Readonly<Record<string, number>>;
  /** Absent only for standalone catalogue preview, not equipped character evaluation. */
  characterPath?: string;
}
export interface StandingRuleContribution {
  sourceId: string;
  sourceRef: string;
  sourceHash: string;
  key: string;
  value: number;
}
export interface StandingConversion {
  sourceId: string;
  sourceRef: string;
  sourceHash: string;
  key: string;
  inputKey: string;
  ratio: number;
  cap: number;
  inputOffset: number;
}
const definitions = definitionsJson as unknown as StandingDefinitions;
const coneEffects = new Map(
  lightConesJson.lightCones.map((entry) => [entry.id, entry.skill?.effects ?? []]),
);
const setEffects = new Map(relicsJson.sets.map((entry) => [entry.id, entry.effects]));
const conePaths = new Map(lightConesJson.lightCones.map((entry) => [entry.id, entry.path]));
interface StandingBinding {
  sourceRef: string;
  sourceHash: string;
}
const bindings = bindingsJson as unknown as {
  lightCones: Record<number, StandingBinding>;
  relics: Record<number, Partial<Record<"twoPiece" | "fourPiece", StandingBinding>>>;
};
const fingerprints = fingerprintsJson as Readonly<Record<string, string>>;
const approved = new WeakMap<StandingDefinition, StandingBinding>();
function approve(
  entry: StandingDefinition | undefined,
  effects: string[],
  binding: StandingBinding | undefined,
) {
  if (
    entry?.review.standing === "reviewed" &&
    binding?.sourceHash &&
    fingerprints[binding.sourceRef] === binding.sourceHash &&
    JSON.stringify(entry.reviewedEffects) === JSON.stringify(effects)
  )
    approved.set(entry, binding);
}
for (const [id, effects] of coneEffects)
  approve(definitions.lightCones[id], effects, bindings.lightCones[id]);
for (const [id, effects] of setEffects) {
  approve(definitions.relics[id]?.twoPiece, [effects.twoPiece], bindings.relics[id]?.twoPiece);
  if (effects.fourPiece)
    approve(definitions.relics[id]?.fourPiece, [effects.fourPiece], bindings.relics[id]?.fourPiece);
}

function curveValue(curve: NumericCurve, level: number): number | undefined {
  const value = curve.kind === "constant" ? curve.value : curve.values[curve.levels.indexOf(level)];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** ID-bound reviewed snapshots. Changed descriptions fail closed; no runtime text inference. */
export function reviewedStandingRules(equipment: StandingEquipment) {
  const contributions: StandingRuleContribution[] = [];
  const conversions: StandingConversion[] = [];
  const unreviewedSources: string[] = [];
  const missingInputs: string[] = [];
  function add(sourceId: string, entry: StandingDefinition | undefined, level: number) {
    if (!entry || !approved.has(entry)) {
      unreviewedSources.push(sourceId);
      return;
    }
    const provenance = approved.get(entry)!;
    for (const bonus of entry.bonuses) {
      const value = curveValue(bonus.curve, level);
      if (value === undefined) unreviewedSources.push(sourceId);
      else contributions.push({ sourceId, ...provenance, key: bonus.key, value });
    }
    for (const conversion of entry.conversions) {
      const ratio = curveValue(conversion.ratio, level);
      const cap = curveValue(conversion.cap, level);
      if (ratio === undefined || cap === undefined) unreviewedSources.push(sourceId);
      else if (
        conversion.inputKey === "Max Energy" &&
        !Number.isFinite(equipment.entityStats?.[conversion.inputKey])
      )
        missingInputs.push(`${sourceId}:Max Energy`);
      else
        conversions.push({
          sourceId,
          ...provenance,
          key: conversion.key,
          inputKey: conversion.inputKey,
          ratio,
          cap,
          inputOffset: conversion.inputOffset ?? 0,
        });
    }
  }
  const conePath = conePaths.get(equipment.lightConeId);
  const pathKnown = equipment.characterPath === undefined || Boolean(equipment.characterPath);
  if (!pathKnown) missingInputs.push("character.path");
  const pathMatches =
    equipment.characterPath === undefined || pathLabel(equipment.characterPath) === conePath;
  if (equipment.lightConeId && pathKnown && (pathMatches || !conePath)) {
    if (
      !Number.isInteger(equipment.superimposition) ||
      equipment.superimposition < 1 ||
      equipment.superimposition > 5
    )
      unreviewedSources.push(`lightCone/${equipment.lightConeId}`);
    else
      add(
        `lightCone/${equipment.lightConeId}`,
        definitions.lightCones[equipment.lightConeId],
        equipment.superimposition,
      );
  }
  const counts = new Map<number, number>();
  for (const set of equipment.sets) counts.set(set.setId, (counts.get(set.setId) ?? 0) + set.count);
  for (const [id, count] of counts) {
    const effects = setEffects.get(id);
    if (count >= 2) add(`relic/${id}/2`, definitions.relics[id]?.twoPiece, 1);
    if (count >= 4 && effects?.fourPiece)
      add(`relic/${id}/4`, definitions.relics[id]?.fourPiece, 1);
  }
  return {
    contributions,
    conversions,
    unreviewedSources: [...new Set(unreviewedSources)],
    missingInputs: [...new Set(missingInputs)],
  };
}

export function standingEquipment(
  lightCone: { templateId: number; superimposition?: number },
  relics: ReadonlyArray<{ setId: number }>,
  characterPath?: string,
): StandingEquipment {
  const counts = new Map<number, number>();
  for (const relic of relics) counts.set(relic.setId, (counts.get(relic.setId) ?? 0) + 1);
  return {
    lightConeId: lightCone.templateId,
    superimposition: lightCone.superimposition ?? 1,
    sets: [...counts].map(([setId, count]) => ({ setId, count })),
    ...(characterPath === undefined ? {} : { characterPath }),
  };
}
