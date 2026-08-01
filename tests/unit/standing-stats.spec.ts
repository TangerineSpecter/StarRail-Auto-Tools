import { describe, expect, it } from "vitest";
import {
  calculateStandingStats,
  isMaxStandingEquipment,
  staticSetStats,
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
          substats: [
            { kind: "normal", key: "SPD", value: 5 },
            { kind: "normal", key: "CRIT DMG", value: 6.48 },
          ],
        },
      ],
      traces: [
        { key: "攻击力", value: 0.28 },
        { key: "暴击伤害", value: 0.16 },
        { key: "速度", value: 4 },
        { key: "火 属性伤害提高", value: 0.064 },
      ],
      setEffects: ["击破特攻提高 16 % 。", "使装备者的速度提高 6 % 。"],
    });

    const values = Object.fromEntries(stats.map((stat) => [stat.key, stat.value]));
    expect(values).toMatchObject({
      hp: 2248,
      attack: 1280,
      defense: 800,
      speed: 115,
      critRate: 37.4,
      critDmg: 72.4,
      energyRegen: 100,
      breakEffect: 16,
      fireDmg: 6.4,
    });
  });

  it("reads only the leading unconditional set bonus and supports max HP wording", () => {
    expect(
      staticSetStats([
        "使装备者的生命上限提高 12 % 。当装备者的生命上限大于等于5000时，暴击伤害提高28 %。",
        "装备者施放追加攻击时，攻击力提高 24 % 。",
        "我方角色施放追加攻击时，暴击伤害提高 25 % 。",
      ]),
    ).toEqual([{ key: "HP%", value: 0.12 }]);
  });

  it("converts Pan-Galactic's current effect hit rate into attack", () => {
    const stats = calculateStandingStats({
      characterBase: { hp: 1000, attack: 1000, defense: 500, speed: 100, taunt: 75 },
      lightConeBase: { hp: 0, attack: 0, defense: 0 },
      relics: [{ mainStat: "Effect Hit Rate", mainStatValue: 40 }],
      traces: [],
      setEffects: [
        "使装备者的效果命中提高 10 % 。同时提高装备者等同于当前效果命中 25 % 的攻击力，最多提高 25 % 。",
      ],
    });

    const values = Object.fromEntries(stats.map((stat) => [stat.key, stat.value]));
    expect(values).toMatchObject({ attack: 1125, effectHitRate: 50 });
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
