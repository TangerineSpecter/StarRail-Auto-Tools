/** Values are finite numbers, booleans, or strings; null is explicitly unknown. */
export type RuleValue = number | boolean | string | null;
export type RuleUnit = "flat" | "ratio" | "percent" | "count" | "boolean" | "text";
export type ParameterCurve =
  | { kind: "constant"; value: number }
  | { kind: "table"; levels: readonly number[]; values: readonly number[] };
export type CatalogueSourceKind =
  "character" | "trace" | "eidolon" | "summon" | "lightCone" | "relic";
export interface CatalogueAbility {
  id: string;
  sourceNodeId: string;
  ownerId: string;
  groupId: string;
  slot: string;
  name: string;
  descriptionTemplate: string;
  levelBinding: string | null;
  levels: readonly number[];
  sourceKind: CatalogueSourceKind;
  parameters: Readonly<Record<string, ParameterCurve>>;
  parameterUnits?: Readonly<Record<string, RuleUnit>>;
  sourceHash: string;
}
export interface MechanicCatalogue {
  schemaVersion: 1;
  owners?: readonly CatalogueOwner[];
  abilities: readonly CatalogueAbility[];
}
export interface CatalogueOwner {
  id: string;
  sourceKind: CatalogueSourceKind;
  slug: string;
  name: string;
  gameId: string | number;
  parentOwnerId?: string;
  source: { url: string; mapping: { slug: string; gameId: string | number } };
  abilityIds: readonly string[];
}
export type ArithmeticOperator = "add" | "subtract" | "multiply" | "divide" | "min" | "max";
export type ComparisonOperator = "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
/** No executable strings, property traversal, or implicit coercion. */
export type RuleExpression =
  | { kind: "literal"; value: RuleValue }
  | { kind: "param"; key: string }
  | { kind: "context"; key: string }
  | { kind: "derived"; contributionId: string }
  | { kind: "arithmetic"; op: ArithmeticOperator; left: RuleExpression; right: RuleExpression }
  | { kind: "compare"; op: ComparisonOperator; left: RuleExpression; right: RuleExpression }
  | { kind: "boolean"; op: "and" | "or"; operands: readonly RuleExpression[] }
  | { kind: "not"; operand: RuleExpression }
  | { kind: "if"; condition: RuleExpression; then: RuleExpression; else: RuleExpression }
  | { kind: "floor" | "ceil" | "round"; operand: RuleExpression }
  | { kind: "clamp"; value: RuleExpression; min: RuleExpression; max: RuleExpression };
export type RuleEnvironment = "standing" | "combat";
export type RuleActivation =
  | { kind: "passive" }
  | { kind: "condition"; condition: RuleExpression }
  | { kind: "event"; event: string; condition?: RuleExpression };
export interface RuleScope {
  /** team includes the source itself; use filter to explicitly exclude it. */
  target: "self" | "team" | "enemy" | "all";
  filter?: RuleExpression;
}
export interface CatalogueRuleEffect {
  id: string;
  kind:
    | "stat_modifier"
    | "hit_definition"
    | "resource_delta"
    | "action_adjustment"
    | "summon_change"
    | "state_change"
    | "skill_level_delta"
    | "healing"
    | "shield";
  stat: string;
  unit: RuleUnit;
  expression: RuleExpression;
  scope: RuleScope;
  operation?: "add" | "multiply" | "multiplicative_complement" | "max" | "override";
  duration?: {
    kind: "turns" | "actions" | "permanent";
    value?: number;
    valueExpression?: RuleExpression;
    clock?: "owner" | "target" | "global";
    expiry?: "start" | "end";
  };
  stacking?: { key: string; mode: "add" | "replace" | "max"; maxStacks: number };
  snapshot?: "activation" | "dynamic";
  snapshotKeys?: readonly string[];
  settlement?: {
    kind: "base_healing" | "base_damage";
    scalingStat: "hp" | "attack" | "defense";
    entity: "owner" | "target";
    attributeStage: "effective" | "base";
    readAt: "hit" | "activation";
    sequenceIndex?: number;
    selection: "selected" | "random" | "all" | "event_actor";
  };
}
export interface CatalogueRule {
  id: string;
  sourceRef: string;
  sourceHash: string;
  status: "reviewed" | "pending";
  ruleVersion: 1;
  activation: RuleActivation;
  environments: readonly RuleEnvironment[];
  /** Explicit even when unconditional: use a literal true expression. */
  unlock: RuleExpression;
  effects: readonly CatalogueRuleEffect[];
  reference?: { url: string; commit: string; notes: readonly string[] };
}
export interface RuleTarget {
  id: string;
  kind: "self" | "team" | "enemy";
  values: Readonly<Record<string, RuleValue>>;
}
export interface RuleEvaluationContext {
  environment: RuleEnvironment;
  bindings: Readonly<Record<string, number>>;
  values: Readonly<Record<string, RuleValue>>;
  targets: readonly RuleTarget[];
  event?: string;
}
export interface ResolvedAbility {
  ability: CatalogueAbility;
  level: number | null;
  parameters: Readonly<Record<string, RuleValue>>;
  description: string;
}
export interface ExpressionContext {
  parameters: Readonly<Record<string, RuleValue>>;
  values: Readonly<Record<string, RuleValue>>;
  derived?: (contributionId: string) => RuleValue;
}
export type RuleSkipReason =
  | "invalid"
  | "pending"
  | "hash-mismatch"
  | "environment"
  | "locked"
  | "unknown"
  | "inactive"
  | "cycle";
export interface RuleTrace {
  ruleId: string;
  effectId?: string;
  targetId?: string;
  reason: RuleSkipReason;
  missingKeys?: readonly string[];
}
export interface RuleContribution {
  id: string;
  ruleId: string;
  sourceRef: string;
  sourceHash: string;
  targetId: string;
  stat: string;
  unit: RuleUnit;
  value: number;
  kind: CatalogueRuleEffect["kind"];
  operation?: CatalogueRuleEffect["operation"];
  duration?: CatalogueRuleEffect["duration"];
  stacking?: CatalogueRuleEffect["stacking"];
  snapshot?: CatalogueRuleEffect["snapshot"];
  snapshotValues?: Readonly<Record<string, RuleValue>>;
  /** Exact resolved inputs, not the rounded description values. */
  parameters?: Readonly<Record<string, RuleValue>>;
  settlement?: CatalogueRuleEffect["settlement"];
  reference?: CatalogueRule["reference"];
}
export interface RuleTriggerCandidate {
  ruleId: string;
  event: string;
  contributions: readonly RuleContribution[];
}
export interface RuleEvaluationResult {
  contributions: RuleContribution[];
  triggerCandidates: RuleTriggerCandidate[];
  trace: RuleTrace[];
}
export interface CatalogueValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  abilityId?: string;
  ruleId?: string;
}
export interface CatalogueValidationResult {
  valid: boolean;
  issues: CatalogueValidationIssue[];
  coverage: { total: number; covered: number; reviewed: number };
}
