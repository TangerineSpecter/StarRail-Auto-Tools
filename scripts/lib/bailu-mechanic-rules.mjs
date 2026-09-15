import { createHash } from "node:crypto";
import { semanticHash } from "./catalogue-source.mjs";

// Manual review of the bundled Station snapshot; never refreshed by raw synchronization.
// IDs, not translated names, bind every ability and trace.
export const BAILU_REVIEW_HASHES = {
  "skills:231592": "a34717d790199e272ac4e92b9824270322b0887272835f5025af60d3314a9c04",
  "skills:947065": "48a1f10e0da7e56b5a76c0cc6201f5314787af14bc6e4d185ff04127f195be31",
  "skills:31006": "558f458adf868bc9bfc2ea4570ed78f8ee2e713d51d6a4bfad7f4b0628908c7a",
  "skills:746479": "094401a48ee39413a35d5babaa9889957afadedf4c6065eb4420bd573f0bf0ee",
  "skills:662538": "c9e43bf0b70c4a6a618d0e607d7104039a35b67769332fa7ad65a7b0d5b1e233",
  "ranks:1": "b45a047f26e26359dd02ad2da92dc755d2bd8340920ca7ba790cc2017ebe5e39",
  "ranks:2": "e071eec4b479b18468eb451eaa4388d17b5305419461bfeeae88826d43bfa1ff",
  "ranks:3": "27058e965537c88741c33d0b6f4cc4548002e01a1783c96c08da122d388a7c90",
  "ranks:4": "1cb61d6f7b89ede88457e0aab37f5d61e20baa01b302cff00ae481fb71ffb307",
  "ranks:5": "73124c3a2913e5cc54df3ee61c01ba186f9166e7912dd2420833afe7a181d80d",
  "ranks:6": "928f69023dbe4be55bcd3d816bac85d967530d66751d598e620f0dd627301218",
  "traces:1211101": "c41eb023ebcf3a39c69dfa61ab21816c6216c3cce816a99e3853285116b9da46",
  "traces:1211102": "1b74d815a1a00374e0a72e2c4a34d1bfdf66c69277872893423e0a4d14dc7f6f",
  "traces:1211103": "cb8c6ced7e08a13f8d8f39366791894729368208444b7d425393588b28c1b554",
  "traces:1211201": "4098f78a2a535599e80557592ca3a7d5c2b1a9cd035c36a7e8f3039a2156f5ab",
  "traces:1211202": "8394196f37ab28ad0b658d0855341efea7b05a544f40476825452875aea9eca6",
  "traces:1211203": "9eb54ceb6cb1b992141463e6f67d40c61753c367a0aa43809bb9fb9fcaaef901",
  "traces:1211204": "f2a4d3fb1e4fdafb0faee2b14bd55f21209dde18985c1ea73cc5492fc84bb2c8",
  "traces:1211205": "e6cb8d54fb7e5c040368429a4f90d8271bbda082dbf14386c4a593ae2ee93276",
  "traces:1211206": "1d56669eef19b5a887047138b514d00240517cfb39d358782c3f5d9ee58cfd84",
  "traces:1211207": "bc9d6b764012e2971d0ebd6ce517be069f70bfe52a304d919a8f57ee3ec6b5a2",
  "traces:1211208": "d592a4ef8aaf829b64716933cb935044ba763751f236bafef134bd7e8357a33c",
  "traces:1211209": "81fa20036d6f03e64cf8445dcb29f190637a39f4885585a1d1cc39615ee8b5e6",
  "traces:1211210": "aeea6f1bdbc61f1c49b47e0ea20c69c28e319d4cd50c213bcaf81e0a50363318",
};
export const BAILU_REFERENCE = {
  commit: "d28928b1f09d7613c37ca7ca373a468367060fc0",
  url: "https://github.com/fribbels/hsr-optimizer/blob/d28928b1f09d7613c37ca7ca373a468367060fc0/src/lib/conditionals/character/1200/Bailu.ts",
  notes: [
    "Reference for typed HP-scaled healing and separate E2/E4 modifiers; not imported executable code.",
    "All multipliers use Station parameters at the actual effective level, not Fribbels' two hard-coded max-level values.",
    "Random bounces, invigoration, fatal-hit prevention and capacity changes are explicit definitions; callers supply targets and counters. No state mutation or automatic trigger dispatch.",
    "Healing contributions are base amounts, before outgoing/incoming healing modifiers, HP caps and rounding.",
  ],
};
const lit = (value) => ({ kind: "literal", value });
const p = (index) => ({ kind: "param", key: `p${index}` });
const ctx = (key) => ({ kind: "context", key });
const calc = (op, left, right) => ({ kind: "arithmetic", op, left, right });
const cmp = (op, left, right) => ({ kind: "compare", op, left, right });
const eq = (key, value) => cmp("eq", ctx(key), lit(value));
const and = (...operands) => ({ kind: "boolean", op: "and", operands });
const scope = (target, filter) => ({ target, ...(filter ? { filter } : {}) });
const self = scope("self");
const actor = scope("team", eq("target.isEventActor", true));
const effect = (id, kind, stat, expression, target = self, unit = "count", extra = {}) => ({
  id,
  kind,
  stat,
  unit,
  expression,
  scope: target,
  ...extra,
});
const state = (id, expression, target = actor) =>
  effect(id, "state_change", `state.bailu.${id}`, expression, target, "count", {
    operation: "override",
  });
const modifier = (id, expression, target, extra = {}) =>
  effect(id, "stat_modifier", id, expression, target, "ratio", extra);
const healing = (id, ratio, flat, target, selection, sequenceIndex, reduction = lit(1)) =>
  effect(
    id,
    "healing",
    `healing.bailu.${id}`,
    calc(
      "multiply",
      calc("add", calc("multiply", ctx("owner.maxHp"), p(ratio)), p(flat)),
      reduction,
    ),
    target,
    "flat",
    {
      settlement: {
        kind: "base_healing",
        scalingStat: "hp",
        entity: "owner",
        attributeStage: "effective",
        readAt: "hit",
        selection,
        ...(sequenceIndex === undefined ? {} : { sequenceIndex }),
      },
    },
  );
const duration = (index, clock = "target") => ({
  kind: "turns",
  valueExpression: p(index),
  clock,
  expiry: "end",
});
const invigoration = (turns, target) => [
  state("invigorationTurns", turns, target),
  state("invigorationChargesRemaining", ctx("bailu.invigorationChargeLimit"), target),
];

/** Reviewed clauses are handwritten here, not inferred from source prose or rule counts. */
export function createBailuMechanicRules(catalogue) {
  const abilities = Array.isArray(catalogue) ? catalogue : catalogue.abilities;
  const rules = [],
    audits = [],
    rejected = [],
    accountLevelDeltas = [];
  const authored = new Map();
  const bind = (key, suffix, activation, effects, environments = ["combat"]) => {
    const id = `character:1211:${key}`;
    const expectedHash = BAILU_REVIEW_HASHES[key];
    const matches = abilities.filter((a) => a.id === id);
    const a = matches[0];
    if (
      matches.length !== 1 ||
      a.sourceHash !== expectedHash ||
      a.ownerId !== "character:1211" ||
      semanticHash({ ...a, description: a.descriptionTemplate }) !== expectedHash
    ) {
      rejected.push({ sourceRef: id, reason: "missing-or-changed-reviewed-source" });
      return;
    }
    const unlock = key.startsWith("ranks:")
      ? cmp("gte", ctx("character:1211.eidolon"), lit(Number(key.split(":")[1])))
      : key.startsWith("traces:")
        ? ctx(`character:1211.trace.${key.split(":")[1]}`)
        : lit(true);
    const rule = {
      id: `${id}:${suffix}`,
      sourceRef: id,
      sourceHash: expectedHash,
      status: "reviewed",
      ruleVersion: 1,
      activation,
      environments,
      unlock,
      effects,
      reference: BAILU_REFERENCE,
    };
    rules.push(rule);
    authored.set(key, [...(authored.get(key) ?? []), rule.id]);
  };
  const event = (key, suffix, name, effects, condition) =>
    bind(key, suffix, { kind: "event", event: name, ...(condition ? { condition } : {}) }, effects);
  const passive = (key, suffix, effects, environments) =>
    bind(key, suffix, { kind: "passive" }, effects, environments);

  event("skills:231592", "basic", "bailu.basic", [
    effect(
      "basic",
      "hit_definition",
      "lightning.basic",
      calc("multiply", ctx("owner.attack"), p(1)),
      scope("enemy", eq("target.isPrimary", true)),
      "flat",
      {
        settlement: {
          kind: "base_damage",
          scalingStat: "attack",
          entity: "owner",
          attributeStage: "effective",
          readAt: "hit",
          selection: "selected",
        },
      },
    ),
  ]);
  const decay = calc("subtract", lit(1), p(3));
  event("skills:947065", "heals", "bailu.skill", [
    healing("skill.0", 1, 2, scope("team", eq("target.bailuSkillHit0", true)), "selected", 0),
    healing(
      "skill.1",
      1,
      2,
      scope("team", and(eq("target.bailuSkillHit1", true), cmp("gte", p(4), lit(1)))),
      "random",
      1,
      decay,
    ),
    healing(
      "skill.2",
      1,
      2,
      scope("team", and(eq("target.bailuSkillHit2", true), cmp("gte", p(4), lit(2)))),
      "random",
      2,
      calc("multiply", decay, decay),
    ),
  ]);
  event("skills:31006", "healing", "bailu.ult", [healing("ult", 1, 2, scope("team"), "all")]);
  event(
    "skills:31006",
    "new-invigoration",
    "bailu.ult",
    invigoration(p(3), scope("team", eq("target.bailuInvigorated", false))),
  );
  event("skills:31006", "extend-invigoration", "bailu.ult", [
    state(
      "invigorationTurns",
      calc("add", ctx("target.bailuInvigorationTurns"), lit(1)),
      scope("team", eq("target.bailuInvigorated", true)),
    ),
  ]);
  event(
    "skills:662538",
    "technique",
    "battle.start",
    invigoration(p(1), scope("team")),
    eq("bailu.techniqueUsed", true),
  );
  passive("skills:746479", "capacities", [
    effect("invigoration", "state_change", "capacity.bailu.invigorationCharges", p(5)),
    effect("revival", "state_change", "capacity.bailu.revives", lit(1)),
  ]);
  event(
    "skills:746479",
    "invigoration-heal",
    "attack.received",
    [
      healing("invigoration", 1, 2, actor, "event_actor"),
      state(
        "invigorationChargesRemaining",
        calc("subtract", ctx("target.bailuInvigorationChargesRemaining"), lit(1)),
      ),
    ],
    and(
      eq("target.bailuInvigorated", true),
      cmp("gt", ctx("target.bailuInvigorationChargesRemaining"), lit(0)),
    ),
  );
  event(
    "skills:746479",
    "fatal-prevention",
    "attack.fatal",
    [
      healing("fatal", 3, 4, actor, "event_actor"),
      state("preventDefeat", lit(1)),
      effect("revive-use", "resource_delta", "resource.bailu.revivesRemaining", lit(-1)),
    ],
    and(
      eq("event.targetIsAlly", true),
      eq("event.targetIsOwner", false),
      cmp("gt", ctx("bailu.revivesRemaining"), lit(0)),
    ),
  );
  event(
    "ranks:1",
    "energy",
    "bailu.invigoration.expired",
    [effect("energy", "resource_delta", "resource.energy", p(1), actor)],
    cmp("eq", ctx("target.hp"), ctx("target.maxHp")),
  );
  event("ranks:2", "outgoing-healing", "bailu.ult", [
    modifier("healing.outgoingBonus", p(1), self, {
      duration: duration(2, "owner"),
      snapshot: "activation",
    }),
  ]);
  event("ranks:4", "skill-heal-buff", "bailu.skill.healed", [
    modifier("damage.bonus", p(1), actor, {
      duration: duration(3),
      stacking: { key: "bailu.e4", mode: "add", maxStacks: 3 },
      snapshot: "activation",
    }),
  ]);
  passive("ranks:6", "extra-revival", [
    effect("revival", "state_change", "capacity.bailu.revives", p(1)),
  ]);
  event("traces:1211101", "overheal", "bailu.overheal", [
    modifier("hp.percent", p(1), actor, { duration: duration(2), snapshot: "activation" }),
  ]);
  passive("traces:1211102", "extra-invigoration", [
    effect("invigoration", "state_change", "capacity.bailu.invigorationCharges", p(1)),
  ]);
  bind(
    "traces:1211103",
    "damage-reduction",
    { kind: "condition", condition: eq("target.bailuInvigorated", true) },
    [modifier("damage.reduction", p(1), scope("team"), { operation: "multiplicative_complement" })],
  );
  for (const [node, stat] of [
    [1211201, "hp.percent"],
    [1211202, "defense.percent"],
    [1211203, "hp.percent"],
    [1211204, "effectResistance"],
    [1211205, "hp.percent"],
    [1211206, "defense.percent"],
    [1211207, "hp.percent"],
    [1211208, "effectResistance"],
    [1211209, "defense.percent"],
    [1211210, "hp.percent"],
  ])
    passive(`traces:${node}`, "attribute", [modifier(stat, p(1), self)], ["standing", "combat"]);
  for (const [rank, slots] of [
    [
      3,
      [
        ["skill", 2, 15],
        ["talent", 2, 15],
      ],
    ],
    [
      5,
      [
        ["ult", 2, 15],
        ["basic", 1, 10],
      ],
    ],
  ]) {
    const key = `ranks:${rank}`;
    passive(
      key,
      "levels",
      slots.map(([slot, delta, cap]) =>
        effect(
          slot,
          "skill_level_delta",
          `skillLevel.${slot}`,
          calc(
            "max",
            lit(0),
            calc(
              "min",
              lit(delta),
              calc("subtract", lit(cap), ctx(`character:1211.level.${slot}`)),
            ),
          ),
        ),
      ),
    );
    if (authored.has(key))
      for (const [binding, delta, cap] of slots)
        accountLevelDeltas.push({
          id: `character:1211:${key}:level:${binding}`,
          binding,
          delta,
          cap,
          status: "reviewed",
          sourceRef: `character:1211:${key}`,
          sourceHash: BAILU_REVIEW_HASHES[key],
          unlock: { eidolon: rank },
        });
  }
  // Each string is a manually enumerated clause; the complete manifest is attested only
  // when every authored rule for this exact source was bound successfully.
  const clauses = {
    "skills:231592": ["对指定敌方单体造成等同于白露{p1:percentInteger}攻击力的雷属性伤害。"],
    "skills:947065": [
      "立即为指定我方单体回复等同于白露{p1:percentFixed1}生命上限+{p2:integer}的生命值，然后白露随机为我方单体进行{p4:integer}次治疗，每提供1次治疗，下一次治疗回复的生命值会降低{p3:percentInteger}。",
    ],
    "skills:31006": [
      "立即为我方全体回复等同于白露{p1:percentFixed1}生命上限+{p2:integer}的生命值。",
      "对于没有【生息】的我方目标，白露使其附上【生息】，对于已拥有【生息】的我方目标，白露使其已有的【生息】持续时间延长1回合。",
      "【生息】可持续{p3:integer}回合，该效果不可叠加。",
    ],
    "skills:746479": [
      "拥有【生息】的我方目标，在受到攻击后会回复等同于白露{p1:percentFixed1}生命上限+{p2:integer}的生命值，该效果可以触发{p5:integer}次。",
      "当白露的队友受到致命攻击时，不会陷入无法战斗状态，白露会立即为其提供治疗，回复等同于白露{p3:percentFixed1}生命上限+{p4:integer}的生命值。该效果单场战斗中可以触发1次。",
    ],
    "skills:662538": ["使用秘技后，下一次战斗开始时为我方全体附上【生息】，持续{p1:integer}回合。"],
    "ranks:1": [
      "【生息】结束时若我方目标当前生命值等于其生命上限，则额外恢复目标{p1:integer}点能量。",
    ],
    "ranks:2": ["施放终结技后，白露的治疗量提高{p1:percentInteger}，持续{p2:integer}回合。"],
    "ranks:3": ["战技等级+2，最多不超过15级；天赋等级+2，最多不超过15级。"],
    "ranks:4": [
      "战技提供的每1次治疗会额外使受治疗者造成的伤害提高{p1:percentInteger}，最多叠加{p2:integer}层，持续{p3:integer}回合。",
    ],
    "ranks:5": ["终结技等级+2，最多不超过15级；普攻等级+1，最多不超过10级。"],
    "ranks:6": [
      "白露在单场战斗中累计可以对受到致命攻击的我方目标提供治疗的效果触发次数增加{p1:integer}次。",
    ],
    "traces:1211101": [
      "白露对我方目标造成过量治疗时会提高目标{p1:percentInteger}的生命上限，持续{p2:integer}回合。",
    ],
    "traces:1211102": ["【生息】效果的触发次数增加{p1:integer}次。"],
    "traces:1211103": ["拥有【生息】的角色受到的伤害降低{p1:percentInteger}。"],
  };
  for (const key of Object.keys(BAILU_REVIEW_HASHES)) {
    const sourceRef = `character:1211:${key}`;
    if (!authored.has(key) || rejected.some((r) => r.sourceRef === sourceRef)) continue;
    const minorStatText =
      key === "traces:1211202" || key === "traces:1211206" || key === "traces:1211209"
        ? "防御力 {p1:number}"
        : key === "traces:1211204" || key === "traces:1211208"
          ? "效果抵抗 {p1:number}"
          : "生命值 {p1:number}";
    const texts = clauses[key] ?? [minorStatText];
    // This is verification of a handwritten manifest, not automatic segmentation.
    const source = abilities.find((a) => a.id === sourceRef);
    if (texts.join("\n") !== source.descriptionTemplate)
      throw new Error(`Manual clause manifest mismatch: ${sourceRef}`);
    audits.push({
      sourceRef,
      sourceHash: BAILU_REVIEW_HASHES[key],
      status: "reviewed",
      clauses: texts.map((text, index) => ({
        id: `${sourceRef}:clause:${index}`,
        textHash: createHash("sha256").update(text).digest("hex"),
        ruleIds: authored.get(key),
      })),
    });
  }
  return { rules, audits, rejected, accountLevelDeltas };
}
