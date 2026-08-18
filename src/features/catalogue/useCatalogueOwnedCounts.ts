import { onActivated, onBeforeUnmount, onDeactivated, ref, watch, type Ref } from "vue";
import { inventoryApi } from "@/shared/api/inventory";
import { lightConeOwnedCountMap, relicOwnedCountMap } from "./owned-counts";

export function useCatalogueOwnedCounts(revision: Ref<number>) {
  const relicCounts = ref(new Map<number, number>());
  const lightConeCounts = ref(new Map<number, number>());
  let requestId = 0;
  let active = false;
  let loadedRevision = -1;

  async function load() {
    const currentRequest = ++requestId;
    const currentRevision = revision.value;
    try {
      const counts = await inventoryApi.equipmentCounts();
      if (currentRequest !== requestId || currentRevision !== revision.value) return;
      relicCounts.value = relicOwnedCountMap(counts);
      lightConeCounts.value = lightConeOwnedCountMap(counts);
      loadedRevision = currentRevision;
    } catch {
      if (currentRequest !== requestId) return;
    }
  }

  function refreshWhenNeeded() {
    if (loadedRevision !== revision.value) void load();
  }

  onActivated(() => {
    active = true;
    refreshWhenNeeded();
  });
  onDeactivated(() => {
    active = false;
  });
  onBeforeUnmount(() => {
    active = false;
    requestId += 1;
  });
  watch(revision, () => {
    if (active) void load();
  });
  active = true;
  void load();

  return { relicCounts, lightConeCounts };
}
