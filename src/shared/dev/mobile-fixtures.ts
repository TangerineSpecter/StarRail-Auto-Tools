import {
  characterCatalogue,
  catalogueCharacterId,
  lightConeCatalogue,
  relicCatalogue,
} from "@/shared/catalogue";
import type {
  BuildDashboardEntry,
  CharacterListItem,
  LightConeListItem,
  RelicListItem,
  Team,
} from "@/types";

const updatedAt = 1794326400;
// Stable catalogue IDs preserve the distinct paths of 三月七 and 开拓者.
const available = characterCatalogue.characters.filter((c) => catalogueCharacterId(c) !== null);
const variants = [
  available.find((c) => c.name === "三月七" && c.path === "巡猎")!,
  available.find((c) => c.name === "三月七" && c.path === "存护")!,
  available.find((c) => c.name === "开拓者" && c.path === "毁灭")!,
  available.find((c) => c.name === "开拓者" && c.path === "同谐")!,
];
const selected = [...available.filter((c) => !variants.includes(c)).slice(0, 16), ...variants];
export const characters: CharacterListItem[] = selected.map((c, i) => ({
  characterId: catalogueCharacterId(c)!,
  name: c.name,
  path: c.path,
  level: i % 5 === 4 ? 70 : 80,
  ascension: i % 5 === 4 ? 5 : 6,
  eidolon: i % 7,
  hasBuildPlan: i < 8,
  abilityVersion: 1,
  source: "mobile-demo",
  updatedAt,
}));
const cones = lightConeCatalogue.lightCones.filter((c) => c.rarity === 5).slice(0, 16);
export const lightCones: LightConeListItem[] = cones.map((c, i) => ({
  itemId: 5000 + i,
  templateId: c.id,
  name: c.name,
  level: 80,
  ascension: 6,
  superimposition: (i % 5) + 1,
  location: characters[i]?.name ?? "",
  equippedCharacterId: characters[i]?.characterId ?? null,
  locked: i % 2 === 0,
  source: "mobile-demo",
  updatedAt,
}));
const cavern = relicCatalogue.sets.filter((s) => s.kind === "cavern").slice(0, 8);
const planar = relicCatalogue.sets.filter((s) => s.kind === "planar").slice(0, 8);
const slotLabels = ["头部", "手部", "躯干", "脚部", "位面球", "连结绳"];
const slots = ["Head", "Hands", "Body", "Feet", "PlanarSphere", "LinkRope"];
const mains = ["HP", "ATK", "CRIT Rate", "SPD", "ATK%", "ATK%"];
const values = [705.6, 352.8, 32.4, 25.032, 43.2, 43.2];
// First three cards demonstrate +3, +4 and MAX. Counts include the initial
// roll; each +15 piece has nine total rolls, with values matching their rolls.
const highlightedSubstats: RelicListItem["substats"][] = [
  [
    { kind: "normal", position: 0, key: "CRIT Rate", value: 12.96, count: 4, step: 8 },
    { kind: "normal", position: 1, key: "CRIT DMG", value: 12.96, count: 2, step: 4 },
    { kind: "normal", position: 2, key: "SPD", value: 4, count: 2, step: 0 },
    { kind: "normal", position: 3, key: "ATK%", value: 4.32, count: 1, step: 2 },
  ],
  [
    { kind: "normal", position: 0, key: "CRIT Rate", value: 3.24, count: 1, step: 2 },
    { kind: "normal", position: 1, key: "CRIT DMG", value: 32.4, count: 5, step: 10 },
    { kind: "normal", position: 2, key: "SPD", value: 4, count: 2, step: 0 },
    { kind: "normal", position: 3, key: "ATK%", value: 4.32, count: 1, step: 2 },
  ],
  [
    { kind: "normal", position: 0, key: "HP", value: 42.3375, count: 1, step: 2 },
    { kind: "normal", position: 1, key: "CRIT DMG", value: 38.88, count: 6, step: 12 },
    { kind: "normal", position: 2, key: "SPD", value: 2, count: 1, step: 0 },
    { kind: "normal", position: 3, key: "ATK%", value: 4.32, count: 1, step: 2 },
  ],
];
export const relics: RelicListItem[] = characters.slice(0, 10).flatMap((c, i) =>
  slots.map((slot, j) => {
    const set = j < 4 ? cavern[i % cavern.length]! : planar[i % planar.length]!;
    return {
      itemId: 1000 + i * 6 + j,
      setId: set.id,
      name: `${set.name}·${slotLabels[j]}`,
      setName: set.name,
      slot,
      rarity: i === 9 ? 4 : 5,
      level: i === 9 ? 9 : 15,
      mainStat: mains[j]!,
      mainStatValue: values[j]!,
      location: i < 8 ? c.name : "",
      equippedCharacterId: i < 8 ? c.characterId : null,
      locked: i % 2 === 0,
      discard: i === 9,
      source: "mobile-demo",
      updatedAt,
      substats: (i === 0 ? highlightedSubstats[j] : undefined) ?? [
        { kind: "normal", position: 0, key: "CRIT Rate", value: 5.832 + i, count: 2, step: 0 },
        { kind: "normal", position: 1, key: "CRIT DMG", value: 12.96 + i, count: 2, step: 0 },
        { kind: "normal", position: 2, key: "SPD", value: 4 + (i % 4), count: 2, step: 0 },
        { kind: "normal", position: 3, key: "ATK%", value: 8.64, count: 2, step: 0 },
      ],
    };
  }),
);
export function characterDetail(id: number) {
  const character = characters.find((c) => c.characterId === id);
  if (!character) throw new Error("示例角色不存在");
  return {
    ...character,
    skills: { basic: 6, skill: 10, talent: 10, ult: 10 },
    traces: {},
    equippedRelics: relics.filter((r) => r.equippedCharacterId === id),
    equippedLightCone: lightCones.find((c) => c.equippedCharacterId === id) ?? null,
  };
}
export const dashboard: BuildDashboardEntry[] = characters.slice(0, 8).map((c, i) => ({
  character: characterDetail(c.characterId),
  displayOrder: i,
  pinned: i === 0,
  plan: {
    characterId: c.characterId,
    cavernMode: "fourPiece",
    cavernSetA: cavern[i % cavern.length]!.id,
    cavernSetB: null,
    planarSetId: planar[i % planar.length]!.id,
    mainStats: { Body: ["CRIT Rate"], Feet: ["SPD"], PlanarSphere: ["ATK%"], LinkRope: ["ATK%"] },
    targets: [
      { statKey: "ATK", target: 2800 + i * 100, minimum: 2200, priority: 1 },
      { statKey: "SPD", target: 134, minimum: 120, priority: 2 },
    ],
    effectiveSubstats: ["CRIT Rate", "CRIT DMG", "SPD", "ATK%"],
    substatWeights: {},
    minPotentialPct: 40,
    spdTarget: 134,
    note:
      i % 2
        ? "优先补足速度，再平衡暴击与攻击力。用于检查较长说明在折叠屏上的换行。"
        : "优先提升关键属性。",
  },
}));
export const teams: Team[] = ["日常探索队", "深渊挑战·长名称与备注展示", "待完善配队"].map(
  (name, i) => ({
    teamId: i + 1,
    name,
    note:
      i === 1
        ? "示例配队用于检查四人头像、角色名称和多行备注的排版，不代表实战推荐。"
        : "移动端调试示例",
    members: Array.from({ length: 4 }, (_, j) => {
      if (i === 2 && j > 1) return null;
      const c = characters[i * 4 + j]!;
      return {
        characterId: c.characterId,
        name: c.name,
        path: c.path,
        level: c.level,
        owned: true,
      };
    }),
    createdAt: updatedAt,
    updatedAt,
  }),
);
