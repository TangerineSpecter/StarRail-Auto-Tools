import { defineStore } from "pinia";
import { ref } from "vue";
import type { DirectReadSnapshot, InventorySummary } from "@/types";

const protocolVersion = "reliquary-v22.0.0 / HSR-4.4";

export const emptyDirectSnapshot: DirectReadSnapshot = {
  phase: "unsupported",
  message: "正在读取运行状态…",
  startedAt: null,
  lastSyncAt: null,
  relics: 0,
  lightCones: 0,
  characters: 0,
  protocolVersion,
  currentUid: null,
  incomingUid: null,
  requiresAccountSwitch: false,
};

export const emptyInventorySummary: InventorySummary = {
  relics: 0,
  lightCones: 0,
  characters: 0,
  lastSyncAt: null,
  protocolVersion,
};

/** Shared runtime state; feature-local interaction state remains in composables/components. */
export const useRuntimeStore = defineStore("runtime", () => {
  const direct = ref<DirectReadSnapshot>({ ...emptyDirectSnapshot });
  const summary = ref<InventorySummary>({ ...emptyInventorySummary });
  const busy = ref(false);
  const error = ref("");
  const notice = ref("");
  const inventoryRevision = ref(0);

  function markInventoryChanged() {
    inventoryRevision.value += 1;
  }

  return { direct, summary, busy, error, notice, inventoryRevision, markInventoryChanged };
});
