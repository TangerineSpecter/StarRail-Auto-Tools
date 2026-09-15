// @vitest-environment node
import { describe, expect, it } from "vitest";
import raw from "@/data/catalogue-mechanics.json";
import type { ScenarioData, ScenarioInput } from "@/shared/contracts/catalogue-mechanisms";
import { executeScenario, explainAbility } from "@/shared/utils/catalogue-scenario";
// @ts-expect-error Native maintenance compiler.
import { compileMechanisms } from "../../scripts/lib/compile-mechanisms.mjs";

const data = { catalogue: raw, library: compileMechanisms(raw).library } as unknown as ScenarioData;
function scene(abilityId: string, ownerId: string, seed = 1): ScenarioInput {
  return {
    abilityId,
    level: 10,
    seed,
    actorId: "actor",
    entities: [
      {
        id: "actor",
        ownerId,
        side: "ally",
        level: 80,
        hp: 5000,
        maxHp: 10000,
        shield: 0,
        attack: 1000,
        defense: 1000,
        resistance: 0,
      },
      ...["enemy1", "enemy2"].map((id) => ({
        id,
        side: "enemy" as const,
        level: 95,
        hp: 500000,
        maxHp: 1000000,
        shield: 0,
        attack: 1000,
        defense: 1000,
        resistance: 0.2,
      })),
    ],
  };
}

describe("real Station regression cases", () => {
  it.each([
    ["character:1104:skills:67219", "character:1104", "p3"],
    ["character:1001:skills:524962", "character:1001", "p4"],
    ["character:1304:skills:372580", "character:1304", "p2"],
  ])("includes flat shield values for %s", (abilityId, ownerId, offset) => {
    const explained = explainAbility(data, abilityId, 10);
    const expected = 1000 * Number(explained.parameters.p1) + Number(explained.parameters[offset]);
    const result = executeScenario(data, scene(abilityId, ownerId));
    expect(result.steps[0].baseAmount).toBe(expected);
    expect(result.entities[0].shield).toBe(expected);
    if (ownerId === "character:1104") expect(expected).toBe(1050);
  });
  it("skips Tibbie's talent without a compiled ultimate trigger", () => {
    const input = scene("character:1403:skills:14450301", "character:1403");
    const result = executeScenario(data, input);
    expect(result.entities).toEqual(input.entities);
    expect(result.steps.every((step) => step.skipped)).toBe(true);
  });
  it("rolls Asta's random enemy hit separately from her selected hit", () => {
    const first = executeScenario(data, scene("character:1009:skills:824970", "character:1009", 1));
    const second = executeScenario(
      data,
      scene("character:1009:skills:824970", "character:1009", 2),
    );
    expect(first.steps[0].roll).toBeUndefined();
    const rolls = first.steps.filter((step) => step.roll !== undefined);
    expect(rolls).toHaveLength(1);
    expect(rolls[0].roll).not.toBe(second.steps.find((step) => step.roll !== undefined)?.roll);
    const sampledTargets = new Set(
      Array.from(
        { length: 16 },
        (_, seed) =>
          executeScenario(
            data,
            scene("character:1009:skills:824970", "character:1009", seed),
          ).steps.find((step) => step.roll !== undefined)?.targetId,
      ),
    );
    expect(sampledTargets).toEqual(new Set(["enemy1", "enemy2"]));
    expect(first).toEqual(
      executeScenario(data, scene("character:1009:skills:824970", "character:1009", 1)),
    );
  });
});
