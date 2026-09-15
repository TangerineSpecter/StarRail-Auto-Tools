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

export type OwnedMechanicCatalogue = MechanicCatalogue & { owners: readonly CatalogueOwner[] };
export const mechanicCatalogue = mechanicsJson as unknown as MechanicCatalogue;
export const bundledCatalogueRules: readonly CatalogueRule[] = (
  rulesJson as unknown as { schemaVersion: 1; rules: readonly CatalogueRule[] }
).rules;

export function reviewedCatalogueAbilityRuleCount(ability: CatalogueAbility): number {
  return bundledCatalogueRules.filter(
    (rule) =>
      rule.sourceRef === ability.id &&
      rule.sourceHash === ability.sourceHash &&
      rule.status === "reviewed",
  ).length;
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
  const matches = (catalogue.owners ?? []).filter(
    (owner) => owner.sourceKind === "character" && owner.slug === character.slug,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function characterAbilityGroups(
  character: Pick<CharacterCatalogueEntry, "slug">,
  catalogue: MechanicCatalogue = mechanicCatalogue,
): CatalogueAbilityGroup[] {
  const owner = characterMechanicOwner(character, catalogue);
  if (!owner) return [];
  const summonOwners = new Map(
    (catalogue.owners ?? [])
      .filter((entry) => entry.sourceKind === "summon" && entry.parentOwnerId === owner.id)
      .map((entry) => [entry.id, entry]),
  );
  const groups = new Map<string, CatalogueAbilityGroup>();
  for (const ability of catalogue.abilities) {
    const summon = summonOwners.get(ability.ownerId);
    const characterSource =
      ability.ownerId === owner.id &&
      ["character", "trace", "eidolon"].includes(ability.sourceKind);
    if (!characterSource && !(summon && ability.sourceKind === "summon")) continue;
    const id = `${ability.ownerId}\0${ability.sourceKind}\0${ability.groupId}`;
    const label =
      ability.sourceKind === "trace"
        ? "行迹"
        : ability.sourceKind === "eidolon"
          ? "星魂"
          : summon
            ? `${summon.name} · ${ability.groupId.startsWith("servant-traces") ? "行迹" : "技能"}${ability.groupId.startsWith("servant-skills:") ? ` · ${catalogueAbilitySlotLabel(ability.slot) || "附属能力"}` : ""}`
            : `主要技能${ability.groupId.startsWith("skills:") ? ` · ${catalogueAbilitySlotLabel(ability.slot) || "附属能力"}` : ""}`;
    const group = groups.get(id);
    if (group) groups.set(id, { ...group, abilities: [...group.abilities, ability] });
    else
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
