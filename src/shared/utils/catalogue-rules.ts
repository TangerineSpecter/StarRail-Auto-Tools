import type {
  CatalogueAbility,
  CatalogueRule,
  CatalogueRuleEffect,
  CatalogueValidationIssue,
  CatalogueValidationResult,
  ExpressionContext,
  MechanicCatalogue,
  ResolvedAbility,
  RuleContribution,
  RuleEvaluationContext,
  RuleEvaluationResult,
  RuleExpression,
  RuleTarget,
  RuleUnit,
  RuleValue,
} from "../contracts/catalogue-rules";

const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;
const safe = (value: RuleValue | undefined): RuleValue =>
  value === undefined || (typeof value === "number" && !Number.isFinite(value)) ? null : value;
const bool = (value: RuleValue): boolean | null => (typeof value === "boolean" ? value : null);
const unitMatches = (unit: RuleUnit, value: RuleValue): boolean =>
  value === null ||
  (unit === "boolean"
    ? typeof value === "boolean"
    : unit === "text"
      ? typeof value === "string"
      : typeof value === "number" && Number.isFinite(value));

/** JSON boundary guard: no malformed nodes reach the recursive evaluator. */
function validExpression(value: unknown, depth = 0): value is RuleExpression {
  if (!value || typeof value !== "object" || depth > 100) return false;
  const node = value as Record<string, unknown>;
  const child = (key: string) => validExpression(node[key], depth + 1);
  switch (node.kind) {
    case "literal":
      return (
        node.value === null ||
        typeof node.value === "string" ||
        typeof node.value === "boolean" ||
        (typeof node.value === "number" && Number.isFinite(node.value))
      );
    case "param":
    case "context":
      return typeof node.key === "string" && node.key.length > 0;
    case "derived":
      return typeof node.contributionId === "string" && node.contributionId.length > 0;
    case "arithmetic":
      return (
        ["add", "subtract", "multiply", "divide", "min", "max"].includes(String(node.op)) &&
        child("left") &&
        child("right")
      );
    case "compare":
      return (
        ["eq", "ne", "lt", "lte", "gt", "gte"].includes(String(node.op)) &&
        child("left") &&
        child("right")
      );
    case "boolean":
      return (
        (node.op === "and" || node.op === "or") &&
        Array.isArray(node.operands) &&
        node.operands.every((item) => validExpression(item, depth + 1))
      );
    case "not":
    case "floor":
    case "ceil":
    case "round":
      return child("operand");
    case "if":
      return child("condition") && child("then") && child("else");
    case "clamp":
      return child("value") && child("min") && child("max");
    default:
      return false;
  }
}

/** Table lookup is exact: unsupported levels never clamp or interpolate. */
export function resolveAbility(
  ability: CatalogueAbility,
  levelOrBindings: number | Readonly<Record<string, number>> = {},
): ResolvedAbility {
  const level =
    typeof levelOrBindings === "number"
      ? levelOrBindings
      : ability.levelBinding === null
        ? null
        : (own(levelOrBindings, ability.levelBinding) ?? null);
  const supported = level !== null && Number.isInteger(level) && ability.levels.includes(level);
  const parameters = Object.fromEntries(
    Object.entries(ability.parameters).map(([key, curve]) => {
      const value =
        curve.kind === "constant"
          ? safe(curve.value)
          : supported
            ? safe(curve.values[curve.levels.indexOf(level!)])
            : null;
      return [key, value];
    }),
  );
  return {
    ability,
    level,
    parameters,
    description: ability.descriptionTemplate.replace(
      /\{([^{}:]+)(?::([^{}]+))?\}/g,
      (_match, key: string, format?: string) => {
        const value = own(parameters, key);
        if (typeof value !== "number") return "?";
        if (format === "integer") return String(Math.round(value));
        if (format === "percentInteger") return `${Math.round(value * 100)}%`;
        if (format === "percentFixed1") return `${(value * 100).toFixed(1)}%`;
        if (format === "percentFixed2") return `${(value * 100).toFixed(2)}%`;
        if (format === "percent") return `${Number((value * 100).toFixed(8))}%`;
        if (format === "fixed1") return value.toFixed(1);
        if (format === "fixed2") return value.toFixed(2);
        return String(value);
      },
    ),
  };
}

/** Strong Kleene boolean logic; all other operations propagate unknown. */
export function evaluateExpression(
  expression: RuleExpression,
  context: ExpressionContext,
  depth = 0,
): RuleValue {
  if (depth > 100 || !expression || (depth === 0 && !validExpression(expression))) return null;
  const evaluate = (child: RuleExpression) => evaluateExpression(child, context, depth + 1);
  switch (expression.kind) {
    case "literal":
      return safe(expression.value);
    case "param":
      return safe(own(context.parameters, expression.key));
    case "context":
      return safe(own(context.values, expression.key));
    case "derived":
      return safe(context.derived?.(expression.contributionId));
    case "if": {
      const condition = bool(evaluate(expression.condition));
      return condition === null ? null : evaluate(condition ? expression.then : expression.else);
    }
    case "floor":
    case "ceil":
    case "round": {
      const value = evaluate(expression.operand);
      return typeof value === "number" ? Math[expression.kind](value) : null;
    }
    case "clamp": {
      const value = evaluate(expression.value),
        min = evaluate(expression.min),
        max = evaluate(expression.max);
      return typeof value === "number" &&
        typeof min === "number" &&
        typeof max === "number" &&
        min <= max
        ? Math.min(max, Math.max(min, value))
        : null;
    }
    case "not": {
      const value = bool(evaluate(expression.operand));
      return value === null ? null : !value;
    }
    case "boolean": {
      const values = expression.operands.map((operand) => bool(evaluate(operand)));
      if (expression.op === "and")
        return values.includes(false) ? false : values.includes(null) ? null : true;
      if (expression.op === "or")
        return values.includes(true) ? true : values.includes(null) ? null : false;
      return null;
    }
    case "arithmetic": {
      const left = evaluate(expression.left),
        right = evaluate(expression.right);
      if (typeof left !== "number" || typeof right !== "number") return null;
      switch (expression.op) {
        case "add":
          return safe(left + right);
        case "subtract":
          return safe(left - right);
        case "multiply":
          return safe(left * right);
        case "divide":
          return right === 0 ? null : safe(left / right);
        case "min":
          return Math.min(left, right);
        case "max":
          return Math.max(left, right);
        default:
          return null;
      }
    }
    case "compare": {
      const left = evaluate(expression.left),
        right = evaluate(expression.right);
      if (left === null || right === null || typeof left !== typeof right) return null;
      if (expression.op === "eq") return left === right;
      if (expression.op === "ne") return left !== right;
      if (typeof left !== "number" || typeof right !== "number") return null;
      switch (expression.op) {
        case "lt":
          return left < right;
        case "lte":
          return left <= right;
        case "gt":
          return left > right;
        case "gte":
          return left >= right;
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

function references(expression: RuleExpression | undefined, depth = 0): RuleExpression[] {
  if (!expression || depth > 100) return [];
  switch (expression.kind) {
    case "arithmetic":
    case "compare":
      return [
        expression,
        ...references(expression.left, depth + 1),
        ...references(expression.right, depth + 1),
      ];
    case "boolean":
      return [expression, ...expression.operands.flatMap((child) => references(child, depth + 1))];
    case "not":
    case "floor":
    case "ceil":
    case "round":
      return [expression, ...references(expression.operand, depth + 1)];
    case "if":
      return [
        expression,
        ...references(expression.condition, depth + 1),
        ...references(expression.then, depth + 1),
        ...references(expression.else, depth + 1),
      ];
    case "clamp":
      return [
        expression,
        ...references(expression.value, depth + 1),
        ...references(expression.min, depth + 1),
        ...references(expression.max, depth + 1),
      ];
    default:
      return [expression];
  }
}

export function validateCatalogueRules(
  catalogue: MechanicCatalogue,
  rules: readonly CatalogueRule[],
): CatalogueValidationResult {
  const issues: CatalogueValidationIssue[] = [];
  const issue = (
    code: string,
    message: string,
    ruleId?: string,
    abilityId?: string,
    severity: "error" | "warning" = "error",
  ) => issues.push({ code, message, ruleId, abilityId, severity });
  if (catalogue.schemaVersion !== 1)
    issue("schema-version", "Unsupported catalogue schema version");
  const abilities = new Map<string, CatalogueAbility>();
  for (const ability of catalogue.abilities) {
    if (!ability.id || abilities.has(ability.id))
      issue("duplicate-ability", "Ability IDs must be unique", undefined, ability.id);
    abilities.set(ability.id, ability);
    if (!ability.sourceHash.trim())
      issue("source-hash", "Ability hash is required", undefined, ability.id);
    for (const [key, curve] of Object.entries(ability.parameters)) {
      const values = curve.kind === "constant" ? [curve.value] : curve.values;
      if (values.some((value) => typeof value !== "number" || !Number.isFinite(value)))
        issue("parameter-value", `Invalid numeric value for ${key}`, undefined, ability.id);
      const unit = ability.parameterUnits?.[key];
      if (unit && values.some((value) => !unitMatches(unit, value)))
        issue("parameter-unit", `Invalid unit/value for ${key}`, undefined, ability.id);
      if (
        curve.kind === "table" &&
        (curve.levels.length !== curve.values.length ||
          new Set(curve.levels).size !== curve.levels.length ||
          ability.levels.some((level) => !curve.levels.includes(level)))
      )
        issue("level-coverage", `Missing table level for ${key}`, undefined, ability.id);
    }
  }
  const ids = new Set<string>();
  if (catalogue.owners) {
    const owners = new Map(catalogue.owners.map((owner) => [owner.id, owner]));
    if (owners.size !== catalogue.owners.length)
      issue("duplicate-owner", "Owner IDs must be unique");
    for (const owner of catalogue.owners) {
      if (owner.parentOwnerId && !owners.has(owner.parentOwnerId))
        issue("owner-parent", "Unknown parent owner");
      for (const id of owner.abilityIds)
        if (abilities.get(id)?.ownerId !== owner.id)
          issue("owner-ability", `Owner ability mismatch: ${id}`, undefined, id);
    }
    for (const ability of catalogue.abilities)
      if (!owners.get(ability.ownerId)?.abilityIds.includes(ability.id))
        issue("ability-owner", "Ability must belong to its declared owner", undefined, ability.id);
  }
  const effectIds = new Set(
    rules.flatMap((rule) => rule.effects.map((effect) => `${rule.id}/${effect.id}`)),
  );
  const numericUnits = ["flat", "ratio", "percent", "count"];
  const inferUnit = (
    expression: RuleExpression,
    ability: CatalogueAbility | undefined,
    ruleId: string,
  ): RuleUnit | undefined => {
    if (expression.kind === "param") return ability?.parameterUnits?.[expression.key];
    if (expression.kind === "derived") {
      for (const candidate of rules)
        for (const effect of candidate.effects)
          if (`${candidate.id}/${effect.id}` === expression.contributionId) return effect.unit;
    }
    if (expression.kind === "compare") {
      const left = inferUnit(expression.left, ability, ruleId),
        right = inferUnit(expression.right, ability, ruleId);
      if (left && right && left !== right)
        issue("expression-unit", "Comparison operands have incompatible units", ruleId);
      return "boolean";
    }
    if (expression.kind === "not" || expression.kind === "boolean") return "boolean";
    if (expression.kind === "literal")
      return typeof expression.value === "boolean"
        ? "boolean"
        : typeof expression.value === "string"
          ? "text"
          : undefined;
    if (expression.kind === "floor" || expression.kind === "ceil" || expression.kind === "round")
      return inferUnit(expression.operand, ability, ruleId);
    if (expression.kind === "if") {
      const left = inferUnit(expression.then, ability, ruleId),
        right = inferUnit(expression.else, ability, ruleId);
      if (left && right && left !== right)
        issue("expression-unit", "Conditional branches have incompatible units", ruleId);
      return left ?? right;
    }
    if (expression.kind === "clamp") {
      const units = [expression.value, expression.min, expression.max]
        .map((child) => inferUnit(child, ability, ruleId))
        .filter(Boolean);
      if (new Set(units).size > 1)
        issue("expression-unit", "Clamp bounds have incompatible units", ruleId);
      return units[0];
    }
    if (expression.kind === "arithmetic") {
      const left = inferUnit(expression.left, ability, ruleId),
        right = inferUnit(expression.right, ability, ruleId);
      if ((left && !numericUnits.includes(left)) || (right && !numericUnits.includes(right)))
        issue("expression-unit", "Arithmetic requires numeric units", ruleId);
      if (
        ["add", "subtract", "min", "max"].includes(expression.op) &&
        left &&
        right &&
        left !== right
      )
        issue("expression-unit", "Arithmetic operands have incompatible units", ruleId);
      if (expression.op === "multiply") {
        if (left === "ratio") return right;
        if (right === "ratio") return left;
      }
      if (expression.op === "divide" && left && left === right) return "ratio";
      return left ?? right;
    }
    return undefined;
  };
  for (const rule of rules) {
    if (!rule.id || ids.has(rule.id)) issue("duplicate-rule", "Rule IDs must be unique", rule.id);
    ids.add(rule.id);
    const ability = abilities.get(rule.sourceRef);
    if (!ability) issue("source-ref", "Unknown source ability", rule.id);
    if (!rule.sourceHash?.trim() || rule.sourceHash !== ability?.sourceHash)
      issue("source-hash", "Rule source hash does not match ability", rule.id);
    if (rule.status !== "reviewed" && rule.status !== "pending")
      issue("review-status", "Invalid review status", rule.id);
    if (rule.status === "pending")
      issue("pending-review", "Rule has not been reviewed", rule.id, undefined, "warning");
    if (rule.ruleVersion !== 1) issue("rule-version", "Unsupported rule version", rule.id);
    if (
      !rule.activation ||
      !["passive", "condition", "event"].includes(rule.activation.kind) ||
      (rule.activation.kind === "event" && !rule.activation.event)
    )
      issue("activation", "Invalid activation", rule.id);
    if (!rule.unlock) issue("unlock", "Explicit unlock expression is required", rule.id);
    if (
      !rule.environments.length ||
      rule.environments.some((env) => env !== "standing" && env !== "combat")
    )
      issue("environment", "Explicit valid environments required", rule.id);
    const localIds = new Set<string>();
    const expressions = [rule.unlock];
    if (rule.activation?.kind === "condition") expressions.push(rule.activation.condition);
    if (rule.activation?.kind === "event" && rule.activation.condition)
      expressions.push(rule.activation.condition);
    for (const effect of rule.effects) {
      if (!effect.id || localIds.has(effect.id))
        issue("duplicate-effect", "Effect IDs must be unique within rule", rule.id);
      localIds.add(effect.id);
      if (
        rules.reduce(
          (count, candidate) =>
            count +
            candidate.effects.filter(
              (item) => `${candidate.id}/${item.id}` === `${rule.id}/${effect.id}`,
            ).length,
          0,
        ) > 1
      )
        issue("duplicate-contribution", "Contribution IDs must be globally unique", rule.id);
      if (!effect.scope || !["self", "team", "enemy", "all"].includes(effect.scope.target))
        issue("scope", "Invalid effect target", rule.id);
      if (
        ![
          "stat_modifier",
          "hit_definition",
          "resource_delta",
          "action_adjustment",
          "summon_change",
          "state_change",
          "skill_level_delta",
          "healing",
          "shield",
        ].includes(effect.kind)
      )
        issue("effect-kind", "Invalid effect kind", rule.id);
      if (effect.operation && !["add", "multiply", "max", "override"].includes(effect.operation))
        issue("operation", "Invalid effect operation", rule.id);
      if (
        effect.duration &&
        (!["turns", "actions", "permanent"].includes(effect.duration.kind) ||
          (effect.duration.kind !== "permanent" &&
            (!Number.isInteger(effect.duration.value) || effect.duration.value! <= 0)))
      )
        issue("duration", "Duration requires positive integral length", rule.id);
      if (
        (effect.duration?.clock &&
          !["owner", "target", "global"].includes(effect.duration.clock)) ||
        (effect.duration?.expiry && !["start", "end"].includes(effect.duration.expiry))
      )
        issue("duration", "Invalid duration clock or expiry", rule.id);
      if (effect.snapshot && !["activation", "dynamic"].includes(effect.snapshot))
        issue("snapshot", "Invalid snapshot mode", rule.id);
      if (
        effect.stacking &&
        (!Number.isInteger(effect.stacking.maxStacks) ||
          effect.stacking.maxStacks <= 0 ||
          !effect.stacking.key ||
          !["add", "replace", "max"].includes(effect.stacking.mode))
      )
        issue("stacking", "Invalid stacking metadata", rule.id);
      if (!["flat", "ratio", "percent", "count"].includes(effect.unit))
        issue("effect-unit", "Contributions must use numeric units", rule.id);
      expressions.push(effect.expression);
      if (effect.scope?.filter) expressions.push(effect.scope.filter);
      if (validExpression(effect.expression)) {
        const unit = inferUnit(effect.expression, ability, rule.id);
        if (unit && unit !== effect.unit)
          issue("effect-unit", "Expression unit does not match effect unit", rule.id);
      }
    }
    for (const expression of expressions) {
      if (!validExpression(expression)) {
        issue("expression-shape", "Malformed expression AST", rule.id);
        continue;
      }
      for (const ref of references(expression)) {
        if (ref.kind === "param" && (!ability || !Object.hasOwn(ability.parameters, ref.key)))
          issue("parameter-ref", `Unknown parameter ${ref.key}`, rule.id);
        if (ref.kind === "derived" && !effectIds.has(ref.contributionId))
          issue("derived-ref", `Unknown contribution ${ref.contributionId}`, rule.id);
      }
    }
  }
  const dependencies = new Map<string, string[]>();
  const effectRules = new Map<string, string>();
  for (const rule of rules)
    for (const effect of rule.effects) {
      const id = `${rule.id}/${effect.id}`;
      effectRules.set(id, rule.id);
      const expressions = [
        effect.expression,
        rule.unlock,
        effect.scope?.filter,
        rule.activation?.kind === "condition"
          ? rule.activation.condition
          : rule.activation?.kind === "event"
            ? rule.activation.condition
            : undefined,
      ];
      dependencies.set(
        id,
        expressions
          .filter(validExpression)
          .flatMap((expression) =>
            references(expression).flatMap((ref) =>
              ref.kind === "derived" ? [ref.contributionId] : [],
            ),
          ),
      );
    }
  const done = new Set<string>(),
    active: string[] = [],
    cycles = new Set<string>();
  const visit = (id: string) => {
    const start = active.indexOf(id);
    if (start >= 0) {
      active.slice(start).forEach((key) => cycles.add(key));
      return;
    }
    if (done.has(id)) return;
    active.push(id);
    for (const dependency of dependencies.get(id) ?? []) visit(dependency);
    active.pop();
    done.add(id);
  };
  for (const id of dependencies.keys()) visit(id);
  for (const id of cycles) issue("cycle", `Cyclic contribution ${id}`, effectRules.get(id));
  const covered = new Set(
    rules.filter((rule) => abilities.has(rule.sourceRef)).map((rule) => rule.sourceRef),
  );
  const reviewed = new Set(
    rules
      .filter(
        (rule) =>
          rule.status === "reviewed" &&
          !rules.some(
            (candidate) =>
              candidate.sourceRef === rule.sourceRef && candidate.status !== "reviewed",
          ) &&
          !issues.some(
            (item) =>
              item.severity === "error" &&
              (item.ruleId === rule.id || item.abilityId === rule.sourceRef),
          ),
      )
      .map((rule) => rule.sourceRef),
  );
  for (const ability of catalogue.abilities)
    if (!covered.has(ability.id))
      issue(
        "uncovered-ability",
        "No computational rule; not implicitly reviewed",
        undefined,
        ability.id,
        "warning",
      );
  return {
    valid: !issues.some((item) => item.severity === "error"),
    issues,
    coverage: { total: abilities.size, covered: covered.size, reviewed: reviewed.size },
  };
}

/** Pure evaluation. Event effects are isolated candidates, never standing contributions. */
export function evaluateRules(
  catalogue: MechanicCatalogue,
  rules: readonly CatalogueRule[],
  context: RuleEvaluationContext,
): RuleEvaluationResult {
  const result: RuleEvaluationResult = { contributions: [], triggerCandidates: [], trace: [] };
  const validation = validateCatalogueRules(catalogue, rules);
  const abilities = new Map(catalogue.abilities.map((ability) => [ability.id, ability]));
  const eligible = new Map<
    string,
    {
      rule: CatalogueRule;
      effect: CatalogueRuleEffect;
      parameters: Readonly<Record<string, RuleValue>>;
    }
  >();
  for (const rule of rules) {
    const ability = abilities.get(rule.sourceRef);
    const reason =
      rule.status !== "reviewed"
        ? "pending"
        : !ability || !rule.sourceHash || rule.sourceHash !== ability.sourceHash
          ? "hash-mismatch"
          : validation.issues.some((item) => item.code === "cycle" && item.ruleId === rule.id)
            ? "cycle"
            : validation.issues.some(
                  (item) =>
                    item.severity === "error" &&
                    ((!item.ruleId && !item.abilityId) ||
                      item.ruleId === rule.id ||
                      item.abilityId === rule.sourceRef),
                )
              ? "invalid"
              : !rule.environments.includes(context.environment)
                ? "environment"
                : null;
    if (reason) {
      result.trace.push({ ruleId: rule.id, reason });
      continue;
    }
    const parameters = resolveAbility(ability!, context.bindings).parameters;
    for (const effect of rule.effects)
      eligible.set(`${rule.id}/${effect.id}`, { rule, effect, parameters });
  }
  const cache = new Map<string, RuleContribution | null>();
  const visiting = new Set<string>();
  const targetIds = new Set<string>();
  const duplicateTargets = new Set(
    context.targets
      .filter((target) => {
        if (targetIds.has(target.id)) return true;
        targetIds.add(target.id);
        return false;
      })
      .map((target) => target.id),
  );
  const resolve = (
    id: string,
    target: RuleTarget,
    requesterEvent: string | undefined,
  ): RuleContribution | null => {
    const entry = eligible.get(id);
    if (!entry) return null;
    const { rule, effect, parameters } = entry;
    // A passive rule may never consume a hypothetical event contribution.
    if (rule.activation.kind === "event" && rule.activation.event !== requesterEvent) return null;
    const evaluationEvent = rule.activation.kind === "event" ? rule.activation.event : undefined;
    const key = JSON.stringify([id, target.id, evaluationEvent]);
    if (cache.has(key)) return cache.get(key)!;
    const missingKeys = new Set<string>();
    const skip = (reason: "unknown" | "locked" | "inactive" | "cycle" | "invalid") => {
      result.trace.push({
        ruleId: rule.id,
        effectId: effect.id,
        targetId: target.id,
        reason,
        missingKeys: [...missingKeys],
      });
      cache.set(key, null);
      return null;
    };
    if (visiting.has(key)) return skip("cycle");
    if (duplicateTargets.has(target.id)) return skip("invalid");
    if (
      effect.scope.target !== "all" &&
      effect.scope.target !== target.kind &&
      !(effect.scope.target === "team" && target.kind === "self")
    )
      return skip("inactive");
    visiting.add(key);
    const expressionContext: ExpressionContext = {
      parameters,
      values: { ...context.values, ...target.values },
      derived: (ref) => resolve(ref, target, evaluationEvent)?.value ?? null,
    };
    for (const expression of [
      rule.unlock,
      effect.expression,
      effect.scope.filter,
      rule.activation.kind === "condition"
        ? rule.activation.condition
        : rule.activation.kind === "event"
          ? rule.activation.condition
          : undefined,
    ])
      for (const ref of references(expression)) {
        if (ref.kind === "context" && safe(own(expressionContext.values, ref.key)) === null)
          missingKeys.add(`context:${ref.key}`);
        if (ref.kind === "param" && safe(own(parameters, ref.key)) === null)
          missingKeys.add(`param:${ref.key}`);
      }
    const gates = [
      rule.unlock,
      effect.scope.filter,
      rule.activation.kind === "condition"
        ? rule.activation.condition
        : rule.activation.kind === "event"
          ? rule.activation.condition
          : undefined,
    ];
    for (let index = 0; index < gates.length; index++) {
      const gate = gates[index];
      if (!gate) continue;
      const value = bool(evaluateExpression(gate, expressionContext));
      if (value !== true) {
        visiting.delete(key);
        return skip(value === null ? "unknown" : index === 0 ? "locked" : "inactive");
      }
    }
    const value = evaluateExpression(effect.expression, expressionContext);
    visiting.delete(key);
    if (effect.snapshot === "activation")
      for (const key of effect.snapshotKeys ?? []) {
        if (safe(own(expressionContext.values, key)) === null) missingKeys.add(`context:${key}`);
      }
    if (
      effect.snapshot === "activation" &&
      (effect.snapshotKeys ?? []).some((key) => safe(own(expressionContext.values, key)) === null)
    )
      return skip("unknown");
    if (cache.get(key) === null || typeof value !== "number" || !Number.isFinite(value))
      return skip("unknown");
    const contribution: RuleContribution = {
      id,
      ruleId: rule.id,
      sourceRef: rule.sourceRef,
      sourceHash: rule.sourceHash,
      targetId: target.id,
      stat: effect.stat,
      unit: effect.unit,
      value,
      kind: effect.kind,
      duration: effect.duration,
      stacking: effect.stacking,
      snapshot: effect.snapshot,
      operation: effect.operation,
      snapshotValues:
        effect.snapshot === "activation"
          ? Object.fromEntries(
              (effect.snapshotKeys ?? []).map((key) => [
                key,
                safe(own(expressionContext.values, key)),
              ]),
            )
          : undefined,
    };
    cache.set(key, contribution);
    return contribution;
  };
  for (const [id, { rule }] of eligible) {
    const event = rule.activation.kind === "event" ? rule.activation.event : undefined;
    if (event && context.event !== event) {
      result.trace.push({ ruleId: rule.id, reason: "inactive" });
      continue;
    }
    for (const target of context.targets) {
      const contribution = resolve(id, target, event);
      if (!contribution) continue;
      if (event) {
        let candidate = result.triggerCandidates.find((item) => item.ruleId === rule.id);
        if (!candidate) {
          candidate = { ruleId: rule.id, event, contributions: [] };
          result.triggerCandidates.push(candidate);
        }
        candidate.contributions = [...candidate.contributions, contribution];
      } else result.contributions.push(contribution);
    }
  }
  return result;
}
