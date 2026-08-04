import { describe, expect, it } from "vitest";
import lightConesJson from "@/data/light-cones.json";
import {
  calculateStandingStats,
  isMaxStandingEquipment,
  lightConeSkillEffect,
  staticSetStats,
} from "@/features/inventory/standing-stats";
import type { LightConeCatalogue } from "@/types";

const lightConeCatalogue = lightConesJson as LightConeCatalogue;
const lightCone = (id: number) => {
  const entry = lightConeCatalogue.lightCones.find((item) => item.id === id);
  if (!entry) throw new Error(`missing light cone ${id}`);
  return entry;
};

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

  it("parses multiple unconditional bonuses before the first combat condition", () => {
    expect(
      staticSetStats([
        "使装备者的防御力提高 24%，效果命中提高 24%，同时使自身受到攻击的概率提高。当装备者受到攻击后，防御力额外提高 24%，持续到自身回合结束。",
      ]),
    ).toEqual([
      { key: "DEF%", value: 0.24 },
      { key: "Effect Hit Rate", value: 0.24 },
    ]);
  });

  it("ignores combat-only light cone openers such as enemy-count attack stacks", () => {
    expect(
      staticSetStats([
        "场上每有1个敌方目标，使装备者的攻击力提高 9.0%，该效果最多叠加5层。当有敌方目标的弱点被击破时，装备者造成的伤害提高 30%，持续1回合。",
      ]),
    ).toEqual([]);
  });

  it("applies light cone unconditional skill bonuses to the standing panel", () => {
    const stats = calculateStandingStats({
      characterBase: { hp: 1000, attack: 1000, defense: 500, speed: 100, taunt: 75 },
      lightConeBase: { hp: 0, attack: 0, defense: 0 },
      relics: [],
      traces: [],
      lightConeEffects: [
        "使装备者的暴击率提高 18%。当装备者在战斗中速度大于 100 时，每超过 10 点，普攻和战技造成的伤害提高 6%。",
      ],
    });

    const values = Object.fromEntries(stats.map((stat) => [stat.key, stat.value]));
    expect(values).toMatchObject({ critRate: 23, attack: 1000 });
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

describe("lightConeSkillEffect", () => {
  it("picks the description for the equipped superimposition", () => {
    const skill = {
      effects: ["叠影1", "叠影2", "叠影3", "叠影4", "叠影5"],
    };
    expect(lightConeSkillEffect(skill, 1)).toBe("叠影1");
    expect(lightConeSkillEffect(skill, 5)).toBe("叠影5");
    expect(lightConeSkillEffect(skill, 9)).toBe("叠影5");
    expect(lightConeSkillEffect(skill, 0)).toBe("叠影1");
    expect(lightConeSkillEffect(undefined, 1)).toBeUndefined();
  });
});

describe("bundled light cone skill catalogue", () => {
  it("syncs skill text and feeds unconditional standing bonuses into calculation", () => {
    const night = lightCone(23001);
    const victory = lightCone(23005);
    const galaxy = lightCone(23000);

    expect(night.skill?.name).toBe("花与蝶");
    expect(night.skill?.effects).toHaveLength(5);
    expect(staticSetStats([lightConeSkillEffect(night.skill, 1)!])).toEqual([
      { key: "CRIT Rate", value: 0.18 },
    ]);
    expect(staticSetStats([lightConeSkillEffect(night.skill, 5)!])).toEqual([
      { key: "CRIT Rate", value: 0.3 },
    ]);
    expect(staticSetStats([lightConeSkillEffect(victory.skill, 1)!])).toEqual([
      { key: "DEF%", value: 0.24 },
      { key: "Effect Hit Rate", value: 0.24 },
    ]);
    expect(staticSetStats([lightConeSkillEffect(galaxy.skill, 1)!])).toEqual([]);

    const stats = calculateStandingStats({
      characterBase: { hp: 1000, attack: 1000, defense: 500, speed: 100, taunt: 75 },
      lightConeBase: night.baseStats!,
      relics: [],
      traces: [],
      lightConeEffects: [lightConeSkillEffect(night.skill, 1)!],
    });
    expect(stats.find((stat) => stat.key === "critRate")?.value).toBe(23);

    const withStandingBonus = lightConeCatalogue.lightCones.filter((entry) => {
      const effect = lightConeSkillEffect(entry.skill, 1);
      return effect ? staticSetStats([effect]).length > 0 : false;
    });
    expect(withStandingBonus.length).toBeGreaterThan(50);
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
