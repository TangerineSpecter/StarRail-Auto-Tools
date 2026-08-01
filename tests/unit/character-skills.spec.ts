import { describe, expect, it } from "vitest";
import { characterSkillEntries } from "@/features/inventory/character-skills";

describe("characterSkillEntries", () => {
  it("translates known skill keys while preserving their levels", () => {
    expect(characterSkillEntries({ basic: 2, skill: 7, talent: 3, ult: 3 })).toEqual([
      { key: "basic", label: "普通攻击", value: "2" },
      { key: "skill", label: "战技", value: "7" },
      { key: "talent", label: "天赋", value: "3" },
      { key: "ult", label: "终结技", value: "3" },
    ]);
  });

  it("keeps unknown keys readable and handles empty data", () => {
    expect(characterSkillEntries({ special: 1 })).toEqual([
      { key: "special", label: "special", value: "1" },
    ]);
    expect(characterSkillEntries(null)).toEqual([]);
  });
});
