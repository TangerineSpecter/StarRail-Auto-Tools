import { buildPlanApi } from "@/shared/api/build-plan";
import { captureApi } from "@/shared/api/capture";
import { directReadApi } from "@/shared/api/direct-read";
import { inventoryApi } from "@/shared/api/inventory";
import { systemApi } from "@/shared/api/system";

/** @deprecated Import a domain API from `@/shared/api` instead. */
export const api = {
  capabilities: systemApi.capabilities,
  recognizeImage: captureApi.recognizeImage,
  recognizeScreenshot: captureApi.recognizeScreenshot,
  captureDesktop: captureApi.captureDesktop,
  directReadSnapshot: directReadApi.snapshot,
  startDirectRead: directReadApi.start,
  stopDirectRead: directReadApi.stop,
  confirmAccountSwitch: directReadApi.confirmAccountSwitch,
  inventorySummary: inventoryApi.summary,
  listRelics: inventoryApi.listRelics,
  listLightCones: inventoryApi.listLightCones,
  listCharacters: inventoryApi.listCharacters,
  inventoryDetail: inventoryApi.detail,
  deleteInventoryItems: inventoryApi.deleteItems,
  clearInventory: inventoryApi.clear,
  exportInventory: inventoryApi.export,
  importInventory: inventoryApi.import,
  characterBuildPlan: buildPlanApi.get,
  saveCharacterBuildPlan: buildPlanApi.save,
  deleteCharacterBuildPlan: buildPlanApi.delete,
  recommendCharacterBuild: buildPlanApi.recommend,
};
