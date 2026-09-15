import type { CatalogueAbility, MechanicCatalogue } from "./catalogue-rules";

/** Approximate definitions are deliberately separate from CatalogueRule. */
export type MechanismAmount =
  | { kind: "parameter"; key: string }
  | { kind: "constant"; value: number; start: number; end: number };
export interface MechanismOperation {
  kind: "damage" | "healing" | "shield" | "unsupported";
  target: "enemy" | "ally" | "self" | "team" | "randomAlly" | "randomEnemy" | "allEnemies";
  scaling: "attack" | "hp" | "defense" | "flat";
  amount?: MechanismAmount;
  offset?: MechanismAmount;
  repeats: number;
  decay: number;
  strategy: "direct" | "dot" | "break" | "superbreak" | "elation" | "true" | "healing" | "shield";
  limitation: string;
}
export interface MechanismClause {
  id: string;
  start: number;
  end: number;
  parameterRefs: string[];
  literals: { value: number; start: number; end: number; unit: "ratio" | "number" }[];
  /** Clauses with uncompiled gates must not run unconditionally. */
  activation: "selectedAbility" | "unresolvedCondition";
  operations: MechanismOperation[];
}
export interface AbilityMechanism {
  sourceRef: string;
  sourceHash: string;
  ownerId: string;
  adoption: "candidate" | "adopted";
  precision: "approximate";
  clauses: MechanismClause[];
  unusedParameters: string[];
}
export interface MechanismLibrary {
  schemaVersion: 1;
  compilerVersion: string;
  dataVersion: string;
  definitions: AbilityMechanism[];
}
export interface ExplainedAbility {
  ability: CatalogueAbility;
  level: number;
  description: string;
  parameters: Readonly<Record<string, number | boolean | string | null>>;
  definition: AbilityMechanism;
}
export interface ScenarioEntity {
  id: string;
  ownerId?: string;
  side: "ally" | "enemy";
  level: number;
  hp: number;
  maxHp: number;
  shield: number;
  attack: number;
  defense: number;
  resistance: number;
}
export interface ScenarioInput {
  abilityId: string;
  level: number;
  seed?: number;
  actorId: string;
  selectedTargetId?: string;
  entities: readonly ScenarioEntity[];
}
export interface ScenarioStep {
  clauseId: string;
  operation: string;
  targetId?: string;
  roll?: number;
  baseAmount?: number;
  actualAmount?: number;
  formula?: string;
  before?: { hp: number; shield: number };
  after?: { hp: number; shield: number };
  skipped?: string;
}
export interface ScenarioResult {
  seed: number;
  prngVersion: "mulberry32-v1";
  dataVersion: string;
  assumptions: string[];
  entities: ScenarioEntity[];
  steps: ScenarioStep[];
  truncated: boolean;
}
export interface ScenarioData {
  catalogue: MechanicCatalogue;
  library: MechanismLibrary;
}
