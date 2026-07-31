import type { CharacterFilter, InventoryKind, LightConeFilter, RelicFilter } from "@/types";

export interface InventoryFilterForm {
  search: string;
  slots: string[];
  rarities: number[];
  minLevel: string;
  maxLevel: string;
  mainStats: string[];
  subStats: string[];
  minSubstatCount: string;
  maxSubstatCount: string;
  locked: string;
  discard: string;
  equipped: string;
  minAscension: string;
  superimposition: string;
  path: string;
  eidolon: string;
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
  superimposition: "",
  path: "",
  eidolon: "",
});

const asNumber = (value: string): number | undefined => {
  const normalized = value.trim();
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
      superimposition: asNumber(form.superimposition),
      locked: asBoolean(form.locked),
      equipped: asBoolean(form.equipped),
    });
  }
  return compact({
    ...shared,
    path: form.path.trim() || undefined,
    eidolon: asNumber(form.eidolon),
  });
}
