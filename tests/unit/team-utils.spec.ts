import { describe, expect, it } from "vitest";
import {
  characterIdsFromTeam,
  emptyCharacterIds,
  filledSlotCount,
  filterTeamCharacters,
  normalizeTeamInput,
  toggleFilterValue,
} from "@/features/team/team-utils";
import type { CharacterListItem, Team } from "@/types";

const sampleTeam = (): Team => ({
  teamId: 1,
  name: "虚数队",
  note: "备注",
  members: [
    { characterId: 1001, name: "三月七", path: "Preservation", level: 80, owned: true },
    null,
    { characterId: 1002, name: "丹恒", path: "Hunt", level: 70, owned: true },
    null,
  ],
  createdAt: 1,
  updatedAt: 2,
});

describe("team-utils", () => {
  it("creates four empty slots", () => {
    expect(emptyCharacterIds()).toEqual([null, null, null, null]);
  });

  it("extracts character ids from a team", () => {
    expect(characterIdsFromTeam(sampleTeam())).toEqual([1001, null, 1002, null]);
  });

  it("counts filled slots", () => {
    expect(filledSlotCount(sampleTeam())).toBe(2);
  });

  it("normalizes a valid team input", () => {
    const result = normalizeTeamInput({
      teamId: null,
      name: "  测试队  ",
      note: "  note  ",
      characterIds: [1001, null, 1002, null],
    });
    expect(result).toEqual({
      ok: true,
      value: {
        teamId: null,
        name: "测试队",
        note: "note",
        characterIds: [1001, null, 1002, null],
      },
    });
  });

  it("rejects empty names and duplicate members", () => {
    expect(
      normalizeTeamInput({
        name: "   ",
        note: "",
        characterIds: [null, null, null, null],
      }).ok,
    ).toBe(false);
    expect(
      normalizeTeamInput({
        name: "重复",
        note: "",
        characterIds: [1, 1, null, null],
      }).ok,
    ).toBe(false);
  });

  it("filters owned characters by path, element, search and exclude ids", () => {
    const roster: CharacterListItem[] = [
      {
        characterId: 1001,
        name: "三月七",
        path: "Preservation",
        level: 80,
        ascension: 6,
        eidolon: 0,
        hasBuildPlan: false,
        abilityVersion: 1,
        source: "test",
        updatedAt: 1,
      },
      {
        characterId: 1224,
        name: "三月七",
        path: "Hunt",
        level: 70,
        ascension: 6,
        eidolon: 0,
        hasBuildPlan: false,
        abilityVersion: 1,
        source: "test",
        updatedAt: 1,
      },
      {
        characterId: 1005,
        name: "卡芙卡",
        path: "Nihility",
        level: 80,
        ascension: 6,
        eidolon: 1,
        hasBuildPlan: true,
        abilityVersion: 1,
        source: "test",
        updatedAt: 1,
      },
    ];

    expect(
      filterTeamCharacters(roster, {
        search: "",
        paths: ["Hunt"],
        elements: [],
        excludeIds: [],
      }).map((item) => item.characterId),
    ).toEqual([1224]);

    expect(
      filterTeamCharacters(roster, {
        search: "",
        paths: [],
        elements: ["冰"],
        excludeIds: [],
      }).map((item) => item.characterId),
    ).toEqual([1001]);

    expect(
      filterTeamCharacters(roster, {
        search: "巡猎",
        paths: [],
        elements: [],
        excludeIds: [],
      }).map((item) => item.characterId),
    ).toEqual([1224]);

    expect(
      filterTeamCharacters(roster, {
        search: "",
        paths: [],
        elements: [],
        excludeIds: [1001, 1224],
      }).map((item) => item.characterId),
    ).toEqual([1005]);
  });

  it("toggles multi-select filter chips", () => {
    expect(toggleFilterValue(["Hunt"], "Hunt")).toEqual([]);
    expect(toggleFilterValue(["Hunt"], "Nihility")).toEqual(["Hunt", "Nihility"]);
  });
});
