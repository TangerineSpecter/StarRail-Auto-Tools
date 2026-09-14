import { describe, expect, it } from "vitest";
import type {
  BuildDashboardCharacter,
  BuildDashboardRelic,
  CharacterBuildPlan,
  RelicSetCatalogueEntry,
  RelicSetFarmingProfile,
} from "@/types";
import {
  expectedPiecesForSet,
  scoreRelicSetsForFarming,
} from "@/features/catalogue/relic-farming-score";

const cavern = (id: number, name = `遗器套装 ${id}`): RelicSetCatalogueEntry => ({
  id,
  name,
  kind: "cavern",
  effects: { twoPiece: "", fourPiece: "" },
  image: null,
});
const planar = (id: number, name = `饰品套装 ${id}`): RelicSetCatalogueEntry => ({
  id,
  name,
  kind: "planar",
  effects: { twoPiece: "", fourPiece: "" },
  image: null,
});

function plan(
  characterId: number,
  options: Partial<
    Pick<
      CharacterBuildPlan,
      "cavernMode" | "cavernSetA" | "cavernSetB" | "planarSetId" | "mainStats"
    >
  > = {},
): CharacterBuildPlan {
  return {
    characterId,
    cavernMode: "fourPiece",
    cavernSetA: 101,
    cavernSetB: null,
    planarSetId: 201,
    mainStats: {},
    targets: [],
    effectiveSubstats: ["SPD"],
    note: "",
    substatWeights: { SPD: 1 },
    minPotentialPct: 40,
    spdTarget: 0,
    ...options,
  };
}

function relic(
  setId: number,
  slot: string,
  options: Partial<BuildDashboardRelic> = {},
): BuildDashboardRelic {
  return {
    setId,
    slot,
    mainStat: slot === "Head" ? "HP" : slot === "Hands" ? "ATK" : "HP%",
    mainStatValue: 1,
    substats: [{ kind: "normal", key: "SPD", value: 1, count: 6 }],
    ...options,
  };
}

function profile(
  buildPlan: CharacterBuildPlan,
  equippedRelics: BuildDashboardRelic[] = [],
): RelicSetFarmingProfile {
  const character: BuildDashboardCharacter = {
    characterId: buildPlan.characterId,
    name: `角色 ${buildPlan.characterId}`,
    level: 80,
    ascension: 6,
    equippedRelics,
  };
  return { plan: buildPlan, character };
}

describe("relic farming score", () => {
  it("resolves expected pieces for four-piece, 2+2, and planar sets", () => {
    const fourPiece = plan(1);
    const twoPlusTwo = plan(2, {
      cavernMode: "twoPlusTwo",
      cavernSetA: 102,
      cavernSetB: 103,
    });

    expect(expectedPiecesForSet(fourPiece, cavern(101))).toBe(4);
    expect(expectedPiecesForSet(twoPlusTwo, cavern(102))).toBe(2);
    expect(expectedPiecesForSet(twoPlusTwo, cavern(103))).toBe(2);
    expect(expectedPiecesForSet(fourPiece, planar(201))).toBe(2);
    expect(expectedPiecesForSet(fourPiece, cavern(999))).toBe(0);
  });

  it("puts high-demand low-quality sets first and caps each piece at 100%", () => {
    const sets = [cavern(101, "热门低质量"), cavern(102, "低需求满质量"), cavern(103, "无人使用")];
    const highQualityPieces = [
      relic(102, "Head", { substats: [{ kind: "normal", key: "SPD", count: 20, value: 1 }] }),
      relic(102, "Hands", { substats: [{ kind: "normal", key: "SPD", count: 20, value: 1 }] }),
      relic(102, "Body", { substats: [{ kind: "normal", key: "SPD", count: 20, value: 1 }] }),
      relic(102, "Feet", { substats: [{ kind: "normal", key: "SPD", count: 20, value: 1 }] }),
    ];
    const items = scoreRelicSetsForFarming(sets, [
      profile(plan(1, { cavernSetA: 101 })),
      profile(plan(2, { cavernSetA: 101 })),
      profile(plan(3, { cavernSetA: 102 }), highQualityPieces),
    ]);

    expect(items.map((item) => item.set.id)).toEqual([101, 102, 103]);
    expect(items[0]).toMatchObject({ targetCount: 2, currentQualityPct: 0, priorityScore: 0 });
    expect(items[1]).toMatchObject({ targetCount: 1, currentQualityPct: 100, priorityScore: 100 });
    expect(items[2]).toMatchObject({ targetCount: 0, priorityScore: 100, opportunityPct: 0 });
    expect(items[1].currentQualityPct).toBeLessThanOrEqual(100);
  });

  it("counts demand by character id and includes missing pieces as zero", () => {
    const set = cavern(101);
    const items = scoreRelicSetsForFarming(
      [set],
      [
        profile(plan(1), [relic(101, "Head", { mainStat: "HP" })]),
        // Duplicate API rows must not inflate demand.
        profile(plan(1), [relic(101, "Head", { mainStat: "HP" })]),
      ],
    );

    expect(items[0]).toMatchObject({
      targetCount: 1,
      expectedPieceCount: 4,
      equippedPieceCount: 1,
    });
    expect(items[0].currentQualityPct).toBeCloseTo(20);
  });

  it("uses the best two pieces for a 2+2 set and rejects wrong main stats and sets", () => {
    const sets = [cavern(102), cavern(103), planar(201)];
    const items = scoreRelicSetsForFarming(sets, [
      profile(
        plan(1, {
          cavernMode: "twoPlusTwo",
          cavernSetA: 102,
          cavernSetB: 103,
          planarSetId: 999,
          mainStats: { Body: ["CRIT Rate"] },
        }),
        [
          relic(102, "Head"),
          relic(99, "Hands"),
          relic(102, "Body", { mainStat: "HP%" }),
          relic(103, "Head"),
          relic(103, "Hands", {
            substats: [{ kind: "normal", key: "SPD", count: 1, value: 1 }],
          }),
          relic(103, "Body", {
            mainStat: "CRIT Rate",
            substats: [{ kind: "normal", key: "SPD", count: 20, value: 1 }],
          }),
        ],
      ),
    ]);

    expect(items[0]).toMatchObject({
      set: { id: 102 },
      expectedPieceCount: 2,
      equippedPieceCount: 2,
    });
    expect(items[0].currentQualityPct).toBeCloseTo(40);
    expect(items[1]).toMatchObject({
      set: { id: 103 },
      expectedPieceCount: 2,
      equippedPieceCount: 2,
    });
    expect(items[1].currentQualityPct).toBeCloseTo(90);
    expect(items[2]).toMatchObject({ set: { id: 201 }, expectedPieceCount: 0, priorityScore: 100 });
  });

  it("keeps equal scores deterministic and separates unused sets to the end", () => {
    const items = scoreRelicSetsForFarming(
      [cavern(2, "同分乙"), cavern(1, "同分甲"), cavern(3, "未使用")],
      [profile(plan(1, { cavernSetA: 2 })), profile(plan(2, { cavernSetA: 1 }))],
    );

    expect(items.map((item) => item.set.id)).toEqual([1, 2, 3]);
  });
});
