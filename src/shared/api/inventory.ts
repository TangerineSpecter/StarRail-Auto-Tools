import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  CharacterFilter,
  CharacterListItem,
  InventoryDetail,
  InventoryImportResult,
  InventoryKind,
  InventorySummary,
  LightConeFilter,
  LightConeListItem,
  PageQuery,
  PagedResult,
  RelicFilter,
  RelicListItem,
  RelicMainStatGroupedResult,
  RelicMainStatScanResult,
} from "@/types";

export const inventoryApi = {
  summary: () => invoke<InventorySummary>("get_inventory_summary"),
  listRelics: (filter: RelicFilter) =>
    invoke<PagedResult<RelicListItem>>("list_relics", { filter }),
  relicMainStatScanPlanCount: () => invoke<number>("get_relic_main_stat_scan_plan_count"),
  scanRelicsByMainStat: (page: PageQuery) =>
    invoke<RelicMainStatScanResult>("scan_relics_by_main_stat", { page }),
  scanRelicsByMainStatGrouped: () =>
    invoke<RelicMainStatGroupedResult>("scan_relics_by_main_stat_grouped"),
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
  onChanged: (handler: (summary: InventorySummary) => void) =>
    listen<InventorySummary>("inventory://changed", (event) => handler(event.payload)),
};
