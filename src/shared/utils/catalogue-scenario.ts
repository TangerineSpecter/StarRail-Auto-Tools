import type {
  ExplainedAbility,
  MechanismAmount,
  MechanismOperation,
  ScenarioData,
  ScenarioEntity,
  ScenarioInput,
  ScenarioResult,
} from "../contracts/catalogue-mechanisms";
import { resolveAbility } from "./catalogue-rules";

export function explainAbility(
  data: ScenarioData,
  abilityId: string,
  level: number,
): ExplainedAbility {
  const ability = data.catalogue.abilities.find((a) => a.id === abilityId);
  const definitions = data.library.definitions.filter((d) => d.sourceRef === abilityId);
  if (!ability || definitions.length !== 1) throw new Error("缺少能力或机制定义身份冲突");
  const definition = definitions[0];
  if (definition.sourceHash !== ability.sourceHash || definition.ownerId !== ability.ownerId)
    throw new Error("机制来源已失效或角色身份不一致");
  if (!Number.isInteger(level) || !ability.levels.includes(level))
    throw new Error("不支持的技能等级");
  const resolved = resolveAbility(ability, level);
  return {
    ability,
    level,
    description: resolved.description,
    parameters: resolved.parameters,
    definition,
  };
}

export function scenarioRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function validateEntities(input: ScenarioInput, ownerId: string) {
  if (!input.entities.length || input.entities.length > 1000) throw new Error("非法实体数量");
  const ids = new Set<string>();
  for (const entity of input.entities) {
    if (!entity.id || ids.has(entity.id)) throw new Error("场景实体身份冲突");
    ids.add(entity.id);
    if (!["ally", "enemy"].includes(entity.side)) throw new Error("非法实体阵营");
    const values = [
      entity.level,
      entity.hp,
      entity.maxHp,
      entity.shield,
      entity.attack,
      entity.defense,
      entity.resistance,
    ];
    if (
      values.some((v) => !Number.isFinite(v)) ||
      !Number.isInteger(entity.level) ||
      entity.level < 1 ||
      entity.maxHp <= 0 ||
      entity.hp < 0 ||
      entity.hp > entity.maxHp ||
      entity.shield < 0 ||
      entity.attack < 0 ||
      entity.defense < 0 ||
      entity.resistance < -1 ||
      entity.resistance >= 1
    )
      throw new Error(`非法实体属性：${entity.id}`);
  }
  const actor = input.entities.find((e) => e.id === input.actorId);
  if (!actor || actor.ownerId !== ownerId || actor.side !== "ally" || actor.hp <= 0)
    throw new Error("来源角色身份冲突或无法行动");
  if (input.selectedTargetId && !ids.has(input.selectedTargetId)) throw new Error("指定目标不存在");
}

type Settlement = { amount: number; formula: string };
type Strategy = (base: number, actor: ScenarioEntity, target: ScenarioEntity) => Settlement;
/** Only supported formula fragments are registered; special damage is base-only. */
export const scenarioStrategies: Readonly<
  Partial<Record<MechanismOperation["strategy"], Strategy>>
> = {
  direct: (base, actor, target) => {
    const defense = (actor.level + 20) / (actor.level + target.level + 40);
    const resistance = 1 - Math.max(-1, Math.min(0.9, target.resistance));
    return {
      amount: base * defense * resistance,
      formula: `基础量 ${base} × 等级防御项 ${defense} × 抗性项 ${resistance}；未计算暴击、增伤、减防、易伤与韧性项`,
    };
  },
  true: (base) => ({ amount: base, formula: "基础真伤量；未计算专属状态与触发" }),
  healing: (base) => ({ amount: base, formula: "基础治疗量；未计算治疗加成、受治疗加成与状态" }),
  shield: (base) => ({ amount: base, formula: "基础护盾量；未计算护盾加成与期限" }),
};

export function executeScenario(data: ScenarioData, input: ScenarioInput): ScenarioResult {
  const explained = explainAbility(data, input.abilityId, input.level);
  if (explained.definition.adoption !== "adopted") throw new Error("机制候选尚未采用");
  validateEntities(input, explained.ability.ownerId);
  const seed = input.seed ?? globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error("种子必须是 uint32");
  const random = scenarioRandom(seed);
  const result: ScenarioResult = {
    seed,
    prngVersion: "mulberry32-v1",
    dataVersion: data.library.dataVersion,
    assumptions: ["这是基础量近似执行，不改变账号、站街或排轴；不自动推进回合与触发链。"],
    entities: input.entities.map((e) => ({ ...e })),
    steps: [],
    truncated: false,
  };
  const actor = result.entities.find((e) => e.id === input.actorId)!;
  const amountOf = (amount?: MechanismAmount): number => {
    if (!amount) return 0;
    const value = amount.kind === "constant" ? amount.value : explained.parameters[amount.key];
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("缺少或非法操作参数");
    return value;
  };
  let processed = 0;
  for (const clause of explained.definition.clauses) {
    for (const op of clause.operations) {
      if (
        !Number.isInteger(op.repeats) ||
        op.repeats < 1 ||
        !Number.isFinite(op.decay) ||
        op.decay < 0 ||
        op.decay > 1
      )
        throw new Error("非法重复次数或衰减");
      for (let repeat = 0; repeat < op.repeats; repeat++) {
        if (processed++ >= 1000) {
          result.truncated = true;
          result.assumptions.push("达到 1000 次操作上限，保留已有结果。");
          return result;
        }
        if (clause.activation !== "selectedAbility" || op.kind === "unsupported") {
          result.steps.push({ clauseId: clause.id, operation: op.kind, skipped: op.limitation });
          break;
        }
        if (!op.amount) throw new Error("可执行操作缺少数值定义");
        if (op.kind === "healing" && op.strategy !== "healing")
          throw new Error("治疗操作结算策略不一致");
        if (op.kind === "shield" && op.strategy !== "shield")
          throw new Error("护盾操作结算策略不一致");
        if (op.kind === "damage" && ["healing", "shield"].includes(op.strategy))
          throw new Error("伤害操作结算策略不一致");
        const eligible = result.entities.filter(
          (e) =>
            e.hp > 0 &&
            e.side ===
              (["enemy", "randomEnemy", "allEnemies"].includes(op.target) ? "enemy" : "ally"),
        );
        let roll: number | undefined;
        const targets =
          op.target === "team" || op.target === "allEnemies"
            ? eligible
            : op.target === "self"
              ? [actor]
              : (op.target === "randomAlly" || op.target === "randomEnemy") && eligible.length
                ? [eligible[Math.floor((roll = random()) * eligible.length)]]
                : [eligible.find((e) => e.id === input.selectedTargetId) ?? eligible[0]].filter(
                    (e): e is ScenarioEntity => !!e,
                  );
        if (!targets.length) {
          result.steps.push({
            clauseId: clause.id,
            operation: op.kind,
            skipped: "没有符合条件的存活目标",
          });
          continue;
        }
        for (const target of targets) {
          if (processed++ >= 1000) {
            result.truncated = true;
            result.assumptions.push("达到 1000 次操作上限，保留已有结果。");
            return result;
          }
          const scaling =
            op.scaling === "hp" ? actor.maxHp : op.scaling === "flat" ? 1 : actor[op.scaling];
          const base = (scaling * amountOf(op.amount) + amountOf(op.offset)) * op.decay ** repeat;
          if (!Number.isFinite(base) || base < 0) throw new Error("非法基础结算量");
          const strategy = scenarioStrategies[op.strategy];
          if (!strategy) {
            result.steps.push({
              clauseId: clause.id,
              operation: op.kind,
              targetId: target.id,
              ...(roll === undefined ? {} : { roll }),
              baseAmount: base,
              skipped: `${op.strategy} 专用结算策略未实现；仅解释基础量，不修改生命。`,
            });
            continue;
          }
          const settled = strategy(base, actor, target);
          const before = { hp: target.hp, shield: target.shield };
          if (op.kind === "damage") {
            const absorbed = Math.min(target.shield, settled.amount);
            target.shield -= absorbed;
            target.hp = Math.max(0, target.hp - (settled.amount - absorbed));
          } else if (op.kind === "healing")
            target.hp = Math.min(target.maxHp, target.hp + settled.amount);
          else if (op.kind === "shield") target.shield = Math.max(target.shield, settled.amount);
          else throw new Error("未知操作");
          const actualAmount =
            op.kind === "damage"
              ? before.hp + before.shield - target.hp - target.shield
              : op.kind === "healing"
                ? target.hp - before.hp
                : target.shield - before.shield;
          result.steps.push({
            clauseId: clause.id,
            operation: op.kind,
            targetId: target.id,
            ...(roll === undefined ? {} : { roll }),
            baseAmount: base,
            actualAmount,
            formula: settled.formula,
            before,
            after: { hp: target.hp, shield: target.shield },
          });
        }
      }
    }
  }
  return result;
}
