/**
 * Configurable grade-5 roll tables and drop probabilities for Stat Score / Estimated TBP.
 * Values follow Fribbels HSR Optimizer + IceDynamix est-tbp community tables.
 */

/** Substats that can appear on relics (12 lines). */
export const SUBSTAT_KEYS = [
  "HP",
  "ATK",
  "DEF",
  "HP%",
  "ATK%",
  "DEF%",
  "SPD",
  "CRIT Rate",
  "CRIT DMG",
  "Effect Hit Rate",
  "Effect RES",
  "Break Effect",
] as const;

export type SubstatKey = (typeof SUBSTAT_KEYS)[number];

/** Grade-5 low / mid / high roll values for substats. */
export const GRADE5_SUBSTAT_ROLLS: Record<SubstatKey, { low: number; mid: number; high: number }> =
  {
    HP: { low: 33.87, mid: 38.10375, high: 42.3375 },
    ATK: { low: 16.935, mid: 19.051875, high: 21.16875 },
    DEF: { low: 16.935, mid: 19.051875, high: 21.16875 },
    "HP%": { low: 3.456, mid: 3.888, high: 4.32 },
    "ATK%": { low: 3.456, mid: 3.888, high: 4.32 },
    "DEF%": { low: 4.32, mid: 4.86, high: 5.4 },
    SPD: { low: 2.0, mid: 2.3, high: 2.6 },
    "CRIT Rate": { low: 2.592, mid: 2.916, high: 3.24 },
    "CRIT DMG": { low: 5.184, mid: 5.832, high: 6.48 },
    "Effect Hit Rate": { low: 3.456, mid: 3.888, high: 4.32 },
    "Effect RES": { low: 3.456, mid: 3.888, high: 4.32 },
    "Break Effect": { low: 5.184, mid: 5.832, high: 6.48 },
  };

/** Crit DMG high roll used as the potential-scale baseline. */
export const POTENTIAL_BASELINE_HIGH = GRADE5_SUBSTAT_ROLLS["CRIT DMG"].high;

/** Flat substats use 40% of the matching percent-stat weight. */
export const FLAT_STAT_WEIGHT_FACTOR = 0.4;

/** Flat stats map to their percent counterparts for weight lookup. */
export const FLAT_TO_PERCENT: Partial<Record<string, string>> = {
  HP: "HP%",
  ATK: "ATK%",
  DEF: "DEF%",
};

export const FLAT_SUBSTATS = new Set(["HP", "ATK", "DEF"]);

/** Substat line weights for initial-line probability (community sheet). */
export const SUBSTAT_LINE_WEIGHT: Record<SubstatKey, number> = {
  HP: 10,
  ATK: 10,
  DEF: 10,
  "HP%": 10,
  "ATK%": 10,
  "DEF%": 10,
  SPD: 4,
  "CRIT Rate": 6,
  "CRIT DMG": 6,
  "Effect Hit Rate": 8,
  "Effect RES": 8,
  "Break Effect": 8,
};

export const TOTAL_SUBSTAT_LINE_WEIGHT = Object.values(SUBSTAT_LINE_WEIGHT).reduce(
  (sum, weight) => sum + weight,
  0,
);

/** Trailblaze power aggregation constants (est-tbp / Optimizer). */
export const TBP_PER_RUN = 40;
export const RELICS_PER_RUN = 2.1;
export const TBP_PER_RELIC = TBP_PER_RUN / RELICS_PER_RUN;
export const TBP_PER_DAY = 240;

/** 5★ opener line distribution. */
export const P_FOUR_LINER = 0.2;
export const P_THREE_LINER = 0.8;

/** Correct set drop among two sets per domain. */
export const P_CORRECT_SET = 0.5;

export type RelicSlotName = "Head" | "Hands" | "Body" | "Feet" | "PlanarSphere" | "LinkRope";

export function probabilityOfCorrectSlot(slot: string): number {
  switch (slot) {
    case "Head":
    case "Hands":
    case "Body":
    case "Feet":
      return 0.25;
    case "PlanarSphere":
    case "LinkRope":
      return 0.5;
    default:
      return 0;
  }
}

export function probabilityOfCorrectMainStat(slot: string, mainStat: string): number {
  switch (slot) {
    case "Head":
    case "Hands":
      return 1;
    case "Body":
      if (mainStat === "HP%" || mainStat === "ATK%" || mainStat === "DEF%") return 0.2;
      if (
        mainStat === "CRIT Rate" ||
        mainStat === "CRIT DMG" ||
        mainStat === "Outgoing Healing Boost" ||
        mainStat === "Effect Hit Rate"
      )
        return 0.1;
      return 0;
    case "Feet":
      if (mainStat === "HP%" || mainStat === "ATK%" || mainStat === "DEF%") return 0.3;
      if (mainStat === "SPD") return 0.1;
      return 0;
    case "PlanarSphere":
      if (mainStat === "HP%" || mainStat === "ATK%" || mainStat === "DEF%") return 0.12;
      if (
        mainStat.endsWith(" DMG Boost") ||
        [
          "Physical DMG Boost",
          "Fire DMG Boost",
          "Ice DMG Boost",
          "Lightning DMG Boost",
          "Wind DMG Boost",
          "Quantum DMG Boost",
          "Imaginary DMG Boost",
        ].includes(mainStat)
      )
        return 0.64 / 7;
      return 0;
    case "LinkRope":
      if (mainStat === "HP%" || mainStat === "ATK%" || mainStat === "DEF%") return 0.8 / 3;
      if (mainStat === "Break Effect") return 0.15;
      if (mainStat === "Energy Regeneration Rate") return 0.05;
      return 0;
    default:
      return 0;
  }
}

export function probabilityOfMain(slot: string, mainStat: string): number {
  return (
    P_CORRECT_SET * probabilityOfCorrectSlot(slot) * probabilityOfCorrectMainStat(slot, mainStat)
  );
}

/** Letter grades from potential percent (5% steps). */
export const LETTER_GRADES: Array<{ min: number; grade: string }> = [
  { min: 90, grade: "AEON" },
  { min: 85, grade: "WTF+" },
  { min: 80, grade: "WTF" },
  { min: 75, grade: "SSS+" },
  { min: 70, grade: "SSS" },
  { min: 65, grade: "SS+" },
  { min: 60, grade: "SS" },
  { min: 55, grade: "S+" },
  { min: 50, grade: "S" },
  { min: 45, grade: "A+" },
  { min: 40, grade: "A" },
  { min: 35, grade: "B+" },
  { min: 30, grade: "B" },
  { min: 25, grade: "C+" },
  { min: 20, grade: "C" },
  { min: 15, grade: "D+" },
  { min: 10, grade: "D" },
  { min: 5, grade: "F+" },
  { min: 0, grade: "F" },
];

export function letterGradeFromPotential(potentialPct: number): string {
  const clamped = Math.max(0, potentialPct);
  for (const entry of LETTER_GRADES) {
    if (clamped >= entry.min) return entry.grade;
  }
  return "F";
}

/**
 * Role weight templates for Stat Score convenience presets.
 *
 * Design rules (reviewed against Fribbels defaults + common HSR archetypes):
 * - Damage templates weight only stats that usually raise that archetype’s damage or action
 *   value; **Effect RES is 0 on pure damage kits** so dead survival lines do not inflate scores.
 * - Fribbels assigns RES mainly to supports (≈0.25) and sustains (≈0.50), not to crit DPS.
 * - SPD is 1.0 for most action-value kits, but **not** for counter / low-SPD DPS
 *   (Clara / Yunli etc. often prefer ATK boots and minimal SPD so enemies hit them more).
 * - Crit DPS matches Fribbels baseline: ATK% 0.75, SPD/CR/CD 1.0 (when SPD is valued).
 * - Templates are **generic archetypes**, not per-character official tables; always adjustable.
 */
export type WeightRole =
  | "critDps"
  | "critDpsSlow"
  | "hpDps"
  | "defDps"
  | "breakDps"
  | "dot"
  | "support"
  | "ehrSupport"
  | "sustain";

/** Full substat map builder so every template lists every scorable key. */
function w(partial: Partial<Record<SubstatKey, number>>): Record<string, number> {
  const base: Record<string, number> = Object.fromEntries(SUBSTAT_KEYS.map((key) => [key, 0]));
  return { ...base, ...partial };
}

export const DEFAULT_ROLE_WEIGHTS: Record<WeightRole, Record<string, number>> = {
  /**
   * 暴击直伤主 C — Seele / Jing Yuan / Acheron (crit builds) 等。
   * Fribbels crit DPS baseline; RES not valued for damage scoring.
   */
  critDps: w({
    SPD: 1,
    "CRIT Rate": 1,
    "CRIT DMG": 1,
    "ATK%": 0.75,
    "Break Effect": 0,
    "Effect Hit Rate": 0,
    "Effect RES": 0,
    "HP%": 0,
    "DEF%": 0,
  }),
  /**
   * 低速 / 反击暴击输出 — Clara / Yunli 等。
   * 核心伤害来自反击或希望被打；速度副词条通常接近无用甚至有害（行动太快减少受击窗口）。
   * SPD 权重 0；双暴 + 攻击% 为主。脚部通常走攻击鞋而非速度鞋。
   */
  critDpsSlow: w({
    SPD: 0,
    "CRIT Rate": 1,
    "CRIT DMG": 1,
    "ATK%": 1,
    "Break Effect": 0,
    "Effect Hit Rate": 0,
    "Effect RES": 0,
    "HP%": 0,
    "DEF%": 0,
  }),
  /**
   * 生命倍率输出 — Blade / 部分生命乘区主 C。
   * 「倍率」= 技能伤害公式吃 HP 面板，不是“生命缩放系统”。
   */
  hpDps: w({
    SPD: 1,
    "CRIT Rate": 1,
    "CRIT DMG": 1,
    "HP%": 1,
    "ATK%": 0,
    "DEF%": 0,
    "Effect Hit Rate": 0,
    "Effect RES": 0,
    "Break Effect": 0,
  }),
  /**
   * 防御倍率输出 — 少数 DEF 乘区输出（如部分盾辅兼输出构筑）。
   * 与纯生存位不同：仍保留一定双暴权重。
   */
  defDps: w({
    SPD: 1,
    "CRIT Rate": 0.75,
    "CRIT DMG": 0.75,
    "DEF%": 1,
    "HP%": 0.25,
    "ATK%": 0,
    "Effect Hit Rate": 0,
    "Effect RES": 0,
    "Break Effect": 0,
  }),
  /**
   * 击破 / 超击破 — Firefly / Boothill / Rappa 等。
   * 击破伤害基本不吃双暴；ATK% 对部分击破角色仍有用，双暴保持 0。
   */
  breakDps: w({
    SPD: 1,
    "Break Effect": 1,
    "ATK%": 0.75,
    "CRIT Rate": 0,
    "CRIT DMG": 0,
    "Effect Hit Rate": 0,
    "Effect RES": 0,
    "HP%": 0,
    "DEF%": 0,
  }),
  /**
   * 持续伤害 DoT — Kafka / Black Swan / 桑博 等。
   * 引爆与 DoT 乘区主吃攻击与速度；效果命中保障上异常；双暴提升很有限。
   */
  dot: w({
    SPD: 1,
    "ATK%": 1,
    "Effect Hit Rate": 1,
    "CRIT Rate": 0,
    "CRIT DMG": 0,
    "Break Effect": 0,
    "Effect RES": 0,
    "HP%": 0,
    "DEF%": 0,
  }),
  /**
   * 同谐 / 进攻辅助 — Bronya / Sparkle / Robin 等（以拉条、加攻、增伤为主）。
   * SPD 优先；少量 HP/DEF 利于生存；EHR 默认 0（不依赖命中时不要抬死词条）。
   * RES 取 Fribbels 进攻辅助口径 0.25（抗控，不抬输出）。
   */
  support: w({
    SPD: 1,
    "HP%": 0.5,
    "DEF%": 0.25,
    "Effect RES": 0.25,
    "ATK%": 0.25,
    "Effect Hit Rate": 0,
    "CRIT Rate": 0,
    "CRIT DMG": 0,
    "Break Effect": 0,
  }),
  /**
   * 命中 / 虚无辅助 — Pela / Silver Wolf / Jiaoqiu 等靠效果命中上 debuff。
   */
  ehrSupport: w({
    SPD: 1,
    "Effect Hit Rate": 1,
    "HP%": 0.25,
    "DEF%": 0.25,
    "Effect RES": 0.25,
    "ATK%": 0,
    "CRIT Rate": 0,
    "CRIT DMG": 0,
    "Break Effect": 0,
  }),
  /**
   * 生存位 — 丰饶 / 存护奶盾（Luocha / Huohuo / Aventurine 生存向 等）。
   * SPD + 生存面板；RES 0.5 对齐 Fribbels defensive sustain。
   */
  sustain: w({
    SPD: 1,
    "HP%": 0.75,
    "DEF%": 0.75,
    "Effect RES": 0.5,
    "Effect Hit Rate": 0,
    "ATK%": 0,
    "CRIT Rate": 0,
    "CRIT DMG": 0,
    "Break Effect": 0,
  }),
};

export const WEIGHT_ROLE_LABELS: Record<WeightRole, string> = {
  critDps: "暴击直伤",
  critDpsSlow: "低速反击输出",
  hpDps: "生命倍率输出",
  defDps: "防御倍率输出",
  breakDps: "击破输出",
  dot: "持续伤害 DoT",
  support: "同谐/进攻辅助",
  ehrSupport: "命中/虚无辅助",
  sustain: "生存位（奶盾）",
};

/** Short help text for the weight editor (Chinese). */
export const WEIGHT_ROLE_HINTS: Record<WeightRole, string> = {
  critDps: "双暴 + 速度 + 攻击%；常规直伤暴击主 C。效果抵抗不计分。",
  critDpsSlow:
    "克拉拉/云璃等反击或希望被打的低速路线：双暴 + 攻击%；速度权重为 0（速度鞋/副词条通常不是目标）。",
  hpDps: "技能伤害吃生命面板（如刃）。生命% + 双暴 + 速度。",
  defDps: "技能伤害吃防御面板。防御% 优先，保留部分双暴。",
  breakDps: "击破特攻 + 速度 + 攻击%；双暴通常无用。",
  dot: "攻击% + 速度 + 效果命中；卡芙卡/黑天鹅等，双暴通常无用。",
  support: "速度优先，少量生存；不依赖命中的同谐/辅助。",
  ehrSupport: "速度 + 效果命中；佩拉/银狼等上 debuff 辅助。",
  sustain: "速度 + 生命/防御 + 效果抵抗；奶妈/盾辅生存向。",
};

/** Display order in the role template dropdown. */
export const WEIGHT_ROLE_ORDER: WeightRole[] = [
  "critDps",
  "critDpsSlow",
  "hpDps",
  "defDps",
  "breakDps",
  "dot",
  "support",
  "ehrSupport",
  "sustain",
];

export const WEIGHT_STEPS = [0, 0.25, 0.5, 0.75, 1] as const;

export function emptyWeights(): Record<string, number> {
  return Object.fromEntries(SUBSTAT_KEYS.map((key) => [key, 0]));
}

export function cloneWeights(weights: Record<string, number>): Record<string, number> {
  return { ...emptyWeights(), ...weights };
}

export function roleWeights(role: WeightRole): Record<string, number> {
  return cloneWeights(DEFAULT_ROLE_WEIGHTS[role]);
}

/**
 * Infer a role template from effective substats when plan has no explicit weights.
 * Order matters: more specific kits (break / DoT / EHR) before generic crit.
 */
export function inferWeightsFromEffectiveSubstats(
  effectiveSubstats: string[],
): Record<string, number> {
  const set = new Set(effectiveSubstats);
  const hasCrit = set.has("CRIT Rate") || set.has("CRIT DMG");
  const hasAtk = set.has("ATK%") || set.has("ATK");
  const hasEhr = set.has("Effect Hit Rate");
  const hasBreak = set.has("Break Effect");
  const hasHp = set.has("HP%") || set.has("HP");
  const hasDef = set.has("DEF%") || set.has("DEF");
  const hasRes = set.has("Effect RES");

  // Pure / primary break kit
  if (hasBreak && !hasCrit) return roleWeights("breakDps");
  // DoT: ATK + EHR, little crit
  if (hasEhr && hasAtk && !hasCrit) return roleWeights("dot");
  // Debuff support: EHR without ATK focus
  if (hasEhr && !hasCrit && !hasAtk) return roleWeights("ehrSupport");
  // HP scaling crit DPS
  if (hasHp && hasCrit && !hasAtk) return roleWeights("hpDps");
  // DEF scaling
  if (hasDef && !hasAtk && (hasCrit || !hasHp)) return roleWeights("defDps");
  // Sustain: RES or heavy HP/DEF without crit/atk damage lines
  if (hasRes && (hasHp || hasDef) && !hasCrit && !hasAtk) return roleWeights("sustain");
  if ((hasHp || hasDef) && !hasCrit && !hasAtk && !hasEhr && !hasBreak)
    return roleWeights("sustain");
  // Speed-first support without damage lines
  if (set.has("SPD") && !hasCrit && !hasAtk && !hasEhr && !hasBreak) return roleWeights("support");
  if (hasCrit || hasAtk) return roleWeights("critDps");
  return roleWeights("critDps");
}

export function potentialScale(stat: string): number {
  const rolls = GRADE5_SUBSTAT_ROLLS[stat as SubstatKey];
  if (!rolls) return 1;
  return POTENTIAL_BASELINE_HIGH / rolls.high;
}

/**
 * Effective scoring weight for a substat.
 * Flat HP/ATK/DEF use 40% of the matching percent-stat weight (not the flat key's own weight).
 * Example: weights { "ATK%": 1, ATK: 0 } → flat ATK scores as 0.4.
 */
export function effectiveWeight(stat: string, weights: Record<string, number>): number {
  if (FLAT_SUBSTATS.has(stat)) {
    const percentKey = FLAT_TO_PERCENT[stat];
    const percentWeight = percentKey ? (weights[percentKey] ?? 0) : 0;
    return percentWeight * FLAT_STAT_WEIGHT_FACTOR;
  }
  return weights[stat] ?? 0;
}
