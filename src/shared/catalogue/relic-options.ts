export const relicSlots = [
  { value: "Head", label: "头部" },
  { value: "Hands", label: "手部" },
  { value: "Body", label: "躯干" },
  { value: "Feet", label: "脚部" },
  { value: "PlanarSphere", label: "位面球" },
  { value: "LinkRope", label: "连结绳" },
] as const;

export const relicSubStats = [
  "HP",
  "HP%",
  "ATK",
  "ATK%",
  "DEF",
  "DEF%",
  "SPD",
  "CRIT Rate",
  "CRIT DMG",
  "Effect Hit Rate",
  "Effect RES",
  "Break Effect",
];

export const relicMainStats: Record<string, string[]> = {
  Head: ["HP"],
  Hands: ["ATK"],
  Body: [
    "HP%",
    "ATK%",
    "DEF%",
    "CRIT Rate",
    "CRIT DMG",
    "Outgoing Healing Boost",
    "Effect Hit Rate",
  ],
  Feet: ["HP%", "ATK%", "DEF%", "SPD"],
  PlanarSphere: [
    "HP%",
    "ATK%",
    "DEF%",
    "Physical DMG Boost",
    "Fire DMG Boost",
    "Ice DMG Boost",
    "Lightning DMG Boost",
    "Wind DMG Boost",
    "Quantum DMG Boost",
    "Imaginary DMG Boost",
  ],
  LinkRope: ["HP%", "ATK%", "DEF%", "Break Effect", "Energy Regeneration Rate"],
};

export const statLabels: Record<string, string> = {
  HP: "生命值",
  "HP%": "生命百分比",
  ATK: "攻击力",
  "ATK%": "攻击百分比",
  DEF: "防御力",
  "DEF%": "防御百分比",
  SPD: "速度",
  "CRIT Rate": "暴击率",
  "CRIT DMG": "暴击伤害",
  "Effect Hit Rate": "效果命中",
  "Effect RES": "效果抵抗",
  "Break Effect": "击破特攻",
  "Outgoing Healing Boost": "治疗量加成",
  "Energy Regeneration Rate": "能量恢复效率",
  "Physical DMG Boost": "物理伤害提高",
  "Fire DMG Boost": "火属性伤害提高",
  "Ice DMG Boost": "冰属性伤害提高",
  "Lightning DMG Boost": "雷属性伤害提高",
  "Wind DMG Boost": "风属性伤害提高",
  "Quantum DMG Boost": "量子属性伤害提高",
  "Imaginary DMG Boost": "虚数属性伤害提高",
};

export const slotLabel = (slot: string): string =>
  relicSlots.find((item) => item.value === slot)?.label ?? slot;
export const statLabel = (stat: string): string => statLabels[stat] ?? stat;
const percentageStats = new Set([
  "HP%",
  "ATK%",
  "DEF%",
  "CRIT Rate",
  "CRIT DMG",
  "Effect Hit Rate",
  "Effect RES",
  "Break Effect",
  "Outgoing Healing Boost",
  "Energy Regeneration Rate",
  "Physical DMG Boost",
  "Fire DMG Boost",
  "Ice DMG Boost",
  "Lightning DMG Boost",
  "Wind DMG Boost",
  "Quantum DMG Boost",
  "Imaginary DMG Boost",
]);

export const formatStatValue = (stat: string, value: number): string =>
  `${value.toFixed(1)}${percentageStats.has(stat) ? "%" : ""}`;

export const pathLabel = (path: string): string =>
  ({
    Destruction: "毁灭",
    Hunt: "巡猎",
    Erudition: "智识",
    Harmony: "同谐",
    Nihility: "虚无",
    Preservation: "存护",
    Abundance: "丰饶",
    Remembrance: "记忆",
    Elation: "欢愉",
  })[path] ?? path;
