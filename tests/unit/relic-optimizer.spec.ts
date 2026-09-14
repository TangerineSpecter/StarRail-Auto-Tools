import { describe, expect, it } from "vitest";
import { optimizeRelics, type RelicOptimizerRunInput } from "@/shared/utils/relic-optimizer";
import type { CharacterBuildPlan, RelicOptimizerRelic, RelicSetCatalogueEntry } from "@/types";

const slots = ["Head", "Hands", "Body", "Feet", "PlanarSphere", "LinkRope"];

function relic(
  itemId: number,
  slot: string,
  setId: number,
  options: Partial<RelicOptimizerRelic> & { speed?: number; crit?: number; rolls?: number } = {},
): RelicOptimizerRelic {
  const { speed, crit, rolls = 1, ...overrides } = options;
  const fixedMain =
    slot === "Head" ? "HP" : slot === "Hands" ? "ATK" : slot === "Feet" ? "SPD" : "ATK%";
  const substats = [];
  if (speed)
    substats.push({ kind: "normal", key: "SPD", value: speed, count: rolls, step: rolls * 2 });
  if (crit)
    substats.push({ kind: "normal", key: "CRIT Rate", value: crit, count: rolls, step: rolls * 2 });
  return {
    itemId,
    setId,
    name: `遗器 ${itemId}`,
    setName: `套装 ${setId}`,
    slot,
    rarity: 5,
    level: 15,
    mainStat: fixedMain,
    mainStatValue:
      fixedMain === "HP"
        ? 705.6
        : fixedMain === "ATK"
          ? 352.8
          : fixedMain === "SPD"
            ? 25.032
            : 43.2,
    location: "",
    equippedCharacterId: null,
    locked: false,
    discard: false,
    substats,
    ...overrides,
  };
}

const sets: RelicSetCatalogueEntry[] = [
  {
    id: 10,
    name: "严格隧洞",
    kind: "cavern",
    effects: { twoPiece: "使装备者的速度提高 6%。", fourPiece: "使装备者的暴击率提高 8%。" },
    image: null,
  },
  {
    id: 11,
    name: "第二隧洞",
    kind: "cavern",
    effects: { twoPiece: "", fourPiece: "" },
    image: null,
  },
  {
    id: 20,
    name: "严格位面",
    kind: "planar",
    effects: { twoPiece: "使装备者的暴击率提高 8%。", fourPiece: "" },
    image: null,
  },
  {
    id: 21,
    name: "散件位面",
    kind: "planar",
    effects: { twoPiece: "", fourPiece: "" },
    image: null,
  },
  {
    id: 22,
    name: "命中转换位面",
    kind: "planar",
    effects: {
      twoPiece:
        "使装备者的效果命中提高 10%。同时提高装备者等同于当前效果命中 25% 的攻击力，最多提高 25%。",
      fourPiece: "",
    },
    image: null,
  },
];

function plan(overrides: Partial<CharacterBuildPlan> = {}): CharacterBuildPlan {
  return {
    characterId: 1001,
    cavernMode: "fourPiece",
    cavernSetA: 10,
    cavernSetB: null,
    planarSetId: 20,
    mainStats: {},
    targets: [{ statKey: "SPD", target: 134, minimum: 130, priority: 1 }],
    effectiveSubstats: ["SPD", "CRIT Rate"],
    note: "",
    substatWeights: { SPD: 1, "CRIT Rate": 1 },
    minPotentialPct: 40,
    spdTarget: 134,
    ...overrides,
  };
}

function input(
  relics: RelicOptimizerRelic[],
  overrides: Partial<RelicOptimizerRunInput> = {},
): RelicOptimizerRunInput {
  return {
    context: {
      character: { characterId: 1001, name: "测试角色", path: "Hunt", level: 70, ascension: 5 },
      equippedLightCone: {
        itemId: 1,
        templateId: 1,
        name: "测试光锥",
        level: 70,
        ascension: 5,
        superimposition: 1,
      },
      relics,
    },
    plan: plan(),
    options: {
      includeEquipped: false,
      includeUnfinished: false,
      includeDiscarded: false,
      includeRelaxed: true,
    },
    characterBase: { hp: 1000, attack: 600, defense: 500, speed: 100, taunt: 75 },
    lightConeBase: { hp: 500, attack: 400, defense: 300 },
    traces: [],
    lightConeEffects: [],
    sets,
    ...overrides,
  };
}

describe("global relic optimizer", () => {
  it("returns strict Top builds by weighted rolls and keeps relaxed results separate", () => {
    const relics = slots.flatMap((slot, index) => [
      relic(index * 10 + 1, slot, index < 4 ? 10 : 20, { speed: 1, crit: 2.5 }),
      relic(index * 10 + 2, slot, index < 4 ? 10 : 20, { speed: 2, crit: 3 }),
      relic(index * 10 + 3, slot, index < 4 ? 11 : 21, { speed: 4, crit: 9, rolls: 2 }),
    ]);

    const result = optimizeRelics(input(relics));

    expect(result.strict.builds).toHaveLength(5);
    expect(result.strict.builds[0].relics.slice(0, 4).every((item) => item.setId === 10)).toBe(
      true,
    );
    expect(result.strict.builds[0].relics.slice(4).every((item) => item.setId === 20)).toBe(true);
    expect(result.strict.builds[0].targetProgress[0].satisfied).toBe(true);
    expect(result.strict.builds[0].activeSets.map((set) => set.setId)).toEqual([10, 20]);
    expect(result.relaxed?.builds[0].weightedRolls).toBeGreaterThan(
      result.strict.builds[0].weightedRolls,
    );
  });

  it("enforces 2+2 exactly and uses minimum rather than target as the hard threshold", () => {
    const relics = slots.flatMap((slot, index) => {
      if (index >= 4) return [relic(index * 10 + 1, slot, 20, { speed: 1 })];
      return [
        relic(index * 10 + 1, slot, 10, { speed: 1 }),
        relic(index * 10 + 2, slot, 11, { speed: 2 }),
      ];
    });
    const result = optimizeRelics(
      input(relics, {
        plan: plan({
          cavernMode: "twoPlusTwo",
          cavernSetB: 11,
          targets: [{ statKey: "SPD", target: 150, minimum: 120, priority: 1 }],
        }),
        options: {
          includeEquipped: false,
          includeUnfinished: false,
          includeDiscarded: false,
          includeRelaxed: false,
        },
      }),
    );
    const best = result.strict.builds[0];
    expect(best).toBeTruthy();
    expect(best.relics.slice(0, 4).filter((item) => item.setId === 10)).toHaveLength(2);
    expect(best.relics.slice(0, 4).filter((item) => item.setId === 11)).toHaveLength(2);
    expect(best.targetProgress[0]).toMatchObject({ satisfied: true, target: 150, minimum: 120 });
    expect(best.targetProgress[0].current).toBeLessThan(150);
  });

  it("protects equipped, unfinished and discarded relics unless their switches are enabled", () => {
    const base = slots.map((slot, index) =>
      relic(index * 10 + 1, slot, index < 4 ? 10 : 20, { speed: 2 }),
    );
    const special = relic(999, "Body", 10, {
      level: 12,
      discard: true,
      equippedCharacterId: 1002,
      location: "另一命途角色",
      substats: [{ kind: "normal", key: "SPD", value: 20, count: 6, step: 12 }],
    });
    const protectedResult = optimizeRelics(
      input([...base, special], {
        options: {
          includeEquipped: false,
          includeUnfinished: false,
          includeDiscarded: false,
          includeRelaxed: false,
        },
      }),
    );
    expect(protectedResult.strict.builds[0].relics.some((item) => item.itemId === 999)).toBe(false);

    const includedResult = optimizeRelics(
      input([...base, special], {
        options: {
          includeEquipped: true,
          includeUnfinished: true,
          includeDiscarded: true,
          includeRelaxed: false,
        },
      }),
    );
    const included = includedResult.strict.builds[0].relics.find((item) => item.itemId === 999);
    expect(included).toMatchObject({ borrowed: true, unfinished: true, discard: true });
  });

  it("keeps the actual current build as a baseline when its main stat is no longer allowed", () => {
    const relics = slots.map((slot, index) =>
      relic(index + 1, slot, index < 4 ? 10 : 20, {
        equippedCharacterId: 1001,
        location: "测试角色",
        ...(slot === "Body" ? { mainStat: "CRIT Rate", mainStatValue: 32.4 } : {}),
      }),
    );
    const result = optimizeRelics(
      input(relics, {
        plan: plan({ mainStats: { Body: ["ATK%"] } }),
        options: {
          includeEquipped: false,
          includeUnfinished: false,
          includeDiscarded: false,
          includeRelaxed: false,
        },
      }),
    );

    expect(result.current?.relics).toHaveLength(6);
    expect(result.current?.relics.find((item) => item.slot === "Body")?.mainStat).toBe("CRIT Rate");
  });

  it("does not Pareto-prune a stat required by an unconditional conversion", () => {
    const fixed = slots
      .filter((slot) => slot !== "PlanarSphere")
      .map((slot, index) =>
        relic(index + 1, slot, ["Head", "Hands", "Body", "Feet"].includes(slot) ? 10 : 22),
      );
    const spheres = Array.from({ length: 6 }, (_, index) =>
      relic(100 + index, "PlanarSphere", 22, { crit: index + 1, rolls: index + 1 }),
    );
    spheres.push(
      relic(200, "PlanarSphere", 22, {
        substats: [{ kind: "normal", key: "Effect Hit Rate", value: 20, count: 1, step: 0 }],
      }),
    );
    const result = optimizeRelics(
      input([...fixed, ...spheres], {
        plan: plan({
          planarSetId: 22,
          targets: [{ statKey: "ATK", target: 2800, minimum: 2700, priority: 1 }],
          effectiveSubstats: ["CRIT Rate"],
          substatWeights: { "CRIT Rate": 1 },
        }),
        options: {
          includeEquipped: false,
          includeUnfinished: false,
          includeDiscarded: false,
          includeRelaxed: false,
        },
      }),
    );

    expect(result.strict.diagnostics.searchMode).toBe("exact");
    expect(result.strict.builds[0].relics.some((item) => item.itemId === 200)).toBe(true);
    expect(result.strict.builds[0].targetProgress[0].satisfied).toBe(true);
  });

  it("switches to deterministic bounded search for large candidate products", () => {
    const relics = slots.flatMap((slot, slotIndex) =>
      Array.from({ length: 12 }, (_, rank) =>
        relic(slotIndex * 100 + rank + 1, slot, slotIndex < 4 ? 10 : 20, {
          speed: rank + 1,
          crit: 12 - rank,
        }),
      ),
    );
    const largePlan = plan({
      targets: [
        { statKey: "SPD", target: 134, minimum: 120, priority: 1 },
        { statKey: "CRIT Rate", target: 70, minimum: 0, priority: 2 },
      ],
    });
    const runInput = input(relics, {
      plan: largePlan,
      options: {
        includeEquipped: false,
        includeUnfinished: false,
        includeDiscarded: false,
        includeRelaxed: false,
      },
    });
    const first = optimizeRelics(runInput);
    const second = optimizeRelics(runInput);
    expect(first.strict.diagnostics.searchMode).toBe("bounded");
    expect(first.strict.diagnostics.truncated).toBe(true);
    expect(first.strict.builds.map((build) => build.relics.map((item) => item.itemId))).toEqual(
      second.strict.builds.map((build) => build.relics.map((item) => item.itemId)),
    );
  }, 30_000);
});
