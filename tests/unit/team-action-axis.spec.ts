import { describe, expect, it } from "vitest";
import { resolveTeamActionAxisProfile } from "@/features/team/team-action-axis";
import type { TeamMember } from "@/types";

const member: TeamMember = {
  characterId: 1001,
  name: "三月七",
  path: "Preservation",
  level: 80,
  owned: true,
};

describe("resolveTeamActionAxisProfile", () => {
  it("includes unconditional four-piece speed bonuses", () => {
    const detail = {
      characterId: member.characterId,
      name: member.name,
      path: member.path,
      level: 80,
      ascension: 6,
      equippedRelics: [
        { setId: 102, mainStat: "HP", mainStatValue: 705.6 },
        { setId: 102, mainStat: "ATK", mainStatValue: 352.8 },
        { setId: 102, mainStat: "HP%", mainStatValue: 43.2 },
      ],
      equippedLightCone: {
        templateId: 23005,
        level: 80,
        ascension: 6,
        superimposition: 1,
      },
    };

    const threePiece = resolveTeamActionAxisProfile(member, detail, {});
    const fourPiece = resolveTeamActionAxisProfile(
      member,
      {
        ...detail,
        equippedRelics: [
          ...detail.equippedRelics,
          { setId: 102, mainStat: "DEF%", mainStatValue: 54 },
        ],
      },
      {},
    );

    expect(fourPiece.speed! - threePiece.speed!).toBeCloseTo(6.06);
  });

  it("uses characterId/path labels and activates Vonwacq at 120 SPD", () => {
    const profile = resolveTeamActionAxisProfile(
      member,
      {
        characterId: member.characterId,
        name: member.name,
        path: member.path,
        level: 80,
        ascension: 6,
        equippedRelics: [
          { setId: 308, mainStat: "SPD", mainStatValue: 25.032 },
          { setId: 308, mainStat: "HP%", mainStatValue: 43.2 },
        ],
        equippedLightCone: {
          templateId: 23005,
          level: 80,
          ascension: 6,
          superimposition: 1,
        },
      },
      {},
    );

    expect(profile.name).toBe("三月七·存护");
    expect(profile.speed).toBeGreaterThanOrEqual(120);
    expect(profile.initialAdvance).toBe(0.4);
    expect(profile.initialAdvanceLabel).toContain("翁瓦克");
  });

  it("reports dynamic equipment effects that the static axis does not simulate", () => {
    const profile = resolveTeamActionAxisProfile(
      { ...member, characterId: 1306, name: "花火", path: "Harmony" },
      {
        characterId: 1306,
        name: "花火",
        path: "Harmony",
        level: 80,
        ascension: 6,
        equippedRelics: [
          { setId: 110, mainStat: "SPD", mainStatValue: 25.032 },
          { setId: 110, mainStat: "HP%", mainStatValue: 43.2 },
          { setId: 110, mainStat: "HP", mainStatValue: 705.6 },
          { setId: 110, mainStat: "DEF%", mainStatValue: 54 },
        ],
        equippedLightCone: {
          templateId: 21018,
          level: 80,
          ascension: 6,
          superimposition: 5,
        },
      },
      {},
    );

    expect(profile.warnings).toEqual(["风套终结技后行动提前未模拟", "舞！舞！舞！全队拉条未模拟"]);
  });
});
