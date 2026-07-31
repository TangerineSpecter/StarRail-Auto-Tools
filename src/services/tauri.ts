import { invoke } from "@tauri-apps/api/core";
import type {
  CharacterFilter,
  CharacterBuildPlan,
  BuildRecommendation,
  CharacterListItem,
  DirectReadSnapshot,
  InventoryDetail,
  InventoryKind,
  InventorySummary,
  LightConeFilter,
  LightConeListItem,
  OcrImageResult,
  OcrModelConfig,
  PagedResult,
  RelicFilter,
  RelicListItem,
  SystemCapabilities,
} from "../types";

export const api = {
  capabilities: () => invoke<SystemCapabilities>("get_system_capabilities"),
  recognizeImage: (imagePath: string, models: OcrModelConfig) =>
    invoke<OcrImageResult>("recognize_image", { imagePath, models }),
  recognizeScreenshot: (imageBytes: number[], models: OcrModelConfig) =>
    invoke<OcrImageResult>("recognize_screenshot", { imageBytes, models }),
  captureDesktop: () => invoke<number[]>("capture_desktop"),

  directReadSnapshot: () =>
    invoke<DirectReadSnapshot>("get_direct_read_snapshot"),
  startDirectRead: () => invoke<DirectReadSnapshot>("start_direct_read"),
  stopDirectRead: () => invoke<DirectReadSnapshot>("stop_direct_read"),
  confirmAccountSwitch: () =>
    invoke<DirectReadSnapshot>("confirm_account_switch"),

  inventorySummary: () =>
    invoke<InventorySummary>("get_inventory_summary"),
  listRelics: (filter: RelicFilter) =>
    invoke<PagedResult<RelicListItem>>("list_relics", { filter }),
  listLightCones: (filter: LightConeFilter) =>
    invoke<PagedResult<LightConeListItem>>("list_light_cones", { filter }),
  listCharacters: (filter: CharacterFilter) =>
    invoke<PagedResult<CharacterListItem>>("list_characters", { filter }),
  inventoryDetail: (kind: InventoryKind, id: number) =>
    invoke<InventoryDetail>("get_inventory_detail", { kind, id }),
  deleteInventoryItems: (kind: InventoryKind, ids: number[]) =>
    invoke<number>("delete_inventory_items", { request: { kind, ids } }),
  clearInventory: (kind: InventoryKind | null) =>
    invoke<InventorySummary>("clear_inventory", { request: { kind } }),
  exportInventory: () =>
    invoke<string | null>("export_inventory"),
  importInventory: () => invoke<InventorySummary | null>("import_inventory"),
  characterBuildPlan: (characterId: number) =>
    invoke<CharacterBuildPlan | null>("get_character_build_plan", { characterId }),
  saveCharacterBuildPlan: (plan: CharacterBuildPlan) =>
    invoke<void>("save_character_build_plan", { plan }),
  deleteCharacterBuildPlan: (characterId: number) =>
    invoke<void>("delete_character_build_plan", { characterId }),
  recommendCharacterBuild: (characterId: number, includeEquipped: boolean) =>
    invoke<BuildRecommendation>("recommend_character_build", { request: { characterId, includeEquipped } }),
};
