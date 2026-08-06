import { describe, expect, it } from "vitest";
import { characterSkillEntries } from "@/features/inventory/character-skills";

describe("characterSkillEntries", () => {
  it("translates known skill keys while preserving their levels", () => {
    expect(characterSkillEntries({ basic: 2, elation: 9, skill: 7, talent: 3, ult: 3 })).toEqual([
      { key: "basic", label: "普通攻击", value: "2" },
      { key: "elation", label: "欢愉技", value: "9" },
      { key: "skill", label: "战技", value: "7" },
      { key: "talent", label: "天赋", value: "3" },
      { key: "ult", label: "终结技", value: "3" },
    ]);
  });

  it("keeps unknown keys readable and handles empty data", () => {
    expect(characterSkillEntries({ custom_key: 1 })).toEqual([
      { key: "custom_key", label: "custom_key", value: "1" },
    ]);
    expect(characterSkillEntries(null)).toEqual([]);
  });
});
