import { invoke } from "@tauri-apps/api/core";
import type {
  CharacterFilter,
  CharacterListItem,
  InventoryDetail,
  InventoryImportResult,
  InventoryKind,
  InventorySummary,
  LightConeFilter,
  LightConeListItem,
  PagedResult,
  RelicFilter,
  RelicListItem,
} from "@/types";

export const inventoryApi = {
  summary: () => invoke<InventorySummary>("get_inventory_summary"),
  listRelics: (filter: RelicFilter) =>
    invoke<PagedResult<RelicListItem>>("list_relics", { filter }),
  listLightCones: (filter: LightConeFilter) =>
    invoke<PagedResult<LightConeListItem>>("list_light_cones", { filter }),
  listCharacters: (filter: CharacterFilter) =>
    invoke<PagedResult<CharacterListItem>>("list_characters", { filter }),
  detail: (kind: InventoryKind, id: number) =>
    invoke<InventoryDetail>("get_inventory_detail", { kind, id }),
  deleteItems: (kind: InventoryKind, ids: number[]) =>
    invoke<number>("delete_inventory_items", { request: { kind, ids } }),
  clear: (kind: InventoryKind | null) =>
    invoke<InventorySummary>("clear_inventory", { request: { kind } }),
  export: () => invoke<string | null>("export_inventory"),
  import: () => invoke<InventoryImportResult | null>("import_inventory"),
};
