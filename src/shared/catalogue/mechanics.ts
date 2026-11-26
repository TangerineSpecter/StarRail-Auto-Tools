import mechanicsJson from "@/data/catalogue-mechanics.json";
import rulesJson from "@/data/catalogue-rules.json";
import type {
  CatalogueAbility,
  CatalogueOwner,
  CatalogueRule,
  CatalogueSourceKind,
  MechanicCatalogue,
} from "@/shared/contracts/catalogue-rules";
import type { CharacterCatalogueEntry } from "@/types";
import {
  evaluateCatalogueCoverage,
  type CatalogueAbilityAudit,
} from "@/shared/utils/catalogue-coverage";
import type { AccountLevelDelta } from "@/shared/utils/catalogue-account";

export type OwnedMechanicCatalogue = MechanicCatalogue & { owners: readonly CatalogueOwner[] };
export const mechanicCatalogue = mechanicsJson as unknown as MechanicCatalogue;
export const bundledCatalogueRules: readonly CatalogueRule[] = (
  rulesJson as unknown as { schemaVersion: 1; rules: readonly CatalogueRule[] }
).rules;
const ruleLibrary = rulesJson as unknown as {
  audits?: readonly CatalogueAbilityAudit[];
  accountLevelDeltas?: readonly AccountLevelDelta[];
};
export const bundledAccountLevelDeltas = ruleLibrary.accountLevelDeltas ?? [];
let completeAbilityIds: Set<string> | undefined;
let defaultAbilityById: Map<string, CatalogueAbility> | undefined;
let reviewedRuleCountsByKey: Map<string, number> | undefined;

interface MechanicCatalogueIndex {
  characterOwnerBySlug: Map<string, CatalogueOwner | null>;
  summonsByParentOwnerId: Map<string, Map<string, CatalogueOwner>>;
  abilitiesByOwnerId: Map<string, CatalogueAbility[]>;
}

const catalogueIndexCache = new WeakMap<MechanicCatalogue, MechanicCatalogueIndex>();

function getCatalogueIndex(catalogue: MechanicCatalogue): MechanicCatalogueIndex {
  const cached = catalogueIndexCache.get(catalogue);
  if (cached) return cached;

  const characterOwnerBySlug = new Map<string, CatalogueOwner | null>();
  const summonsByParentOwnerId = new Map<string, Map<string, CatalogueOwner>>();
  for (const owner of catalogue.owners ?? []) {
    if (owner.sourceKind === "character") {
      characterOwnerBySlug.set(owner.slug, characterOwnerBySlug.has(owner.slug) ? null : owner);
    } else if (owner.sourceKind === "summon" && owner.parentOwnerId) {
      let map = summonsByParentOwnerId.get(owner.parentOwnerId);
      if (!map) {
        map = new Map();
        summonsByParentOwnerId.set(owner.parentOwnerId, map);
      }
      map.set(owner.id, owner);
    }
  }

  const abilitiesByOwnerId = new Map<string, CatalogueAbility[]>();
  for (const ability of catalogue.abilities) {
    let list = abilitiesByOwnerId.get(ability.ownerId);
    if (!list) {
      list = [];
      abilitiesByOwnerId.set(ability.ownerId, list);
    }
    list.push(ability);
  }

  const built: MechanicCatalogueIndex = {
    characterOwnerBySlug,
    summonsByParentOwnerId,
    abilitiesByOwnerId,
  };
  catalogueIndexCache.set(catalogue, built);
  return built;
}

export function catalogueAbilityMechanicStatus(ability: CatalogueAbility) {
  completeAbilityIds ??= new Set(
    evaluateCatalogueCoverage(mechanicCatalogue, bundledCatalogueRules, ruleLibrary.audits ?? [])
      .abilities.filter((entry) => entry.status === "complete")
      .map((entry) => entry.sourceRef),
  );
  defaultAbilityById ??= new Map(mechanicCatalogue.abilities.map((entry) => [entry.id, entry]));
  const count = reviewedCatalogueAbilityRuleCount(ability);
  const current = defaultAbilityById.get(ability.id);
  const complete = current?.sourceHash === ability.sourceHash && completeAbilityIds.has(ability.id);
  return {
    stage: complete ? "reviewed" : count ? "partial" : "parameters",
    label: complete
      ? `机制已审核（${count} 条规则）`
      : count
        ? `部分机制可计算（${count} 条规则）`
        : "数值已同步，计算规则未标注",
    detail: complete
      ? "描述条款已映射到审核规则；事件仅返回效果定义，不代表自动战斗模拟已实现。"
      : count
        ? "已有审核规则，但完整机制仍待审核；缺少属性、状态或事件时不能直接计算。"
        : "技能数值独立保存为常量或等级表；尚未定义这些数值的目标、条件与计算方式。",
  };
}

export function reviewedCatalogueAbilityRuleCount(ability: CatalogueAbility): number {
  if (!reviewedRuleCountsByKey) {
    reviewedRuleCountsByKey = new Map<string, number>();
    for (const rule of bundledCatalogueRules) {
      if (rule.status !== "reviewed") continue;
      const key = `${rule.sourceRef}\0${rule.sourceHash}`;
      reviewedRuleCountsByKey.set(key, (reviewedRuleCountsByKey.get(key) ?? 0) + 1);
    }
  }
  return reviewedRuleCountsByKey.get(`${ability.id}\0${ability.sourceHash}`) ?? 0;
}

export interface CatalogueAbilityGroup {
  id: string;
  ownerId: string;
  sourceKind: CatalogueSourceKind;
  label: string;
  abilities: readonly CatalogueAbility[];
}

/** Only levels present in the source are selectable; never synthesize a cap. */
export function catalogueAbilityLevels(ability: CatalogueAbility): number[] {
  return [...new Set(ability.levels)]
    .filter((level) => Number.isInteger(level) && level > 0)
    .sort((a, b) => a - b);
}

export function defaultCatalogueAbilityLevel(ability: CatalogueAbility): number | null {
  const levels = catalogueAbilityLevels(ability);
  return levels.includes(1) ? 1 : (levels[0] ?? null);
}

const slotLabels: Readonly<Record<string, string>> = {
  basic: "普攻",
  skill: "战技",
  ult: "终结技",
  talent: "天赋",
  technique: "秘技",
  elation: "欢愉技",
  other: "附属能力",
};
export function catalogueAbilitySlotLabel(slot: string): string {
  return slotLabels[slot] ?? "";
}

/** Exact slug metadata lookup keeps multi-path protagonists and summons separate. */
export function characterMechanicOwner(
  character: Pick<CharacterCatalogueEntry, "slug">,
  catalogue: MechanicCatalogue = mechanicCatalogue,
): CatalogueOwner | undefined {
  if (catalogue.schemaVersion !== 1) return undefined;
  return getCatalogueIndex(catalogue).characterOwnerBySlug.get(character.slug) ?? undefined;
}

export function characterAbilityGroups(
  character: Pick<CharacterCatalogueEntry, "slug">,
  catalogue: MechanicCatalogue = mechanicCatalogue,
): CatalogueAbilityGroup[] {
  const owner = characterMechanicOwner(character, catalogue);
  if (!owner) return [];
  const index = getCatalogueIndex(catalogue);
  const summonOwners =
    index.summonsByParentOwnerId.get(owner.id) ?? new Map<string, CatalogueOwner>();
  const relevantAbilities: CatalogueAbility[] = [...(index.abilitiesByOwnerId.get(owner.id) ?? [])];
  for (const summonId of summonOwners.keys()) {
    const summonAbilities = index.abilitiesByOwnerId.get(summonId);
    if (summonAbilities) relevantAbilities.push(...summonAbilities);
  }
  const groups = new Map<
    string,
    {
      id: string;
      ownerId: string;
      sourceKind: CatalogueSourceKind;
      label: string;
      abilities: CatalogueAbility[];
    }
  >();
  for (const ability of relevantAbilities) {
    const summon = summonOwners.get(ability.ownerId);
    const characterSource =
      ability.ownerId === owner.id &&
      (ability.sourceKind === "character" ||
        ability.sourceKind === "trace" ||
        ability.sourceKind === "eidolon");
    if (!characterSource && !(summon && ability.sourceKind === "summon")) continue;
    const id = `${ability.ownerId}\0${ability.sourceKind}\0${ability.groupId}`;
    const existing = groups.get(id);
    if (existing) {
      existing.abilities.push(ability);
      continue;
    }
    const label =
      ability.sourceKind === "trace"
        ? "行迹"
        : ability.sourceKind === "eidolon"
          ? "星魂"
          : summon
            ? `${summon.name} · ${ability.groupId.startsWith("servant-traces") ? "行迹" : "技能"}${ability.groupId.startsWith("servant-skills:") ? ` · ${catalogueAbilitySlotLabel(ability.slot) || "附属能力"}` : ""}`
            : `主要技能${ability.groupId.startsWith("skills:") ? ` · ${catalogueAbilitySlotLabel(ability.slot) || "附属能力"}` : ""}`;
    groups.set(id, {
      id,
      ownerId: ability.ownerId,
      sourceKind: ability.sourceKind,
      label,
      abilities: [ability],
    });
  }
  const order: Partial<Record<CatalogueSourceKind, number>> = {
    character: 0,
    trace: 1,
    eidolon: 2,
    summon: 3,
  };
  const slotOrder: Readonly<Record<string, number>> = {
    basic: 0,
    skill: 1,
    ult: 2,
    talent: 3,
    technique: 4,
    elation: 5,
    other: 6,
  };
  return [...groups.values()].sort((a, b) => {
    const sourceOrder = (order[a.sourceKind] ?? 4) - (order[b.sourceKind] ?? 4);
    if (sourceOrder) return sourceOrder;
    if (a.ownerId !== b.ownerId) return a.ownerId.localeCompare(b.ownerId);
    if (a.sourceKind !== "character" && a.sourceKind !== "summon") return 0;
    return (
      (slotOrder[a.abilities[0]?.slot ?? "other"] ?? 6) -
      (slotOrder[b.abilities[0]?.slot ?? "other"] ?? 6)
    );
  });
}
