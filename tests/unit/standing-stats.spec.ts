import { describe, expect, it } from "vitest";
import {
  calculateStandingStats,
  isMaxStandingEquipment,
} from "@/features/inventory/standing-stats";

describe("calculateStandingStats", () => {
  it("combines max-level base stats, relic stats and selected traces without passives", () => {
    const stats = calculateStandingStats({
      characterBase: { hp: 1000, attack: 600, defense: 500, speed: 100, taunt: 75 },
      lightConeBase: { hp: 500, attack: 400, defense: 300 },
      relics: [
        {
          mainStat: "HP%",
          mainStatValue: 43.2,
          substats: [{ kind: "normal", key: "HP", value: 100 }],
        },
        {
          mainStat: "CRIT Rate",
          mainStatValue: 32.4,
          substats: [{ kind: "normal", key: "SPD", value: 5 }],
        },
      ],
      traces: [
        { key: "攻击力", value: 0.28 },
        { key: "暴击伤害", value: 0.16 },
        { key: "速度", value: 4 },
        { key: "火 属性伤害提高", value: 0.064 },
      ],
    });

    expect(stats).toMatchObject([
      { key: "hp", value: 2248 },
      { key: "attack", value: 1280 },
      { key: "defense", value: 800 },
      { key: "speed", value: 109 },
      { key: "critRate", value: 37.4 },
      { key: "critDmg", value: 66 },
      { key: "fireDmg", value: 6.4 },
    ]);
  });
});

describe("isMaxStandingEquipment", () => {
  it("requires the character and its equipped light cone to be 80/6", () => {
    expect(isMaxStandingEquipment({ level: 80, ascension: 6 }, { level: 80, ascension: 6 })).toBe(
      true,
    );
    expect(isMaxStandingEquipment({ level: 80, ascension: 6 }, { level: 70, ascension: 6 })).toBe(
      false,
    );
    expect(isMaxStandingEquipment({ level: 80, ascension: 6 }, null)).toBe(false);
  });
});
