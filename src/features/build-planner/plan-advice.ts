import { relicCatalogue } from "@/shared/catalogue";
import {
  relicMainStats,
  relicSubStats,
  selectableMainStatSlots,
  statLabel,
  targetStats,
} from "@/shared/catalogue/relic-options";
import {
  resolvePlanWeights,
  roleWeights,
  SUBSTAT_KEYS,
  WEIGHT_STEPS,
} from "@/shared/utils/relic-score";
import type { AdvicePlanDraft, BuildTarget, CharacterBuildPlan } from "@/types";

export const WEIGHT_STEP = 0.25;
export const MAX_WEIGHTED_SUBSTATS = 5;
export const MAX_EFFECTIVE_SUBSTATS = 5;
export const MAX_TARGETS = 3;
type MainStatSlot = (typeof selectableMainStatSlots)[number]["value"];
export const MAIN_STAT_SLOTS: MainStatSlot[] = selectableMainStatSlots.map((slot) => slot.value);

function isMainStatSlot(slot: string): slot is MainStatSlot {
  return (MAIN_STAT_SLOTS as string[]).includes(slot);
}

const STAT_ALIASES: Record<string, string> = {
  生命值: "HP",
  生命: "HP",
  生命百分比: "HP%",
  "生命%": "HP%",
  攻击力: "ATK",
  攻击: "ATK",
  攻击百分比: "ATK%",
  "攻击%": "ATK%",
  防御力: "DEF",
  防御: "DEF",
  防御百分比: "DEF%",
  "防御%": "DEF%",
  速度: "SPD",
  暴击率: "CRIT Rate",
  暴击: "CRIT Rate",
  暴伤: "CRIT DMG",
  暴击伤害: "CRIT DMG",
  效果命中: "Effect Hit Rate",
  命中: "Effect Hit Rate",
  效果抵抗: "Effect RES",
  抵抗: "Effect RES",
  击破特攻: "Break Effect",
  击破: "Break Effect",
  治疗量加成: "Outgoing Healing Boost",
  治疗: "Outgoing Healing Boost",
  能量恢复效率: "Energy Regeneration Rate",
  充能: "Energy Regeneration Rate",
  能量回复: "Energy Regeneration Rate",
  物理伤害提高: "Physical DMG Boost",
  物理伤害: "Physical DMG Boost",
  火属性伤害提高: "Fire DMG Boost",
  火伤: "Fire DMG Boost",
  冰属性伤害提高: "Ice DMG Boost",
  冰伤: "Ice DMG Boost",
  雷属性伤害提高: "Lightning DMG Boost",
  雷伤: "Lightning DMG Boost",
  风属性伤害提高: "Wind DMG Boost",
  风伤: "Wind DMG Boost",
  量子伤害提高: "Quantum DMG Boost",
  量子伤害: "Quantum DMG Boost",
  虚数伤害提高: "Imaginary DMG Boost",
  虚数伤害: "Imaginary DMG Boost",
};

const SLOT_ALIASES: Record<string, string> = {
  body: "Body",
  躯干: "Body",
  衣服: "Body",
  feet: "Feet",
  脚部: "Feet",
  鞋子: "Feet",
  sphere: "PlanarSphere",
  planarsphere: "PlanarSphere",
  位面球: "PlanarSphere",
  球: "PlanarSphere",
  rope: "LinkRope",
  linkrope: "LinkRope",
  连结绳: "LinkRope",
  绳子: "LinkRope",
};

export type AdviceChoice = "current" | "ai";

export interface AdviceCompareRow {
  key: string;
  group: "set" | "mainStat" | "targets" | "substats" | "weight" | "misc";
  label: string;
  currentLabel: string;
  aiLabel: string;
  equal: boolean;
  emptyCurrent: boolean;
}

export function snapWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const snapped = Math.round(value / WEIGHT_STEP) * WEIGHT_STEP;
  const clamped = Math.min(1, Math.max(0, snapped));
  return WEIGHT_STEPS.includes(clamped as (typeof WEIGHT_STEPS)[number])
    ? clamped
    : Math.round(clamped * 4) / 4;
}

export function setName(setId: number | null | undefined): string {
  if (!setId) return "未设置";
  return relicCatalogue.sets.find((set) => set.id === setId)?.name ?? `套装 #${setId}`;
}

export function resolveStatKey(raw: string, allowed: readonly string[]): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (allowed.includes(trimmed)) return trimmed;
  const aliased = STAT_ALIASES[trimmed] ?? STAT_ALIASES[trimmed.replaceAll(" ", "")];
  if (aliased && allowed.includes(aliased)) return aliased;
  const lower = trimmed.toLowerCase();
  return allowed.find((item) => item.toLowerCase() === lower) ?? null;
}

export function resolveSetId(
  raw: string | number | null | undefined,
  kind: "cavern" | "planar",
): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const exact = relicCatalogue.sets.find((set) => set.id === raw && set.kind === kind);
    return exact?.id ?? 0;
  }
  const text = String(raw ?? "").trim();
  if (!text) return 0;
  const asNumber = Number(text);
  if (Number.isInteger(asNumber) && asNumber > 0) {
    const exact = relicCatalogue.sets.find((set) => set.id === asNumber && set.kind === kind);
    if (exact) return exact.id;
  }
  const pool = relicCatalogue.sets.filter((set) => set.kind === kind);
  const exactName = pool.find((set) => set.name === text);
  if (exactName) return exactName.id;
  const contained = pool.filter((set) => set.name.includes(text) || text.includes(set.name));
  return contained.length === 1 ? contained[0].id : 0;
}

const DOT_CHARACTERS = new Set(["卡芙卡", "黑天鹅", "桑博", "桂乃芬", "卢卡"]);

export function clonePlan(plan: CharacterBuildPlan): CharacterBuildPlan {
  return {
    ...plan,
    mainStats: Object.fromEntries(
      Object.entries(plan.mainStats ?? {}).map(([slot, values]) => [slot, [...(values ?? [])]]),
    ),
    targets: (plan.targets ?? []).map((target) => ({ ...target })),
    effectiveSubstats: [...(plan.effectiveSubstats ?? [])],
    substatWeights: { ...resolvePlanWeights(plan) },
  };
}

function uniqueAllowed(values: string[], allowed: readonly string[], limit: number): string[] {
  const next: string[] = [];
  for (const value of values) {
    const key = resolveStatKey(value, allowed);
    if (!key || next.includes(key)) continue;
    next.push(key);
    if (next.length >= limit) break;
  }
  return next;
}

function sanitizeMainStats(raw: unknown): Record<string, string[]> {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const result: Record<string, string[]> = {};
  for (const slot of MAIN_STAT_SLOTS) {
    result[slot] = [];
  }
  for (const [rawSlot, rawStats] of Object.entries(source)) {
    const slot = SLOT_ALIASES[rawSlot.trim().toLowerCase()] ?? rawSlot;
    if (!isMainStatSlot(slot)) continue;
    const values = Array.isArray(rawStats)
      ? rawStats.map(String)
      : typeof rawStats === "string"
        ? [rawStats]
        : [];
    result[slot] = canonicalizeStats(
      slot,
      uniqueAllowed(values, relicMainStats[slot] ?? [], relicMainStats[slot]?.length ?? 0),
    );
  }
  return result;
}

function sanitizeTargets(raw: unknown): BuildTarget[] {
  if (!Array.isArray(raw)) return [];
  const targets: BuildTarget[] = [];
  for (const item of raw) {
    if (targets.length >= MAX_TARGETS) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const statKey = resolveStatKey(String(row.statKey ?? row.stat ?? ""), targetStats);
    if (!statKey) continue;
    const target = Math.max(0, Number(row.target) || 0);
    let minimum = Math.max(0, Number(row.minimum ?? row.min) || 0);
    if (minimum > target) minimum = target;
    targets.push({
      statKey,
      target,
      minimum,
      priority: targets.length + 1,
    });
  }
  return targets;
}

function canonicalizeStats(slot: string, values: string[]): string[] {
  const order = relicMainStats[slot] ?? relicSubStats;
  return order.filter((stat) => values.includes(stat));
}

function sanitizeWeights(raw: unknown): Record<string, number> {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const weights: Array<[string, number]> = [];
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = resolveStatKey(rawKey, SUBSTAT_KEYS);
    if (!key) continue;
    const value = snapWeight(Number(rawValue));
    if (value <= 0) continue;
    weights.push([key, value]);
  }
  weights.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return Object.fromEntries(weights.slice(0, MAX_WEIGHTED_SUBSTATS));
}

export function emptyAdvicePlan(): AdvicePlanDraft {
  return {
    cavernMode: "fourPiece",
    cavernSetA: 0,
    cavernSetB: null,
    planarSetId: 0,
    mainStats: Object.fromEntries(MAIN_STAT_SLOTS.map((slot) => [slot, []])),
    targets: [],
    effectiveSubstats: [],
    substatWeights: {},
    minPotentialPct: 40,
    spdTarget: 0,
    note: "",
  };
}

function positiveWeightEntries(weights: Record<string, number>): Array<[string, number]> {
  return Object.entries(weights)
    .filter(([, value]) => (value ?? 0) > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function alignEffectiveSubstats(plan: AdvicePlanDraft) {
  const fromWeights = positiveWeightEntries(plan.substatWeights)
    .map(([key]) => key)
    .filter((key) => relicSubStats.includes(key))
    .slice(0, MAX_EFFECTIVE_SUBSTATS);
  plan.effectiveSubstats = fromWeights.length
    ? fromWeights
    : uniqueAllowed(plan.effectiveSubstats, relicSubStats, MAX_EFFECTIVE_SUBSTATS);
}

function isDotCharacter(name?: string) {
  return !!name && DOT_CHARACTERS.has(name);
}

function needsDotCorrection(plan: AdvicePlanDraft) {
  const crit = (plan.substatWeights["CRIT Rate"] ?? 0) + (plan.substatWeights["CRIT DMG"] ?? 0);
  const brk = plan.substatWeights["Break Effect"] ?? 0;
  const ehr = plan.substatWeights["Effect Hit Rate"] ?? 0;
  const atkPct = plan.substatWeights["ATK%"] ?? 0;
  const effective = plan.effectiveSubstats;
  const effectiveOffRole = effective.some(
    (stat) => stat === "CRIT Rate" || stat === "CRIT DMG" || stat === "Break Effect",
  );
  return crit > 0 || brk > 0 || effectiveOffRole || (ehr <= 0 && atkPct <= 0);
}

export function sanitizeAdvicePlan(
  raw: unknown,
  context?: { name?: string; path?: string },
): AdvicePlanDraft {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const cavernMode = source.cavernMode === "twoPlusTwo" ? "twoPlusTwo" : "fourPiece";
  const cavernSetA = resolveSetId(
    (source.cavernSetA ?? source.cavernSet ?? source.cavern) as string | number,
    "cavern",
  );
  let cavernSetB =
    cavernMode === "twoPlusTwo"
      ? resolveSetId((source.cavernSetB ?? "") as string | number, "cavern")
      : null;
  if (cavernMode === "twoPlusTwo" && (cavernSetB === 0 || cavernSetB === cavernSetA)) {
    cavernSetB = null;
  }
  const planarSetId = resolveSetId(
    (source.planarSetId ?? source.planar) as string | number,
    "planar",
  );
  const minPotentialPct = Math.min(
    100,
    Math.max(0, Math.round((Number(source.minPotentialPct) || 40) / 5) * 5),
  );
  const spdTarget = Math.max(0, Math.round(Number(source.spdTarget) || 0));
  const note = typeof source.note === "string" ? source.note.trim().slice(0, 500) : "";
  const plan: AdvicePlanDraft = {
    cavernMode: cavernMode === "twoPlusTwo" && cavernSetB ? "twoPlusTwo" : "fourPiece",
    cavernSetA,
    cavernSetB: cavernMode === "twoPlusTwo" && cavernSetB ? cavernSetB : null,
    planarSetId,
    mainStats: sanitizeMainStats(source.mainStats),
    targets: sanitizeTargets(source.targets),
    effectiveSubstats: uniqueAllowed(
      Array.isArray(source.effectiveSubstats) ? source.effectiveSubstats.map(String) : [],
      relicSubStats,
      MAX_EFFECTIVE_SUBSTATS,
    ),
    substatWeights: sanitizeWeights(source.substatWeights),
    minPotentialPct,
    spdTarget,
    note,
  };
  if (isDotCharacter(context?.name) && needsDotCorrection(plan)) {
    plan.substatWeights = Object.fromEntries(
      Object.entries(roleWeights("dot")).filter(([, value]) => value > 0),
    );
  }
  alignEffectiveSubstats(plan);
  return plan;
}

function listLabel(values: string[], order: readonly string[] = relicSubStats): string {
  const canonical = order.filter((item) => values.includes(item));
  return canonical.length ? canonical.map((item) => statLabel(item)).join("、") : "未设置";
}

function targetsLabel(targets: BuildTarget[]): string {
  if (!targets.length) return "未设置";
  return targets
    .map(
      (target, index) =>
        `P${index + 1} ${statLabel(target.statKey)} ${target.target} / 最低 ${target.minimum}`,
    )
    .join("；");
}

function weightLabel(value: number | undefined): string {
  if (value == null || value <= 0) return "未设置";
  return String(value);
}

function sameUnorderedList(left: string[] | undefined, right: string[] | undefined): boolean {
  const a = [...new Set(left ?? [])];
  const b = [...new Set(right ?? [])];
  if (a.length !== b.length) return false;
  const other = new Set(b);
  return a.every((item) => other.has(item));
}

function sameTargets(left: BuildTarget[], right: BuildTarget[]): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (item, index) =>
      item.statKey === right[index].statKey &&
      item.target === right[index].target &&
      item.minimum === right[index].minimum,
  );
}

function isEmptySet(id: number | null | undefined): boolean {
  return !id;
}

export function buildAdviceCompareRows(
  current: CharacterBuildPlan,
  recommended: AdvicePlanDraft,
): AdviceCompareRow[] {
  const rows: AdviceCompareRow[] = [
    {
      key: "cavernMode",
      group: "set",
      label: "四件遗器区模式",
      currentLabel: current.cavernMode === "twoPlusTwo" ? "2+2 件套" : "4 件套",
      aiLabel: recommended.cavernMode === "twoPlusTwo" ? "2+2 件套" : "4 件套",
      equal: current.cavernMode === recommended.cavernMode,
      emptyCurrent: false,
    },
    {
      key: "cavernSetA",
      group: "set",
      label:
        current.cavernMode === "twoPlusTwo" || recommended.cavernMode === "twoPlusTwo"
          ? "第一组 2 件套"
          : "四件套",
      currentLabel: setName(current.cavernSetA),
      aiLabel: setName(recommended.cavernSetA),
      equal: current.cavernSetA === recommended.cavernSetA,
      emptyCurrent: isEmptySet(current.cavernSetA),
    },
  ];
  if (current.cavernMode === "twoPlusTwo" || recommended.cavernMode === "twoPlusTwo") {
    rows.push({
      key: "cavernSetB",
      group: "set",
      label: "第二组 2 件套",
      currentLabel: setName(current.cavernSetB),
      aiLabel: setName(recommended.cavernSetB),
      equal: (current.cavernSetB ?? 0) === (recommended.cavernSetB ?? 0),
      emptyCurrent: isEmptySet(current.cavernSetB),
    });
  }
  rows.push({
    key: "planarSetId",
    group: "set",
    label: "位面饰品",
    currentLabel: setName(current.planarSetId),
    aiLabel: setName(recommended.planarSetId),
    equal: current.planarSetId === recommended.planarSetId,
    emptyCurrent: isEmptySet(current.planarSetId),
  });
  for (const slot of selectableMainStatSlots) {
    const currentStats = current.mainStats[slot.value] ?? [];
    const aiStats = recommended.mainStats[slot.value] ?? [];
    const order = relicMainStats[slot.value] ?? [];
    rows.push({
      key: `mainStats.${slot.value}`,
      group: "mainStat",
      label: `${slot.label}主词条`,
      currentLabel: listLabel(currentStats, order),
      aiLabel: listLabel(aiStats, order),
      equal: sameUnorderedList(currentStats, aiStats),
      emptyCurrent: currentStats.length === 0,
    });
  }
  rows.push({
    key: "targets",
    group: "targets",
    label: "属性目标",
    currentLabel: targetsLabel(current.targets),
    aiLabel: targetsLabel(recommended.targets),
    equal: sameTargets(current.targets, recommended.targets),
    emptyCurrent: current.targets.length === 0,
  });
  rows.push({
    key: "effectiveSubstats",
    group: "substats",
    label: "有效副词条",
    currentLabel: listLabel(current.effectiveSubstats),
    aiLabel: listLabel(recommended.effectiveSubstats),
    equal: sameUnorderedList(current.effectiveSubstats, recommended.effectiveSubstats),
    emptyCurrent: current.effectiveSubstats.length === 0,
  });
  const currentWeights = resolvePlanWeights(current);
  const weightKeys = SUBSTAT_KEYS.filter(
    (key) => (currentWeights[key] ?? 0) > 0 || (recommended.substatWeights[key] ?? 0) > 0,
  );
  for (const key of weightKeys) {
    const currentValue = currentWeights[key] ?? 0;
    const aiValue = recommended.substatWeights[key] ?? 0;
    rows.push({
      key: `weight.${key}`,
      group: "weight",
      label: `${statLabel(key)}权重`,
      currentLabel: weightLabel(currentValue),
      aiLabel: weightLabel(aiValue),
      equal: currentValue === aiValue,
      emptyCurrent: currentValue <= 0,
    });
  }
  rows.push(
    {
      key: "minPotentialPct",
      group: "misc",
      label: "质量门槛",
      currentLabel: `${current.minPotentialPct}%`,
      aiLabel: `${recommended.minPotentialPct}%`,
      equal: current.minPotentialPct === recommended.minPotentialPct,
      emptyCurrent: false,
    },
    {
      key: "spdTarget",
      group: "misc",
      label: "速度断点",
      currentLabel: current.spdTarget > 0 ? String(current.spdTarget) : "未设置",
      aiLabel: recommended.spdTarget > 0 ? String(recommended.spdTarget) : "未设置",
      equal: current.spdTarget === recommended.spdTarget,
      emptyCurrent: current.spdTarget <= 0,
    },
  );
  return rows;
}

export function defaultAdviceSelections(rows: AdviceCompareRow[]): Record<string, AdviceChoice> {
  const selections: Record<string, AdviceChoice> = {};
  for (const row of rows) {
    if (row.equal) continue;
    selections[row.key] = row.emptyCurrent ? "ai" : "current";
  }
  return selections;
}

export function applyAdviceSelections(
  current: CharacterBuildPlan,
  recommended: AdvicePlanDraft,
  selections: Record<string, AdviceChoice>,
): CharacterBuildPlan {
  const choose = <T>(key: string, currentValue: T, aiValue: T): T =>
    selections[key] === "ai" ? aiValue : currentValue;

  const cavernMode = choose("cavernMode", current.cavernMode, recommended.cavernMode);
  const next: CharacterBuildPlan = {
    ...current,
    cavernMode,
    cavernSetA: choose("cavernSetA", current.cavernSetA, recommended.cavernSetA),
    cavernSetB:
      cavernMode === "twoPlusTwo"
        ? choose("cavernSetB", current.cavernSetB, recommended.cavernSetB)
        : null,
    planarSetId: choose("planarSetId", current.planarSetId, recommended.planarSetId),
    mainStats: { ...current.mainStats },
    targets: choose("targets", current.targets, recommended.targets).map((target, index) => ({
      ...target,
      priority: index + 1,
    })),
    effectiveSubstats: choose(
      "effectiveSubstats",
      current.effectiveSubstats,
      recommended.effectiveSubstats,
    ),
    substatWeights: { ...current.substatWeights },
    minPotentialPct: choose(
      "minPotentialPct",
      current.minPotentialPct,
      recommended.minPotentialPct,
    ),
    spdTarget: choose("spdTarget", current.spdTarget, recommended.spdTarget),
  };
  for (const slot of MAIN_STAT_SLOTS) {
    next.mainStats[slot] = canonicalizeStats(
      slot,
      choose(`mainStats.${slot}`, current.mainStats[slot] ?? [], recommended.mainStats[slot] ?? []),
    );
  }
  const weightKeys = new Set([
    ...Object.keys(current.substatWeights),
    ...Object.keys(recommended.substatWeights),
  ]);
  for (const key of weightKeys) {
    const selected = selections[`weight.${key}`];
    if (selected === "ai") next.substatWeights[key] = recommended.substatWeights[key] ?? 0;
    else if (selected === "current") next.substatWeights[key] = current.substatWeights[key] ?? 0;
  }
  const positiveWeights = Object.entries(next.substatWeights)
    .filter(([, value]) => (value ?? 0) > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, MAX_WEIGHTED_SUBSTATS);
  next.substatWeights = Object.fromEntries(positiveWeights);
  if (next.cavernMode === "fourPiece") next.cavernSetB = null;
  return next;
}

export function applyAdviceField(
  plan: CharacterBuildPlan,
  source: AdvicePlanDraft | CharacterBuildPlan,
  key: string,
): void {
  if (key === "cavernMode") {
    plan.cavernMode = source.cavernMode;
    if (plan.cavernMode === "fourPiece") plan.cavernSetB = null;
    else if (!plan.cavernSetB) plan.cavernSetB = source.cavernSetB ?? null;
    return;
  }
  if (key === "cavernSetA") {
    plan.cavernSetA = source.cavernSetA;
    return;
  }
  if (key === "cavernSetB") {
    plan.cavernSetB = source.cavernSetB ?? null;
    return;
  }
  if (key === "planarSetId") {
    plan.planarSetId = source.planarSetId;
    return;
  }
  if (key === "targets") {
    plan.targets = source.targets.map((target, index) => ({ ...target, priority: index + 1 }));
    return;
  }
  if (key === "effectiveSubstats") {
    plan.effectiveSubstats = [...source.effectiveSubstats];
    return;
  }
  if (key === "minPotentialPct") {
    plan.minPotentialPct = source.minPotentialPct;
    return;
  }
  if (key === "spdTarget") {
    plan.spdTarget = source.spdTarget;
    return;
  }
  if (key.startsWith("mainStats.")) {
    const slot = key.slice("mainStats.".length);
    plan.mainStats[slot] = canonicalizeStats(slot, source.mainStats[slot] ?? []);
    return;
  }
  if (key.startsWith("weight.")) {
    const stat = key.slice("weight.".length);
    const next = { ...resolvePlanWeights(plan) };
    const value = source.substatWeights[stat] ?? 0;
    if (value <= 0) delete next[stat];
    else next[stat] = value;
    plan.substatWeights = Object.fromEntries(
      positiveWeightEntries(next).slice(0, MAX_WEIGHTED_SUBSTATS),
    );
  }
}
