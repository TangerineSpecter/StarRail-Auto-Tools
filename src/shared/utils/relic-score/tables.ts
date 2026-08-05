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
export const GRADE5_SUBSTAT_ROLLS: Record<
  SubstatKey,
  { low: number; mid: number; high: number }
> = {
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

export type RelicSlotName =
  | "Head"
  | "Hands"
  | "Body"
  | "Feet"
  | "PlanarSphere"
  | "LinkRope";

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
  return P_CORRECT_SET * probabilityOfCorrectSlot(slot) * probabilityOfCorrectMainStat(slot, mainStat);
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

/** Default role weight templates (0–1, 0.25 steps). */
export type WeightRole = "critDps" | "hpScaler" | "defScaler" | "break" | "support" | "sustain";

export const DEFAULT_ROLE_WEIGHTS: Record<WeightRole, Record<string, number>> = {
  critDps: {
    SPD: 1,
    "CRIT Rate": 1,
    "CRIT DMG": 1,
    "ATK%": 0.75,
    ATK: 0.75,
    "HP%": 0,
    HP: 0,
    "DEF%": 0,
    DEF: 0,
    "Effect Hit Rate": 0,
    "Effect RES": 0.25,
    "Break Effect": 0,
  },
  hpScaler: {
    SPD: 1,
    "CRIT Rate": 1,
    "CRIT DMG": 1,
    "HP%": 1,
    HP: 1,
    "ATK%": 0,
    ATK: 0,
    "DEF%": 0,
    DEF: 0,
    "Effect Hit Rate": 0,
    "Effect RES": 0.25,
    "Break Effect": 0,
  },
  defScaler: {
    SPD: 1,
    "CRIT Rate": 0.75,
    "CRIT DMG": 0.75,
    "DEF%": 1,
    DEF: 1,
    "ATK%": 0,
    ATK: 0,
    "HP%": 0.25,
    HP: 0.25,
    "Effect Hit Rate": 0,
    "Effect RES": 0.5,
    "Break Effect": 0,
  },
  break: {
    SPD: 1,
    "Break Effect": 1,
    "ATK%": 0.75,
    ATK: 0.75,
    "CRIT Rate": 0.5,
    "CRIT DMG": 0.5,
    "HP%": 0,
    HP: 0,
    "DEF%": 0,
    DEF: 0,
    "Effect Hit Rate": 0,
    "Effect RES": 0.25,
  },
  support: {
    SPD: 1,
    "HP%": 0.25,
    HP: 0.25,
    "DEF%": 0.25,
    DEF: 0.25,
    "Effect Hit Rate": 0.75,
    "Effect RES": 0.25,
    "ATK%": 0.5,
    ATK: 0.5,
    "CRIT Rate": 0,
    "CRIT DMG": 0,
    "Break Effect": 0,
  },
  sustain: {
    SPD: 1,
    "HP%": 0.75,
    HP: 0.75,
    "DEF%": 0.75,
    DEF: 0.75,
    "Effect RES": 0.5,
    "Effect Hit Rate": 0.25,
    "ATK%": 0,
    ATK: 0,
    "CRIT Rate": 0,
    "CRIT DMG": 0,
    "Break Effect": 0,
  },
};

export const WEIGHT_ROLE_LABELS: Record<WeightRole, string> = {
  critDps: "暴击主 C",
  hpScaler: "生命缩放",
  defScaler: "防御缩放",
  break: "击破",
  support: "进攻辅助",
  sustain: "生存辅助",
};

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

/** Infer a role template from effective substats when plan has no explicit weights. */
export function inferWeightsFromEffectiveSubstats(
  effectiveSubstats: string[],
): Record<string, number> {
  const set = new Set(effectiveSubstats);
  if (set.has("Break Effect") && !set.has("CRIT Rate") && !set.has("CRIT DMG"))
    return roleWeights("break");
  if (set.has("HP%") && !set.has("ATK%") && (set.has("CRIT Rate") || set.has("CRIT DMG")))
    return roleWeights("hpScaler");
  if (set.has("DEF%") && !set.has("ATK%")) return roleWeights("defScaler");
  if (
    set.has("Effect Hit Rate") ||
    (set.has("SPD") && !set.has("CRIT Rate") && !set.has("CRIT DMG"))
  )
    return roleWeights("support");
  if ((set.has("HP%") || set.has("DEF%")) && set.has("Effect RES")) return roleWeights("sustain");
  if (set.has("CRIT Rate") || set.has("CRIT DMG") || set.has("ATK%")) return roleWeights("critDps");
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
