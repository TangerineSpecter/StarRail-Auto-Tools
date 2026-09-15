import { describe, expect, it } from "vitest";
import {
  adaptCatalogueAccount,
  type AccountLevelDelta,
} from "../../src/shared/utils/catalogue-account";
import type { CatalogueAbility } from "../../src/shared/contracts/catalogue-rules";

const variant = { gameId: 1001, path: "Preservation", abilityVersion: 0 };
const detail = {
  characterId: 1001,
  path: "Preservation",
  abilityVersion: 0,
  eidolon: 3,
  skills: { basic: 2, skill: 7, ult: 3, talent: 3 },
  memosprite: { skill: 6, talent: 6 },
  traces: { ability_1: true, ability_2: false },
};
const ability: CatalogueAbility = {
  id: "source",
  ownerId: "character:1001",
  sourceKind: "eidolon",
  sourceNodeId: "3",
  groupId: "ranks",
  slot: "other",
  name: "Rank",
  descriptionTemplate: "",
  levelBinding: null,
  levels: [],
  parameters: {},
  sourceHash: "current",
};
const delta: AccountLevelDelta = {
  id: "rank3",
  binding: "skill",
  delta: 2,
  status: "reviewed",
  sourceRef: "source",
  sourceHash: "current",
  unlock: { eidolon: 3 },
};

describe("catalogue account adapter", () => {
  it("maps actual direct-read fields, keeping base and effective levels separate", () => {
    const before = JSON.stringify(detail);
    const result = adaptCatalogueAccount(detail, variant, [ability], [delta]);
    expect(result.identityMatched).toBe(true);
    expect(result.baseLevels.skill).toBe(7);
    expect(result.reviewedDeltas.skill).toBe(2);
    expect(result.bindings.skill).toBe(9);
    expect(result.bindings["memosprite:skill"]).toBe(6);
    expect(result.traces).toEqual(detail.traces);
    expect(result.missingFields).toContain("skills.elation");
    expect(result.bindings.elation).toBeUndefined();
    expect(JSON.stringify(detail)).toBe(before);
  });
  it.each([
    { characterId: 1224 },
    { path: "Hunt" },
    { abilityVersion: 1 },
    { abilityVersion: undefined },
    { characterId: "1001" },
  ])("rejects gameId/path/version mismatch without name fallback: %j", (change) => {
    const result = adaptCatalogueAccount({ ...detail, ...change }, variant, [ability], [delta]);
    expect(result.identityMatched).toBe(false);
    expect(result.bindings).toEqual({});
    expect(result.traces).toEqual({});
    expect(result.eidolon).toBeNull();
  });
  it("reports absent fields and never infers unlocks or levels", () => {
    const result = adaptCatalogueAccount(
      {
        ...detail,
        skills: { basic: "6", skill: 0 },
        memosprite: null,
        traces: {},
        eidolon: undefined,
      },
      variant,
      [ability],
      [{ ...delta, unlock: { trace: "ability_1" } }, delta],
    );
    expect(result.bindings).toEqual({});
    expect(result.missingFields).toEqual(
      expect.arrayContaining([
        "skills.basic",
        "skills.skill",
        "memosprite.skill",
        "traces.ability_1",
        "eidolon",
      ]),
    );
    expect(result.reviewedDeltas).toEqual({});
  });
  it("rejects pending, stale, foreign, duplicate and locked deltas", () => {
    for (const candidate of [
      { ...delta, status: "pending" as const },
      { ...delta, sourceHash: "old" },
      { ...delta, sourceRef: "unknown" },
      { ...delta, delta: 1.5 },
      { ...delta, unlock: { trace: "ability_2" } },
    ])
      expect(adaptCatalogueAccount(detail, variant, [ability], [candidate]).bindings.skill).toBe(7);
    expect(
      adaptCatalogueAccount(detail, variant, [{ ...ability, ownerId: "character:1224" }], [delta])
        .reviewedDeltas,
    ).toEqual({});
    expect(
      adaptCatalogueAccount(detail, variant, [ability], [delta, delta]).reviewedDeltas,
    ).toEqual({});
  });
  it("binds elation and only explicitly reported memosprite skills", () => {
    const result = adaptCatalogueAccount(
      { ...detail, skills: { ...detail.skills, elation: 10 } },
      variant,
    );
    expect(result.bindings.elation).toBe(10);
    expect(result.bindings["memosprite:talent"]).toBe(6);
    expect(result.bindings["memosprite:basic"]).toBeUndefined();
  });
});
