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
  else if (percentLabels[key])
    accumulator.percent[key] = (accumulator.percent[key] ?? 0) + value / 100;
}

function addTraceStat(accumulator: Accumulator, stat: StaticStatValue) {
  const key = normalizeKey(stat.key);
  // 星穹铁道站的行迹值以小数记录百分比，而遗器值是 5.8 这种百分点。
  const value = key === "SPD" ? stat.value : stat.value * 100;
  addStat(accumulator, key, value);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
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
    percent: {},
  };

  for (const relic of input.relics) {
    addStat(accumulator, relic.mainStat, relic.mainStatValue);
    for (const substat of relic.substats ?? []) {
      if (substat.kind === "normal") addStat(accumulator, substat.key, substat.value);
    }
  }
  for (const trace of input.traces) addTraceStat(accumulator, trace);

  const baseHp = input.characterBase.hp + input.lightConeBase.hp;
  const baseAttack = input.characterBase.attack + input.lightConeBase.attack;
  const baseDefense = input.characterBase.defense + input.lightConeBase.defense;
  const stats: StandingStat[] = [
    {
      key: "hp",
      label: "生命值",
      value: round(baseHp * (1 + accumulator.hpPercent) + accumulator.hpFlat),
      unit: "flat",
    },
    {
      key: "attack",
      label: "攻击力",
      value: round(baseAttack * (1 + accumulator.attackPercent) + accumulator.attackFlat),
      unit: "flat",
    },
    {
      key: "defense",
      label: "防御力",
      value: round(baseDefense * (1 + accumulator.defensePercent) + accumulator.defenseFlat),
      unit: "flat",
    },
    {
      key: "speed",
      label: "速度",
      value: round(input.characterBase.speed + accumulator.speed),
      unit: "flat",
    },
    {
      key: "critRate",
      label: "暴击率",
      value: round((0.05 + (accumulator.percent["CRIT Rate"] ?? 0)) * 100),
      unit: "percent",
    },
    {
      key: "critDmg",
      label: "暴击伤害",
      value: round((0.5 + (accumulator.percent["CRIT DMG"] ?? 0)) * 100),
      unit: "percent",
    },
  ];

  for (const [sourceKey, definition] of Object.entries(percentLabels)) {
    if (sourceKey === "CRIT Rate" || sourceKey === "CRIT DMG") continue;
    const value = accumulator.percent[sourceKey] ?? 0;
    if (value)
      stats.push({
        key: definition.key,
        label: definition.label,
        value: round(value * 100),
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
