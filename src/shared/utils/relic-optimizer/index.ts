import type {
  CharacterBuildPlan,
  OptimizedRelicBuild,
  OptimizedRelicChoice,
  RelicOptimizerContext,
  RelicOptimizerOptions,
  RelicOptimizerResult,
  RelicOptimizerSearchResult,
  RelicOptimizerStandingStat,
  RelicOptimizerTargetProgress,
  RelicSetCatalogueEntry,
} from "@/types";
import { isMainStatAllowed, resolvePlanWeights, scoreRelic } from "@/shared/utils/relic-score";
import {
  calculateStandingStats,
  type StandingStatsInput,
  type StaticStatValue,
} from "@/shared/utils/standing-stats";

export const RELIC_OPTIMIZER_SLOTS = [
  "Head",
  "Hands",
  "Body",
  "Feet",
  "PlanarSphere",
  "LinkRope",
] as const;

const CAVERN_SLOTS = new Set<string>(["Head", "Hands", "Body", "Feet"]);
const EXACT_COMBINATION_LIMIT = 2_000_000;
const CANDIDATE_LIMIT_PER_SLOT = 120;
const BEAM_WIDTH = 20_000;
const EPSILON = 1e-7;

export interface RelicOptimizerRunInput {
  context: RelicOptimizerContext;
  plan: CharacterBuildPlan;
  options: RelicOptimizerOptions;
  characterBase: StandingStatsInput["characterBase"];
  lightConeBase: StandingStatsInput["lightConeBase"];
  traces: StaticStatValue[];
  lightConeEffects: string[];
  sets: RelicSetCatalogueEntry[];
}

type ScoredRelic = {
  relic: RelicOptimizerContext["relics"][number];
  weightedRolls: number;
  potentialPct: number;
  targetContributions: number[];
  dominanceContributions: number[];
};

type PartialBuild = {
  selected: ScoredRelic[];
  weightedRolls: number;
  targetContributions: number[];
  coverage: number;
  key: string;
};

const standingKeyByBuildKey: Record<string, string> = {
  HP: "hp",
  ATK: "attack",
  DEF: "defense",
  SPD: "speed",
  "CRIT Rate": "critRate",
  "CRIT DMG": "critDmg",
  "Effect Hit Rate": "effectHitRate",
  "Effect RES": "effectRes",
  "Break Effect": "breakEffect",
  "Outgoing Healing Boost": "healingBoost",
  "Energy Regeneration Rate": "energyRegen",
  "Physical DMG Boost": "physicalDmg",
  "Fire DMG Boost": "fireDmg",
  "Ice DMG Boost": "iceDmg",
  "Lightning DMG Boost": "lightningDmg",
  "Wind DMG Boost": "windDmg",
  "Quantum DMG Boost": "quantumDmg",
  "Imaginary DMG Boost": "imaginaryDmg",
};

// Pareto pruning must retain every primitive stat that can influence the final
// standing projection. In particular, some passive effects convert Effect Hit
// Rate into ATK, so comparing only direct hard-target contributions is unsafe.
const DOMINANCE_STAT_KEYS = [
  "HP",
  "HP%",
  "ATK",
  "ATK%",
  "DEF",
  "DEF%",
  "SPD",
  "SPD%",
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
] as const;

function statTotals(relic: ScoredRelic["relic"]): Map<string, number> {
  const totals = new Map<string, number>();
  totals.set(relic.mainStat, relic.mainStatValue);
  for (const stat of relic.substats) {
    if (stat.kind === "normal") totals.set(stat.key, (totals.get(stat.key) ?? 0) + stat.value);
  }
  return totals;
}

function targetContribution(
  input: RelicOptimizerRunInput,
  relic: ScoredRelic["relic"],
  key: string,
) {
  const totals = statTotals(relic);
  const baseHp = input.characterBase.hp + input.lightConeBase.hp;
  const baseAttack = input.characterBase.attack + input.lightConeBase.attack;
  const baseDefense = input.characterBase.defense + input.lightConeBase.defense;
  if (key === "HP") return (totals.get("HP") ?? 0) + (baseHp * (totals.get("HP%") ?? 0)) / 100;
  if (key === "ATK")
    return (totals.get("ATK") ?? 0) + (baseAttack * (totals.get("ATK%") ?? 0)) / 100;
  if (key === "DEF")
    return (totals.get("DEF") ?? 0) + (baseDefense * (totals.get("DEF%") ?? 0)) / 100;
  if (key === "SPD")
    return (totals.get("SPD") ?? 0) + (input.characterBase.speed * (totals.get("SPD%") ?? 0)) / 100;
  return totals.get(key) ?? 0;
}

function activeSetData(relics: ScoredRelic["relic"][], sets: RelicSetCatalogueEntry[]) {
  const counts = new Map<number, number>();
  for (const relic of relics) counts.set(relic.setId, (counts.get(relic.setId) ?? 0) + 1);
  const effects: string[] = [];
  const activeSets: OptimizedRelicBuild["activeSets"] = [];
  for (const set of sets) {
    const pieces = counts.get(set.id) ?? 0;
    if (pieces < 2) continue;
    activeSets.push({ setId: set.id, name: set.name, pieces });
    if (set.effects.twoPiece) effects.push(set.effects.twoPiece);
    if (set.kind === "cavern" && pieces >= 4 && set.effects.fourPiece)
      effects.push(set.effects.fourPiece);
  }
  return { effects, activeSets };
}

function targetProgress(
  plan: CharacterBuildPlan,
  stats: RelicOptimizerStandingStat[],
): RelicOptimizerTargetProgress[] {
  const values = new Map(stats.map((stat) => [stat.key, stat.value]));
  return [...plan.targets]
    .sort((left, right) => left.priority - right.priority)
    .map((target) => {
      const current = values.get(standingKeyByBuildKey[target.statKey]) ?? null;
      const gap = current === null ? null : Math.max(0, target.target - current);
      return {
        ...target,
        current,
        gap,
        satisfied: target.minimum <= 0 || (current !== null && current + EPSILON >= target.minimum),
      };
    });
}

function evaluateBuild(
  input: RelicOptimizerRunInput,
  selected: ScoredRelic[],
): OptimizedRelicBuild {
  const relics = selected.map((item) => item.relic);
  const { effects, activeSets } = activeSetData(relics, input.sets);
  const standingStats = calculateStandingStats({
    characterBase: input.characterBase,
    lightConeBase: input.lightConeBase,
    relics,
    traces: input.traces,
    setEffects: effects,
    lightConeEffects: input.lightConeEffects,
  });
  const currentBySlot = new Map(
    input.context.relics
      .filter((relic) => relic.equippedCharacterId === input.context.character.characterId)
      .map((relic) => [relic.slot, relic.itemId]),
  );
  const choices: OptimizedRelicChoice[] = relics
    .map((relic) => ({
      ...relic,
      borrowed:
        relic.equippedCharacterId !== null &&
        relic.equippedCharacterId !== input.context.character.characterId,
      unfinished: relic.rarity < 5 || relic.level < 15,
      changed: currentBySlot.get(relic.slot) !== relic.itemId,
    }))
    .sort(
      (left, right) =>
        RELIC_OPTIMIZER_SLOTS.indexOf(left.slot as (typeof RELIC_OPTIMIZER_SLOTS)[number]) -
        RELIC_OPTIMIZER_SLOTS.indexOf(right.slot as (typeof RELIC_OPTIMIZER_SLOTS)[number]),
    );
  return {
    relics: choices,
    weightedRolls: selected.reduce((sum, item) => sum + item.weightedRolls, 0),
    averagePotentialPct:
      selected.reduce((sum, item) => sum + item.potentialPct, 0) / Math.max(selected.length, 1),
    standingStats,
    targetProgress: targetProgress(input.plan, standingStats),
    activeSets,
    borrowedCount: choices.filter((item) => item.borrowed).length,
    unfinishedCount: choices.filter((item) => item.unfinished).length,
    discardedCount: choices.filter((item) => item.discard).length,
    changedCount: choices.filter((item) => item.changed).length,
  };
}

function buildComparator(left: OptimizedRelicBuild, right: OptimizedRelicBuild): number {
  return (
    right.weightedRolls - left.weightedRolls ||
    left.borrowedCount - right.borrowedCount ||
    left.unfinishedCount - right.unfinishedCount ||
    left.discardedCount - right.discardedCount ||
    left.changedCount - right.changedCount ||
    left.relics
      .map((item) => item.itemId)
      .join(",")
      .localeCompare(right.relics.map((item) => item.itemId).join(","))
  );
}

function deficitScore(build: OptimizedRelicBuild) {
  return build.targetProgress.reduce((sum, target) => {
    if (target.minimum <= 0) return sum;
    if (target.current === null) return sum + 1;
    return sum + Math.max(0, target.minimum - target.current) / Math.max(target.minimum, 1);
  }, 0);
}

function strictSetAllowed(plan: CharacterBuildPlan, relic: ScoredRelic["relic"]) {
  if (!CAVERN_SLOTS.has(relic.slot)) return relic.setId === plan.planarSetId;
  if (plan.cavernMode === "fourPiece") return relic.setId === plan.cavernSetA;
  return relic.setId === plan.cavernSetA || relic.setId === plan.cavernSetB;
}

function strictPartialAllowed(plan: CharacterBuildPlan, selected: ScoredRelic[]) {
  if (plan.cavernMode !== "twoPlusTwo") return true;
  let setA = 0;
  let setB = 0;
  for (const item of selected) {
    if (!CAVERN_SLOTS.has(item.relic.slot)) continue;
    if (item.relic.setId === plan.cavernSetA) setA += 1;
    if (item.relic.setId === plan.cavernSetB) setB += 1;
  }
  return setA <= 2 && setB <= 2;
}

function groupKey(input: RelicOptimizerRunInput, item: ScoredRelic) {
  const owner = item.relic.equippedCharacterId;
  return [
    item.relic.setId,
    owner !== null && owner !== input.context.character.characterId ? "borrowed" : "free",
    item.relic.level < 15 ? "unfinished" : "finished",
    item.relic.discard ? "discard" : "keep",
    owner === input.context.character.characterId ? "current" : "candidate",
  ].join(":");
}

function paretoPrune(input: RelicOptimizerRunInput, items: ScoredRelic[]) {
  const groups = new Map<string, ScoredRelic[]>();
  for (const item of items) {
    const key = groupKey(input, item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const output: ScoredRelic[] = [];
  for (const group of groups.values()) {
    let remaining = [...group];
    // A single Pareto frontier is sufficient for Top 1, but would erase the
    // dominated alternatives needed to produce distinct Top 2–5 builds.
    for (let layer = 0; layer < 5 && remaining.length > 0; layer += 1) {
      const frontier = remaining.filter(
        (candidate) =>
          !remaining.some((other) => {
            if (other === candidate || other.weightedRolls + EPSILON < candidate.weightedRolls)
              return false;
            const allStats = other.dominanceContributions.every(
              (value, index) => value + EPSILON >= candidate.dominanceContributions[index],
            );
            const strictlyBetter =
              other.weightedRolls > candidate.weightedRolls + EPSILON ||
              other.dominanceContributions.some(
                (value, index) => value > candidate.dominanceContributions[index] + EPSILON,
              );
            return allStats && strictlyBetter;
          }),
      );
      output.push(...frontier);
      const frontierIds = new Set(frontier.map((item) => item.relic.itemId));
      remaining = remaining.filter((item) => !frontierIds.has(item.relic.itemId));
    }
  }
  return output;
}

function shortlist(input: RelicOptimizerRunInput, items: ScoredRelic[]) {
  if (items.length <= CANDIDATE_LIMIT_PER_SLOT) return items;
  const selected = new Map<number, ScoredRelic>();
  const ranked = [...items].sort(
    (left, right) =>
      right.weightedRolls - left.weightedRolls || left.relic.itemId - right.relic.itemId,
  );
  const add = (item: ScoredRelic) => selected.set(item.relic.itemId, item);
  ranked
    .filter((item) => item.relic.equippedCharacterId === input.context.character.characterId)
    .forEach(add);
  const bestBySet = new Map<number, ScoredRelic>();
  for (const item of ranked)
    if (!bestBySet.has(item.relic.setId)) bestBySet.set(item.relic.setId, item);
  [...bestBySet.values()].forEach(add);
  ranked.slice(0, 40).forEach(add);
  for (let target = 0; target < input.plan.targets.length; target += 1) {
    [...items]
      .sort(
        (left, right) =>
          right.targetContributions[target] - left.targetContributions[target] ||
          right.weightedRolls - left.weightedRolls ||
          left.relic.itemId - right.relic.itemId,
      )
      .slice(0, 12)
      .forEach(add);
  }
  for (const item of ranked) {
    if (selected.size >= CANDIDATE_LIMIT_PER_SLOT) break;
    add(item);
  }
  return [...selected.values()].slice(0, CANDIDATE_LIMIT_PER_SLOT);
}

function beamCoverage(input: RelicOptimizerRunInput, contributions: number[]) {
  return input.plan.targets.reduce((sum, target, index) => {
    if (target.minimum <= 0) return sum;
    return sum + Math.min(1, contributions[index] / Math.max(target.minimum, 1));
  }, 0);
}

type PartialComparator = (left: PartialBuild, right: PartialBuild) => number;

/** Fixed-capacity heap whose root is the worst retained state. */
class LimitedStateHeap {
  private readonly items: PartialBuild[] = [];

  constructor(
    private readonly limit: number,
    private readonly compare: PartialComparator,
  ) {}

  add(state: PartialBuild) {
    if (this.items.length < this.limit) {
      this.items.push(state);
      this.bubbleUp(this.items.length - 1);
      return;
    }
    if (this.compare(state, this.items[0]) >= 0) return;
    this.items[0] = state;
    this.siftDown(0);
  }

  values() {
    return [...this.items].sort(this.compare);
  }

  private bubbleUp(start: number) {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.items[parent], this.items[index]) >= 0) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  private siftDown(start: number) {
    let index = start;
    while (true) {
      const left = index * 2 + 1;
      if (left >= this.items.length) return;
      const right = left + 1;
      let worse = left;
      if (right < this.items.length && this.compare(this.items[left], this.items[right]) < 0)
        worse = right;
      if (this.compare(this.items[index], this.items[worse]) >= 0) return;
      [this.items[index], this.items[worse]] = [this.items[worse], this.items[index]];
      index = worse;
    }
  }
}

function comparePartialByScore(left: PartialBuild, right: PartialBuild) {
  return (
    right.weightedRolls - left.weightedRolls || selectedKey(left).localeCompare(selectedKey(right))
  );
}

function comparePartialByCoverage(): PartialComparator {
  return (left, right) => right.coverage - left.coverage || comparePartialByScore(left, right);
}

function expandBoundedBeam(
  input: RelicOptimizerRunInput,
  beam: PartialBuild[],
  pool: ScoredRelic[],
  strict: boolean,
) {
  const byScore = new LimitedStateHeap(BEAM_WIDTH, comparePartialByScore);
  const byCoverage = new LimitedStateHeap(BEAM_WIDTH / 2, comparePartialByCoverage());
  let considered = 0;
  for (const state of beam) {
    for (const item of pool) {
      const targetContributions = state.targetContributions.map(
        (value, target) => value + item.targetContributions[target],
      );
      const candidate: PartialBuild = {
        selected: [...state.selected, item],
        weightedRolls: state.weightedRolls + item.weightedRolls,
        targetContributions,
        coverage: beamCoverage(input, targetContributions),
        key: state.key ? `${state.key},${item.relic.itemId}` : String(item.relic.itemId),
      };
      if (strict && !strictPartialAllowed(input.plan, candidate.selected)) continue;
      considered += 1;
      byScore.add(candidate);
      byCoverage.add(candidate);
    }
  }
  const output = new Map<string, PartialBuild>();
  const scoreStates = byScore.values();
  for (const state of scoreStates.slice(0, BEAM_WIDTH / 2)) output.set(selectedKey(state), state);
  for (const state of byCoverage.values()) output.set(selectedKey(state), state);
  for (const state of scoreStates) {
    if (output.size >= BEAM_WIDTH) break;
    output.set(selectedKey(state), state);
  }
  return { states: [...output.values()], considered };
}

function selectedKey(build: PartialBuild) {
  return build.key;
}

function topFiveAndNearest(input: RelicOptimizerRunInput, states: PartialBuild[]) {
  const feasible: OptimizedRelicBuild[] = [];
  let nearest: OptimizedRelicBuild | null = null;
  for (const state of states) {
    const build = evaluateBuild(input, state.selected);
    if (build.targetProgress.every((target) => target.satisfied)) feasible.push(build);
    else if (
      !nearest ||
      deficitScore(build) < deficitScore(nearest) - EPSILON ||
      (Math.abs(deficitScore(build) - deficitScore(nearest)) <= EPSILON &&
        buildComparator(build, nearest) < 0)
    )
      nearest = build;
  }
  feasible.sort(buildComparator);
  const unique = new Map<string, OptimizedRelicBuild>();
  for (const build of feasible) {
    const key = build.relics.map((item) => item.itemId).join(",");
    if (!unique.has(key)) unique.set(key, build);
    if (unique.size >= 5) break;
  }
  return { builds: [...unique.values()], nearest };
}

function search(
  input: RelicOptimizerRunInput,
  all: ScoredRelic[],
  strict: boolean,
): RelicOptimizerSearchResult {
  const startedAt = performance.now();
  const originalCandidates = all.length;
  const pools = RELIC_OPTIMIZER_SLOTS.map((slot) => {
    const items = all.filter(
      (item) => item.relic.slot === slot && (!strict || strictSetAllowed(input.plan, item.relic)),
    );
    return paretoPrune(input, items);
  });
  if (pools.some((pool) => pool.length === 0)) {
    return {
      builds: [],
      nearest: null,
      diagnostics: {
        searchMode: "exact",
        originalCandidates,
        retainedCandidates: pools.reduce((sum, pool) => sum + pool.length, 0),
        evaluatedBuilds: 0,
        durationMs: Math.round(performance.now() - startedAt),
        truncated: false,
      },
    };
  }
  const combinations = pools.reduce((product, pool) => product * pool.length, 1);
  const exact = combinations <= EXACT_COMBINATION_LIMIT;
  const retainedPools = exact ? pools : pools.map((pool) => shortlist(input, pool));
  let evaluatedBuilds = 0;
  let finals: PartialBuild[] = [];
  let exactBuilds: OptimizedRelicBuild[] = [];
  let exactNearest: OptimizedRelicBuild | null = null;

  const considerExact = (state: PartialBuild) => {
    const build = evaluateBuild(input, state.selected);
    if (build.targetProgress.every((target) => target.satisfied)) {
      exactBuilds.push(build);
      exactBuilds.sort(buildComparator);
      exactBuilds = exactBuilds.slice(0, 5);
      return;
    }
    if (
      !exactNearest ||
      deficitScore(build) < deficitScore(exactNearest) - EPSILON ||
      (Math.abs(deficitScore(build) - deficitScore(exactNearest)) <= EPSILON &&
        buildComparator(build, exactNearest) < 0)
    )
      exactNearest = build;
  };

  if (exact) {
    const visit = (index: number, state: PartialBuild) => {
      if (index === retainedPools.length) {
        evaluatedBuilds += 1;
        considerExact(state);
        return;
      }
      for (const item of retainedPools[index]) {
        const next: PartialBuild = {
          selected: [...state.selected, item],
          weightedRolls: state.weightedRolls + item.weightedRolls,
          targetContributions: state.targetContributions.map(
            (value, target) => value + item.targetContributions[target],
          ),
          coverage: 0,
          key: state.key ? `${state.key},${item.relic.itemId}` : String(item.relic.itemId),
        };
        if (strict && !strictPartialAllowed(input.plan, next.selected)) continue;
        visit(index + 1, next);
      }
    };
    visit(0, {
      selected: [],
      weightedRolls: 0,
      targetContributions: input.plan.targets.map(() => 0),
      coverage: 0,
      key: "",
    });
  } else {
    const orderedPools = [...retainedPools].sort(
      (left, right) =>
        left.length - right.length || left[0].relic.slot.localeCompare(right[0].relic.slot),
    );
    let beam: PartialBuild[] = [
      {
        selected: [],
        weightedRolls: 0,
        targetContributions: input.plan.targets.map(() => 0),
        coverage: 0,
        key: "",
      },
    ];
    for (const pool of orderedPools) {
      const expanded = expandBoundedBeam(input, beam, pool, strict);
      beam = expanded.states;
      evaluatedBuilds = expanded.considered;
    }
    finals = beam;
  }

  const output = exact
    ? { builds: exactBuilds, nearest: exactNearest }
    : topFiveAndNearest(input, finals);
  return {
    ...output,
    diagnostics: {
      searchMode: exact ? "exact" : "bounded",
      originalCandidates,
      retainedCandidates: retainedPools.reduce((sum, pool) => sum + pool.length, 0),
      evaluatedBuilds,
      durationMs: Math.round(performance.now() - startedAt),
      truncated: !exact,
    },
  };
}

export function optimizeRelics(input: RelicOptimizerRunInput): RelicOptimizerResult {
  const weights = resolvePlanWeights(input.plan);
  if (!Object.values(weights).some((weight) => weight > 0))
    throw new Error("请先配置词条权重或至少一个有效副词条。");

  const currentCharacterId = input.context.character.characterId;
  const hardTargets = input.plan.targets;
  const scoreItem = (relic: RelicOptimizerContext["relics"][number]): ScoredRelic => {
    const score = scoreRelic(relic, weights, { allowedMainStats: input.plan.mainStats });
    const totals = statTotals(relic);
    return {
      relic,
      weightedRolls: score.weightedRolls,
      potentialPct: score.potentialPct,
      targetContributions: hardTargets.map((target) =>
        targetContribution(input, relic, target.statKey),
      ),
      dominanceContributions: DOMINANCE_STAT_KEYS.map((key) => totals.get(key) ?? 0),
    };
  };
  const scored = input.context.relics
    .filter((relic) => {
      const current = relic.equippedCharacterId === currentCharacterId;
      if (relic.rarity !== 5 && !current) return false;
      if (!input.options.includeUnfinished && relic.level < 15 && !current) return false;
      if (!input.options.includeDiscarded && relic.discard && !current) return false;
      if (!input.options.includeEquipped && relic.equippedCharacterId !== null && !current)
        return false;
      return isMainStatAllowed(relic.slot, relic.mainStat, input.plan.mainStats) !== false;
    })
    .map(scoreItem);

  // The baseline must represent what is actually equipped even when the user is
  // previewing stricter main-stat rules that exclude one of those pieces.
  const currentItems = input.context.relics
    .filter((relic) => relic.equippedCharacterId === currentCharacterId)
    .map(scoreItem);
  const current = RELIC_OPTIMIZER_SLOTS.every((slot) =>
    currentItems.some((item) => item.relic.slot === slot),
  )
    ? evaluateBuild(
        input,
        RELIC_OPTIMIZER_SLOTS.map((slot) => currentItems.find((item) => item.relic.slot === slot)!),
      )
    : null;

  return {
    current,
    strict: search(input, scored, true),
    relaxed: input.options.includeRelaxed ? search(input, scored, false) : null,
  };
}
