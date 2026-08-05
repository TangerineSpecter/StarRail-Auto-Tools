import characterCatalogueJson from "@/data/characters.json";
import type { CharacterFilter, InventoryKind, LightConeFilter, RelicFilter } from "@/types";

export interface InventoryFilterForm {
  search: string;
  slots: string[];
  rarities: number[];
  minLevel: string;
  maxLevel: string;
  mainStats: string[];
  subStats: string[];
  minSubstatCount: string | number;
  maxSubstatCount: string | number;
  locked: string;
  discard: string;
  equipped: string;
  minAscension: string;
  superimposition: number[];
  path: string[];
  eidolon: number[];
  element: string[];
  buildPlan: string;
}

export const createInventoryFilterForm = (): InventoryFilterForm => ({
  search: "",
  slots: [],
  rarities: [],
  minLevel: "",
  maxLevel: "",
  mainStats: [],
  subStats: [],
  minSubstatCount: "",
  maxSubstatCount: "",
  locked: "",
  discard: "",
  equipped: "",
  minAscension: "",
  superimposition: [],
  path: [],
  eidolon: [],
  element: [],
  buildPlan: "",
});

const asNumber = (value: string | number): number | undefined => {
  const normalized = String(value).trim();
  return normalized === "" ? undefined : Number(normalized);
};

const asBoolean = (value: string): boolean | undefined =>
  value === "true" ? true : value === "false" ? false : undefined;

const compact = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== ""),
  ) as T;

export function buildInventoryFilter(
  kind: InventoryKind,
  form: InventoryFilterForm,
  page: number,
  pageSize: number,
): RelicFilter | LightConeFilter | CharacterFilter {
  const shared = { page, pageSize, search: form.search.trim() || undefined };
  if (kind === "relic") {
    return compact({
      ...shared,
      slots: form.slots.length ? form.slots : undefined,
      rarities: form.rarities.length ? form.rarities : undefined,
      mainStats: form.mainStats.length ? form.mainStats : undefined,
      subStats: form.subStats.length ? form.subStats : undefined,
      minSubstatCount: asNumber(form.minSubstatCount),
      maxSubstatCount: asNumber(form.maxSubstatCount),
      locked: asBoolean(form.locked),
      discard: asBoolean(form.discard),
      equipped: asBoolean(form.equipped),
    });
  }
  if (kind === "lightCone") {
    return compact({
      ...shared,
      superimposition: form.superimposition.length ? form.superimposition : undefined,
      locked: asBoolean(form.locked),
      equipped: asBoolean(form.equipped),
    });
  }

  let names: string[] | undefined = undefined;
  if (form.element.length > 0) {
    // Deduplicate names; multi-path characters (开拓者 / 三月七) share a name across
    // elements, so name-only SQL filtering is an over-approximation — path filter
    // and catalogue-side resolution keep path variants distinct in the UI.
    names = [
      ...new Set(
        characterCatalogueJson.characters
          .filter((c) => form.element.includes(c.element))
          .map((c) => c.name),
      ),
    ];
    if (names.length === 0) names = ["__NO_MATCH__"];
  }

  return compact({
    ...shared,
    names,
    path: form.path.length ? form.path : undefined,
    eidolon: form.eidolon.length ? form.eidolon : undefined,
    hasBuildPlan: asBoolean(form.buildPlan),
  });
}
