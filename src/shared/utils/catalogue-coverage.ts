import type {
  CatalogueRule,
  CatalogueSourceKind,
  CatalogueValidationIssue,
  MechanicCatalogue,
} from "../contracts/catalogue-rules";
import { validateCatalogueRules } from "./catalogue-rules";

export type CatalogueCoverageKind = "character" | "lightCone" | "relic" | "summon";
export interface CatalogueAuditClause {
  id: string;
  /** Hash of the exact clause text, recorded by the manual reviewer. */
  textHash: string;
  ruleIds: readonly string[];
  exclusionReason?: { kind: "pure-note"; reason: string };
}
/** Reviewed attests that clauses enumerate ALL source clauses, not a selected subset.
 * The evaluator verifies this manifest, not natural-language segmentation or semantics.
 * Any source change must invalidate sourceHash and require manual re-review.
 */
export interface CatalogueAbilityAudit {
  sourceRef: string;
  sourceHash: string;
  clauses: readonly CatalogueAuditClause[];
  status: "reviewed" | "pending";
}
export type CatalogueCoverageReason =
  | "missing-audit"
  | "duplicate-audit"
  | "pending-review"
  | "stale-hash"
  | "invalid-source"
  | "invalid-clause"
  | "empty-clauses"
  | "unmapped-clause"
  | "invalid-exclusion"
  | "unknown-rule"
  | "invalid-rule"
  | "wrong-source"
  | "unknown-source";
export interface CatalogueCoverageIssue {
  reason: CatalogueCoverageReason;
  sourceRef: string;
  clauseId?: string;
  ruleId?: string;
}
export interface CatalogueClauseCoverage {
  id: string;
  textHash: string;
  status: "mapped" | "excluded" | "pending";
  ruleIds: readonly string[];
}
export interface CatalogueAbilityCoverage {
  sourceRef: string;
  ownerId: string;
  kind: CatalogueCoverageKind;
  status: "complete" | "pending";
  clauses: CatalogueClauseCoverage[];
  issues: CatalogueCoverageIssue[];
}
export interface CatalogueCoverageSummary {
  abilities: number;
  completeAbilities: number;
  pendingAbilities: number;
  clauses: number;
  mappedClauses: number;
  excludedClauses: number;
  pendingClauses: number;
  /** An empty category is never complete. */
  complete: boolean;
}
export interface CatalogueCoverageReport {
  complete: boolean;
  summary: CatalogueCoverageSummary;
  byKind: Record<CatalogueCoverageKind, CatalogueCoverageSummary>;
  abilities: CatalogueAbilityCoverage[];
  issues: CatalogueCoverageIssue[];
  validationIssues: readonly CatalogueValidationIssue[];
}

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const coverageKind = (kind: CatalogueSourceKind): CatalogueCoverageKind =>
  kind === "trace" || kind === "eidolon" ? "character" : kind;
const summarize = (abilities: readonly CatalogueAbilityCoverage[]): CatalogueCoverageSummary => {
  const clauses = abilities.flatMap((ability) => ability.clauses);
  const completeAbilities = abilities.filter((ability) => ability.status === "complete").length;
  return {
    abilities: abilities.length,
    completeAbilities,
    pendingAbilities: abilities.length - completeAbilities,
    clauses: clauses.length,
    mappedClauses: clauses.filter((clause) => clause.status === "mapped").length,
    excludedClauses: clauses.filter((clause) => clause.status === "excluded").length,
    pendingClauses: clauses.filter((clause) => clause.status === "pending").length,
    complete: abilities.length > 0 && completeAbilities === abilities.length,
  };
};

/** Pure clause-manifest verification. Never derives audits from rules or source prose. */
export function evaluateCatalogueCoverage(
  catalogue: MechanicCatalogue,
  rules: readonly CatalogueRule[],
  audits: readonly CatalogueAbilityAudit[],
): CatalogueCoverageReport {
  const validation = validateCatalogueRules(catalogue, rules);
  const ruleIndex = new Map(rules.map((rule) => [rule.id, rule]));
  const effectIndex = new Map<string, CatalogueRule>(
    rules.flatMap((rule) =>
      rule.effects.map((effect) => [`${rule.id}/${effect.id}`, rule] as const),
    ),
  );
  const sources = new Map(catalogue.abilities.map((ability) => [ability.id, ability]));
  const derivedRefs = (value: unknown, depth = 0): string[] => {
    if (!value || typeof value !== "object" || depth > 100) return [];
    const node = value as Record<string, unknown>;
    if (node.kind === "derived" && typeof node.contributionId === "string")
      return [node.contributionId];
    return Object.values(node).flatMap((child) => derivedRefs(child, depth + 1));
  };
  const validRule = (rule: CatalogueRule, active = new Set<string>()): boolean => {
    if (
      active.has(rule.id) ||
      rule.status !== "reviewed" ||
      !nonempty(rule.sourceHash) ||
      rule.sourceHash !== sources.get(rule.sourceRef)?.sourceHash ||
      !rule.effects.length ||
      validation.issues.some(
        (issue) =>
          issue.severity === "error" &&
          (issue.ruleId === rule.id ||
            issue.abilityId === rule.sourceRef ||
            (!issue.ruleId && !issue.abilityId)),
      )
    )
      return false;
    const next = new Set(active).add(rule.id);
    return derivedRefs(rule).every((ref) => {
      const dependency = effectIndex.get(ref);
      return dependency !== undefined && validRule(dependency, next);
    });
  };
  const sourceIds = new Set(catalogue.abilities.map((ability) => ability.id));
  const auditIndex = new Map<string, CatalogueAbilityAudit[]>();
  for (const audit of audits) {
    const entries = auditIndex.get(audit.sourceRef) ?? [];
    entries.push(audit);
    auditIndex.set(audit.sourceRef, entries);
  }
  const issues: CatalogueCoverageIssue[] = audits
    .filter((audit) => !sourceIds.has(audit.sourceRef))
    .map((audit) => ({ sourceRef: audit.sourceRef, reason: "unknown-source" }));
  const abilities: CatalogueAbilityCoverage[] = catalogue.abilities.map((ability) => {
    const localIssues: CatalogueCoverageIssue[] = [];
    const fail = (reason: CatalogueCoverageReason, clauseId?: string, ruleId?: string) =>
      localIssues.push({ sourceRef: ability.id, reason, clauseId, ruleId });
    const entries = auditIndex.get(ability.id) ?? [];
    const audit = entries.length === 1 ? entries[0] : undefined;
    if (!entries.length) fail("missing-audit");
    if (entries.length > 1) fail("duplicate-audit");
    const invalidSource =
      !nonempty(ability.sourceHash) ||
      validation.issues.some(
        (issue) =>
          issue.severity === "error" &&
          ((!issue.ruleId && !issue.abilityId) || issue.abilityId === ability.id),
      );
    if (invalidSource) fail("invalid-source");
    if (audit && audit.status !== "reviewed") fail("pending-review");
    if (audit && (!nonempty(audit.sourceHash) || audit.sourceHash !== ability.sourceHash))
      fail("stale-hash");
    if (audit && (!Array.isArray(audit.clauses) || audit.clauses.length === 0))
      fail("empty-clauses");
    const auditReady = localIssues.length === 0;
    const clauses = Array.isArray(audit?.clauses) ? audit.clauses : [];
    const idCounts = new Map<string, number>();
    for (const clause of clauses)
      if (clause) idCounts.set(clause.id, (idCounts.get(clause.id) ?? 0) + 1);
    const clauseCoverage: CatalogueClauseCoverage[] = clauses.map((clause) => {
      const before = localIssues.length;
      const id = clause?.id ?? "";
      const textHash = clause?.textHash ?? "";
      const ruleIds = Array.isArray(clause?.ruleIds) ? [...clause.ruleIds] : [];
      if (
        !clause ||
        !nonempty(id) ||
        !nonempty(textHash) ||
        idCounts.get(id)! > 1 ||
        !Array.isArray(clause.ruleIds) ||
        ruleIds.some((id) => !nonempty(id)) ||
        new Set(ruleIds).size !== ruleIds.length
      )
        fail("invalid-clause", id);
      const exclusion = clause?.exclusionReason;
      if (
        exclusion !== undefined &&
        (!exclusion ||
          exclusion.kind !== "pure-note" ||
          !nonempty(exclusion.reason) ||
          ruleIds.length > 0)
      )
        fail("invalid-exclusion", id);
      if (ruleIds.length === 0 && exclusion === undefined) fail("unmapped-clause", id);
      for (const ruleId of ruleIds) {
        const rule = ruleIndex.get(ruleId);
        if (!rule) {
          fail("unknown-rule", id, ruleId);
          continue;
        }
        if (rule.sourceRef !== ability.id) fail("wrong-source", id, ruleId);
        if (!validRule(rule)) fail("invalid-rule", id, ruleId);
      }
      return {
        id,
        textHash,
        ruleIds,
        status:
          !auditReady || localIssues.length > before
            ? "pending"
            : exclusion !== undefined
              ? "excluded"
              : "mapped",
      };
    });
    issues.push(...localIssues);
    return {
      sourceRef: ability.id,
      ownerId: ability.ownerId,
      kind: coverageKind(ability.sourceKind),
      status: localIssues.length === 0 && clauseCoverage.length > 0 ? "complete" : "pending",
      clauses: clauseCoverage,
      issues: localIssues,
    };
  });
  const summary = summarize(abilities);
  summary.complete = summary.complete && issues.length === 0;
  const byKind = Object.fromEntries(
    (["character", "lightCone", "relic", "summon"] as const).map((kind) => [
      kind,
      summarize(abilities.filter((ability) => ability.kind === kind)),
    ]),
  ) as CatalogueCoverageReport["byKind"];
  return {
    complete: summary.complete && issues.length === 0,
    summary,
    byKind,
    abilities,
    issues,
    validationIssues: validation.issues,
  };
}
