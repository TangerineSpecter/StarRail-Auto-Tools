import { describe, expect, it } from "vitest";
import type { ScenarioData, ScenarioInput } from "@/shared/contracts/catalogue-mechanisms";
import { executeScenario, explainAbility, scenarioRandom } from "@/shared/utils/catalogue-scenario";

const data: ScenarioData = {
  catalogue: {
    schemaVersion: 1,
    abilities: [
      {
        id: "a",
        ownerId: "character:1001",
        sourceNodeId: "1",
        groupId: "skill",
        slot: "skill",
        name: "test",
        descriptionTemplate: "{p1:percent}",
        parameters: { p1: { kind: "constant", value: 2 } },
        levels: [1, 10, 15],
        levelBinding: "skill",
        sourceKind: "character",
        sourceHash: "hash",
      },
    ],
  },
  library: {
    schemaVersion: 1,
    compilerVersion: "test",
    dataVersion: "version",
    definitions: [
      {
        sourceRef: "a",
        ownerId: "character:1001",
        sourceHash: "hash",
        adoption: "adopted",
        precision: "approximate",
        unusedParameters: [],
        clauses: [
          {
            id: "c",
            start: 0,
            end: 4,
            parameterRefs: ["p1"],
            literals: [],
            activation: "selectedAbility",
            operations: [
              {
                kind: "damage",
                target: "enemy",
                scaling: "attack",
                amount: { kind: "parameter", key: "p1" },
                repeats: 1,
                decay: 1,
                strategy: "direct",
                limitation: "test",
              },
            ],
          },
        ],
      },
    ],
  },
};
const input: ScenarioInput = {
  abilityId: "a",
  level: 10,
  seed: 3,
  actorId: "actor",
  entities: [
    {
      id: "actor",
      ownerId: "character:1001",
      side: "ally",
      level: 80,
      hp: 500,
      maxHp: 1000,
      shield: 0,
      attack: 100,
      defense: 100,
      resistance: 0,
    },
    {
      id: "enemy",
      side: "enemy",
      level: 95,
      hp: 500,
      maxHp: 1000,
      shield: 20,
      attack: 100,
      defense: 100,
      resistance: 0.2,
    },
  ],
};

describe("isolated approximate scenario", () => {
  it("rolls random enemies reproducibly, ignoring the selected target and excluding deaths", () => {
    const changed = structuredClone(data);
    const op = changed.library.definitions[0].clauses[0].operations[0];
    Object.assign(op, { target: "randomEnemy", repeats: 12 });
    const scene = {
      ...input,
      selectedTargetId: "enemy",
      entities: [
        input.entities[0],
        ...["enemy", "enemy2"].map((id) => ({
          ...input.entities[1],
          id,
          hp: 100000,
          maxHp: 100000,
        })),
      ],
    };
    const a = executeScenario(changed, { ...scene, seed: 1 });
    expect(a).toEqual(executeScenario(changed, { ...scene, seed: 1 }));
    expect(a.steps.every((s) => typeof s.roll === "number")).toBe(true);
    expect(new Set(a.steps.map((s) => s.targetId))).toEqual(new Set(["enemy", "enemy2"]));
    expect(a.steps.map((s) => s.roll)).not.toEqual(
      executeScenario(changed, { ...scene, seed: 2 }).steps.map((s) => s.roll),
    );
    const deathScene = {
      ...scene,
      entities: [
        scene.entities[0],
        { ...scene.entities[1], hp: 1, shield: 0 },
        { ...scene.entities[2], hp: 0 },
      ],
    };
    const died = executeScenario(changed, deathScene);
    expect(died.steps.filter((s) => s.targetId)).toHaveLength(1);
    expect(died.steps[0].after?.hp).toBe(0);
    expect(died.steps.slice(1).every((s) => s.skipped?.includes("存活目标"))).toBe(true);
  });
  it("replays and clones inputs with explicit partial formulas", () => {
    const result = executeScenario(data, input);
    expect(result).toEqual(executeScenario(data, input));
    expect(result.steps[0].baseAmount).toBe(200);
    expect(result.steps[0].formula).toContain("未计算");
    expect(result.entities[1].shield).toBe(0);
    expect(input.entities[1].hp).toBe(500);
  });
  it("rejects stale hashes, foreign variants, duplicate entities and unsupported levels", () => {
    const stale = structuredClone(data);
    stale.library.definitions[0].sourceHash = "stale";
    expect(() => explainAbility(stale, "a", 10)).toThrow("失效");
    expect(() =>
      executeScenario(data, {
        ...input,
        entities: input.entities.map((e) =>
          e.id === "actor" ? { ...e, ownerId: "character:8001" } : e,
        ),
      }),
    ).toThrow("身份");
    expect(() =>
      executeScenario(data, { ...input, entities: [...input.entities, input.entities[0]] }),
    ).toThrow("身份");
    expect(() => executeScenario(data, { ...input, level: 11 })).toThrow("等级");
    expect(() => executeScenario(data, { ...input, seed: -1 })).toThrow("种子");
  });
  it("skips unsupported local operations and continues", () => {
    const changed = structuredClone(data);
    changed.library.definitions[0].clauses[0].operations.unshift({
      kind: "unsupported",
      target: "self",
      scaling: "flat",
      repeats: 1,
      decay: 1,
      strategy: "direct",
      limitation: "需要状态转换配置",
    });
    const result = executeScenario(changed, input);
    expect(result.steps[0].skipped).toContain("状态转换");
    expect(result.steps[1].actualAmount).toBeGreaterThan(0);
  });
  it("does not settle special damage without its registered strategy", () => {
    const changed = structuredClone(data);
    changed.library.definitions[0].clauses[0].operations[0].strategy = "elation";
    changed.library.definitions[0].clauses[0].operations[0].target = "randomEnemy";
    const result = executeScenario(changed, input);
    expect(result.steps[0].baseAmount).toBe(200);
    expect(result.steps[0].skipped).toContain("专用");
    expect(typeof result.steps[0].roll).toBe("number");
    expect(result.entities).toEqual(input.entities);
  });
  it("bounds repetitions and excludes dead random targets on each roll", () => {
    const changed = structuredClone(data);
    Object.assign(changed.library.definitions[0].clauses[0].operations[0], {
      target: "randomAlly",
      repeats: 2000,
    });
    const result = executeScenario(changed, input);
    expect(result.truncated).toBe(true);
    expect(result.steps.length).toBeLessThanOrEqual(1000);
    expect(result.steps.filter((s) => s.targetId).every((s) => s.targetId === "actor")).toBe(true);
    expect(result.steps.some((s) => s.skipped?.includes("存活目标"))).toBe(true);
    expect(result).toEqual(executeScenario(changed, input));
  });
  it("has stable PRNG and different seeded samples", () => {
    const a = scenarioRandom(2),
      b = scenarioRandom(2),
      c = scenarioRandom(3);
    expect(a()).toBe(b());
    expect(a()).not.toBe(c());
  });
});
