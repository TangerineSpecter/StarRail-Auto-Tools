// Shared standing-stat calculation for inventory details and build planning.
export type StaticStatValue = {
  key: string;
  value: number;
};

export type EquippedRelicForStats = {
  mainStat: string;
  mainStatValue: number;
  substats?: Array<{ kind: string; key: string; value: number }>;
};

export type StandingStatsInput = {
  characterBase: { hp: number; attack: number; defense: number; speed: number; taunt: number };
  lightConeBase: { hp: number; attack: number; defense: number };
  relics: EquippedRelicForStats[];
  traces: StaticStatValue[];
  setEffects?: string[];
};

export type StandingStat = {
  key: string;
  label: string;
  value: number;
  unit: "flat" | "percent";
};

type Accumulator = {
  hpFlat: number;
  hpPercent: number;
  attackFlat: number;
  attackPercent: number;
  defenseFlat: number;
  defensePercent: number;
  speed: number;
  speedPercent: number;
  percent: Record<string, number>;
};

const percentLabels: Record<string, { key: string; label: string }> = {
  "CRIT Rate": { key: "critRate", label: "暴击率" },
  "CRIT DMG": { key: "critDmg", label: "暴击伤害" },
  "Effect Hit Rate": { key: "effectHitRate", label: "效果命中" },
  "Effect RES": { key: "effectRes", label: "效果抵抗" },
  "Break Effect": { key: "breakEffect", label: "击破特攻" },
  "Outgoing Healing Boost": { key: "healingBoost", label: "治疗量加成" },
  "Energy Regeneration Rate": { key: "energyRegen", label: "能量恢复效率" },
  "Physical DMG Boost": { key: "physicalDmg", label: "物理伤害提高" },
  "Fire DMG Boost": { key: "fireDmg", label: "火属性伤害提高" },
  "Ice DMG Boost": { key: "iceDmg", label: "冰属性伤害提高" },
  "Lightning DMG Boost": { key: "lightningDmg", label: "雷属性伤害提高" },
  "Wind DMG Boost": { key: "windDmg", label: "风属性伤害提高" },
  "Quantum DMG Boost": { key: "quantumDmg", label: "量子属性伤害提高" },
  "Imaginary DMG Boost": { key: "imaginaryDmg", label: "虚数属性伤害提高" },
  "All-Type RES PEN": { key: "resPen", label: "全属性抗性穿透" },
};

const traceKeyAliases: Record<string, string> = {
  生命值: "HP%",
  攻击力: "ATK%",
  防御力: "DEF%",
  速度: "SPD",
  暴击率: "CRIT Rate",
  暴击伤害: "CRIT DMG",
  效果命中: "Effect Hit Rate",
  效果抵抗: "Effect RES",
  击破特攻: "Break Effect",
  治疗量加成: "Outgoing Healing Boost",
  能量恢复效率: "Energy Regeneration Rate",
  物理属性伤害提高: "Physical DMG Boost",
  火属性伤害提高: "Fire DMG Boost",
  冰属性伤害提高: "Ice DMG Boost",
  雷属性伤害提高: "Lightning DMG Boost",
  风属性伤害提高: "Wind DMG Boost",
  量子属性伤害提高: "Quantum DMG Boost",
  虚数属性伤害提高: "Imaginary DMG Boost",
};

function normalizeKey(key: string): string {
  const trimmedKey = key.trim();
  const compactKey = trimmedKey.replace(/\s+/g, "");
  return traceKeyAliases[compactKey] ?? trimmedKey.replace(/_$/, "");
}

function addStat(accumulator: Accumulator, rawKey: string, value: number) {
  const key = normalizeKey(rawKey);
  if (!Number.isFinite(value)) return;

  if (key === "HP") accumulator.hpFlat += value;
  else if (key === "HP%") accumulator.hpPercent += value / 100;
  else if (key === "ATK") accumulator.attackFlat += value;
  else if (key === "ATK%") accumulator.attackPercent += value / 100;
  else if (key === "DEF") accumulator.defenseFlat += value;
  else if (key === "DEF%") accumulator.defensePercent += value / 100;
  else if (key === "SPD") accumulator.speed += value;
  else if (key === "SPD%") accumulator.speedPercent += value / 100;
  else if (percentLabels[key])
    accumulator.percent[key] = (accumulator.percent[key] ?? 0) + value / 100;
}

function addTraceStat(accumulator: Accumulator, stat: StaticStatValue) {
  const key = normalizeKey(stat.key);
  // 星穹铁道站的行迹值以小数记录百分比，而遗器值是 5.8 这种百分点。
  const value = key === "SPD" ? stat.value : stat.value * 100;
  addStat(accumulator, key, value);
}

const setStatPatterns: Array<{ pattern: RegExp; key: string }> = [
  {
    pattern: /^(?:(?:使)?装备者(?:的)?\s*)?(?:生命值|生命上限)提高\s*(\d+(?:\.\d+)?)\s*%/,
    key: "HP%",
  },
  { pattern: /^(?:(?:使)?装备者(?:的)?\s*)?攻击力提高\s*(\d+(?:\.\d+)?)\s*%/, key: "ATK%" },
  { pattern: /^(?:(?:使)?装备者(?:的)?\s*)?防御力提高\s*(\d+(?:\.\d+)?)\s*%/, key: "DEF%" },
  { pattern: /^(?:(?:使)?装备者(?:的)?\s*)?速度提高\s*(\d+(?:\.\d+)?)\s*%/, key: "SPD%" },
  { pattern: /^(?:(?:使)?装备者(?:的)?\s*)?暴击率提高\s*(\d+(?:\.\d+)?)\s*%/, key: "CRIT Rate" },
  { pattern: /^(?:(?:使)?装备者(?:的)?\s*)?暴击伤害提高\s*(\d+(?:\.\d+)?)\s*%/, key: "CRIT DMG" },
  {
    pattern: /^(?:(?:使)?装备者(?:的)?\s*)?效果命中提高\s*(\d+(?:\.\d+)?)\s*%/,
    key: "Effect Hit Rate",
  },
  { pattern: /^(?:(?:使)?装备者(?:的)?\s*)?效果抵抗提高\s*(\d+(?:\.\d+)?)\s*%/, key: "Effect RES" },
  {
    pattern: /^(?:(?:使)?装备者(?:的)?\s*)?击破特攻提高\s*(\d+(?:\.\d+)?)\s*%/,
    key: "Break Effect",
  },
  {
    pattern: /^(?:(?:使)?装备者(?:的)?\s*)?治疗量提高\s*(\d+(?:\.\d+)?)\s*%/,
    key: "Outgoing Healing Boost",
  },
  {
    pattern: /^(?:(?:使)?装备者(?:的)?\s*)?能量恢复效率提高\s*(\d+(?:\.\d+)?)\s*%/,
    key: "Energy Regeneration Rate",
  },
  {
    pattern: /^(?:(?:使)?装备者(?:的)?\s*)?物理\s*属性伤害提高\s*(\d+(?:\.\d+)?)\s*%/,
    key: "Physical DMG Boost",
  },
  {
    pattern: /^(?:(?:使)?装备者(?:的)?\s*)?火\s*属性伤害提高\s*(\d+(?:\.\d+)?)\s*%/,
    key: "Fire DMG Boost",
  },
  {
    pattern: /^(?:(?:使)?装备者(?:的)?\s*)?冰\s*属性伤害提高\s*(\d+(?:\.\d+)?)\s*%/,
    key: "Ice DMG Boost",
  },
  {
    pattern: /^(?:(?:使)?装备者(?:的)?\s*)?雷\s*属性伤害提高\s*(\d+(?:\.\d+)?)\s*%/,
    key: "Lightning DMG Boost",
  },
  {
    pattern: /^(?:(?:使)?装备者(?:的)?\s*)?风\s*属性伤害提高\s*(\d+(?:\.\d+)?)\s*%/,
    key: "Wind DMG Boost",
  },
  {
    pattern: /^(?:(?:使)?装备者(?:的)?\s*)?量子\s*属性伤害提高\s*(\d+(?:\.\d+)?)\s*%/,
    key: "Quantum DMG Boost",
  },
  {
    pattern: /^(?:(?:使)?装备者(?:的)?\s*)?虚数\s*属性伤害提高\s*(\d+(?:\.\d+)?)\s*%/,
    key: "Imaginary DMG Boost",
  },
];

export function staticSetStats(effects: string[]): StaticStatValue[] {
  return effects.flatMap((effect) => {
    const leadingClause = effect.trim().split(/[。；，]/u, 1)[0] ?? "";
    const definition = setStatPatterns.find(({ pattern }) => pattern.test(leadingClause));
    if (!definition) return [];

    const value = Number(leadingClause.match(definition.pattern)?.[1]);
    return Number.isFinite(value) ? [{ key: definition.key, value: value / 100 }] : [];
  });
}

function addStaticSetConversions(accumulator: Accumulator, effects: string[]) {
  for (const effect of effects) {
    const match = effect.match(
      /提高装备者等同于当前效果命中\s*(\d+(?:\.\d+)?)\s*%\s*的攻击力，最多提高\s*(\d+(?:\.\d+)?)\s*%/u,
    );
    if (!match) continue;

    const ratio = Number(match[1]) / 100;
    const cap = Number(match[2]) / 100;
    if (!Number.isFinite(ratio) || !Number.isFinite(cap)) continue;
    accumulator.attackPercent += Math.min(
      (accumulator.percent["Effect Hit Rate"] ?? 0) * ratio,
      cap,
    );
  }
}

function floorToInteger(value: number): number {
  return Math.floor(value + 1e-6);
}

function truncatePercent(value: number): number {
  return Math.floor((value + 1e-6) * 10) / 10;
}

export function calculateStandingStats(input: StandingStatsInput): StandingStat[] {
  const accumulator: Accumulator = {
    hpFlat: 0,
    hpPercent: 0,
    attackFlat: 0,
    attackPercent: 0,
    defenseFlat: 0,
    defensePercent: 0,
    speed: 0,
    speedPercent: 0,
    percent: {},
  };

  for (const relic of input.relics) {
    addStat(accumulator, relic.mainStat, relic.mainStatValue);
    for (const substat of relic.substats ?? []) {
      if (substat.kind === "normal") addStat(accumulator, substat.key, substat.value);
    }
  }
  for (const trace of input.traces) addTraceStat(accumulator, trace);
  for (const stat of staticSetStats(input.setEffects ?? [])) addTraceStat(accumulator, stat);
  addStaticSetConversions(accumulator, input.setEffects ?? []);

  const baseHp = input.characterBase.hp + input.lightConeBase.hp;
  const baseAttack = input.characterBase.attack + input.lightConeBase.attack;
  const baseDefense = input.characterBase.defense + input.lightConeBase.defense;
  const stats: StandingStat[] = [
    {
      key: "hp",
      label: "生命值",
      value: floorToInteger(baseHp * (1 + accumulator.hpPercent) + accumulator.hpFlat),
      unit: "flat",
    },
    {
      key: "attack",
      label: "攻击力",
      value: floorToInteger(baseAttack * (1 + accumulator.attackPercent) + accumulator.attackFlat),
      unit: "flat",
    },
    {
      key: "defense",
      label: "防御力",
      value: floorToInteger(
        baseDefense * (1 + accumulator.defensePercent) + accumulator.defenseFlat,
      ),
      unit: "flat",
    },
    {
      key: "speed",
      label: "速度",
      value: floorToInteger(
        input.characterBase.speed * (1 + accumulator.speedPercent) + accumulator.speed,
      ),
      unit: "flat",
    },
    {
      key: "critRate",
      label: "暴击率",
      value: truncatePercent((0.05 + (accumulator.percent["CRIT Rate"] ?? 0)) * 100),
      unit: "percent",
    },
    {
      key: "critDmg",
      label: "暴击伤害",
      value: truncatePercent((0.5 + (accumulator.percent["CRIT DMG"] ?? 0)) * 100),
      unit: "percent",
    },
  ];

  for (const [sourceKey, definition] of Object.entries(percentLabels)) {
    if (sourceKey === "CRIT Rate" || sourceKey === "CRIT DMG") continue;
    const base = sourceKey === "Energy Regeneration Rate" ? 1 : 0;
    const value = base + (accumulator.percent[sourceKey] ?? 0);
    if (value)
      stats.push({
        key: definition.key,
        label: definition.label,
        value: truncatePercent(value * 100),
        unit: "percent",
      });
  }
  return stats;
}

export function formatStandingStat(stat: StandingStat): string {
  const value = Number.isInteger(stat.value) ? String(stat.value) : stat.value.toFixed(1);
  return stat.unit === "percent" ? `${value}%` : value;
}

export function isMaxStandingEquipment(
  character: { level: number; ascension: number },
  lightCone: { level: number; ascension: number } | null,
): boolean {
  return (
    character.level >= 80 &&
    character.ascension >= 6 &&
    Boolean(lightCone && lightCone.level >= 80 && lightCone.ascension >= 6)
  );
}
