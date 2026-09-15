import { createHash } from "node:crypto";
import { validateMechanicCatalogue } from "./catalogue-source.mjs";

export const compilerVersion = "station-clauses-v2";
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const numeric = /\{(p\d+):([\w]+)\}|(\d+(?:\.\d+)?)(%?)/g;

function numbers(text, start) {
  return [...text.matchAll(numeric)].map((m) => ({
    start: start + m.index,
    end: start + m.index + m[0].length,
    amount: m[1]
      ? { kind: "parameter", key: m[1] }
      : {
          kind: "constant",
          value: Number(m[3]) / (m[4] ? 100 : 1),
          start: start + m.index,
          end: start + m.index + m[0].length,
        },
    ratio: m[1] ? m[2].startsWith("percent") : !!m[4],
  }));
}

// Only known action openings may enter the linear evaluator. Unknown narrative is not an event.
const actionOpening =
  /^(?:对(?:指定|敌方|随机)|为(?:指定|我方)|立即为(?:指定|我方)|(?:立即)?造成|每次(?:伤害|攻击)(?:对|造成)|并额外造成|额外对)/;
const conditional =
  /当|如果|若|受到|触发|回合开始|回合结束|进入战斗|战斗开始|概率|状态下|拥有|持有|处于|期间|每消耗|每从|(?:施放|发动|攻击|行动|达到|累计|获得|消耗)[^。；\n]*(?:时|后)/;

function compileClause(ability, text, start, index, inheritedCondition) {
  const tokens = numbers(text, start);
  const parameterRefs = [
    ...new Set(tokens.filter((t) => t.amount.kind === "parameter").map((t) => t.amount.key)),
  ];
  for (const key of parameterRefs)
    if (!ability.parameters[key]) throw new Error(`${ability.id}: missing parameter ${key}`);
  const clause = {
    id: `${ability.id}:clause:${index}`,
    start,
    end: start + text.length,
    parameterRefs,
    literals: tokens
      .filter((t) => t.amount.kind === "constant")
      .map((t) => ({
        value: t.amount.value,
        start: t.start,
        end: t.end,
        unit: t.ratio ? "ratio" : "number",
      })),
    activation: "selectedAbility",
    operations: [],
  };
  const unsupported = (reason) => {
    clause.operations.push({
      kind: "unsupported",
      target: "self",
      scaling: "flat",
      repeats: 1,
      decay: 1,
      strategy: "direct",
      limitation: reason,
    });
  };
  // No guessing conditional/equipment/event effects into an unconditional operation.
  if (
    !["character", "summon"].includes(ability.sourceKind) ||
    inheritedCondition ||
    conditional.test(text) ||
    !actionOpening.test(text.trim())
  ) {
    clause.activation = "unresolvedCondition";
    unsupported("尚未编译该条款的解锁、条件或事件门控；保留参数与原文位置，不作为无条件效果执行。");
    return clause;
  }
  const kind = /恢复.*生命|治疗/.test(text)
    ? "healing"
    : /护盾/.test(text)
      ? "shield"
      : /造成.*伤害/.test(text)
        ? "damage"
        : null;
  if (!kind) {
    unsupported(
      /提高|增加|降低|减少/.test(text)
        ? "尚未编译该属性、资源或状态变化的统计键和生命周期。"
        : /召唤|忆灵/.test(text)
          ? "尚未编译召唤实体的继承、身份与技能配置。"
          : "尚未识别该条款的行为类型；需要声明式操作配置。",
    );
    return clause;
  }
  // Only compile explicit linear scaling. Narrative percentages are not damage multipliers.
  const scaleMatch =
    text.match(/(?:攻击力|生命上限|防御力)\s*(\{p\d+:\w+\}|\d+(?:\.\d+)?%)/) ??
    text.match(/(\{p\d+:\w+\}|\d+(?:\.\d+)?%)\s*(?:攻击力|生命上限|防御力)/);
  if (!scaleMatch) {
    unsupported("未找到明确的属性×倍率表达式；不能将描述中的任意百分比当作倍率。");
    return clause;
  }
  const relative = scaleMatch.index + scaleMatch[0].indexOf(scaleMatch[1]);
  const amount = tokens.find((t) => t.start === start + relative)?.amount;
  if (!amount) throw new Error(`${ability.id}: invalid scaling token`);
  const scaling = scaleMatch[0].includes("生命")
    ? "hp"
    : scaleMatch[0].includes("防御")
      ? "defense"
      : "attack";
  const scalingEnd = scaleMatch.index + scaleMatch[0].length;
  const offsetMatch = text.slice(scalingEnd).match(/^\s*\+\s*(\{p\d+:\w+\}|\d+(?:\.\d+)?)/);
  const offset = offsetMatch
    ? tokens.find((t) => t.start === start + scalingEnd + offsetMatch[0].indexOf(offsetMatch[1]))
        ?.amount
    : undefined;
  // Multi-multiplier clauses require separate target/hit definitions, not first-multiplier-only execution.
  if (tokens.filter((t) => t.ratio).length > 1) {
    unsupported("该条款含多个倍率；尚需拆分目标、分段命中或额外乘区，避免仅执行首个倍率。");
    return clause;
  }
  const strategy =
    kind !== "damage"
      ? kind
      : /超击破/.test(text)
        ? "superbreak"
        : /击破/.test(text)
          ? "break"
          : /欢愉/.test(text)
            ? "elation"
            : /持续伤害/.test(text)
              ? "dot"
              : /真实伤害/.test(text)
                ? "true"
                : "direct";
  clause.operations.push({
    kind,
    target: /随机/.test(text)
      ? kind === "damage"
        ? "randomEnemy"
        : "randomAlly"
      : /敌方全体/.test(text)
        ? "allEnemies"
        : /我方全体/.test(text)
          ? "team"
          : kind === "damage"
            ? "enemy"
            : "ally",
    scaling,
    amount,
    ...(offset ? { offset } : {}),
    repeats: 1,
    decay: 1,
    strategy,
    limitation: "仅执行本条明确的线性基础量；暴击、增益、状态触发、弹跳次数和期限尚未结算。",
  });
  return clause;
}

/** Deterministic exhaustive traversal; never labels unsupported clauses runnable. */
export function compileMechanisms(catalogue) {
  validateMechanicCatalogue(catalogue);
  const ids = new Set();
  const owners = new Map((catalogue.owners ?? []).map((o) => [o.id, o]));
  const definitions = catalogue.abilities.map((ability) => {
    if (ids.has(ability.id) || !owners.get(ability.ownerId)?.abilityIds.includes(ability.id))
      throw new Error(`Invalid identity ${ability.id}`);
    ids.add(ability.id);
    const clauses = [];
    let inheritedCondition = false;
    for (const match of ability.descriptionTemplate.matchAll(/[^。；\n]+[。；\n]*|[。；\n]+/g)) {
      clauses.push(
        compileClause(ability, match[0], match.index, clauses.length, inheritedCondition),
      );
      // A subsequent sentence may describe damage inside the previous condition/trigger.
      inheritedCondition ||= clauses.at(-1).activation === "unresolvedCondition";
    }
    const used = new Set(clauses.flatMap((c) => c.parameterRefs));
    return {
      sourceRef: ability.id,
      sourceHash: ability.sourceHash,
      ownerId: ability.ownerId,
      adoption: "adopted",
      precision: "approximate",
      clauses,
      unusedParameters: Object.keys(ability.parameters).filter((key) => !used.has(key)),
    };
  });
  const library = {
    schemaVersion: 1,
    compilerVersion,
    dataVersion: digest([compilerVersion, catalogue.abilities.map((a) => [a.id, a.sourceHash])]),
    definitions,
  };
  const byOwner = (catalogue.owners ?? []).map((owner) => {
    const entries = definitions.filter((d) => d.ownerId === owner.id);
    return {
      ownerId: owner.id,
      sourceKind: owner.sourceKind,
      abilities: entries.length,
      clauses: entries.reduce((n, d) => n + d.clauses.length, 0),
      executableClauses: entries.reduce(
        (n, d) =>
          n + d.clauses.filter((c) => c.operations.some((o) => o.kind !== "unsupported")).length,
        0,
      ),
      limitations: entries.flatMap((d) =>
        d.clauses.map((c) => ({
          sourceRef: d.sourceRef,
          clauseId: c.id,
          reasons: c.operations.map((o) => o.limitation),
        })),
      ),
    };
  });
  const report = {
    compilerVersion,
    dataVersion: library.dataVersion,
    abilities: definitions.length,
    missingDescriptions: definitions.filter((d) => !d.clauses.length).map((d) => d.sourceRef),
    clauses: byOwner.reduce((n, o) => n + o.clauses, 0),
    executableClauses: byOwner.reduce((n, o) => n + o.executableClauses, 0),
    executableAbilities: definitions.filter((d) =>
      d.clauses.some((c) => c.operations.some((o) => o.kind !== "unsupported")),
    ).length,
    primaryAbilitiesWithoutExecution: catalogue.abilities
      .filter(
        (a) =>
          ["character", "summon"].includes(a.sourceKind) &&
          ["basic", "skill", "ult", "ultimate", "elation"].includes(a.slot),
      )
      .filter(
        (a) =>
          !definitions
            .find((d) => d.sourceRef === a.id)
            ?.clauses.some((c) => c.operations.some((o) => o.kind !== "unsupported")),
      )
      .map((a) => a.id),
    exactReviewedClauses: null,
    exactReviewReport: "catalogue-audit-report.json",
    semanticCoverageComplete: false,
    byOwner,
  };
  return { library, report };
}
