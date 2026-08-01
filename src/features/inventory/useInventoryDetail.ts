import { computed, ref } from "vue";
import { inventoryApi } from "@/shared/api/inventory";
import type { InventoryDetail, InventoryKind } from "@/types";

export function useInventoryDetail(setError: (message: string) => void) {
  const detail = ref<InventoryDetail | null>(null);
  const loading = ref(false);
  let requestId = 0;
  const relic = computed(() => (detail.value?.kind === "relic" ? detail.value.data : null));
  const character = computed(() => (detail.value?.kind === "character" ? detail.value.data : null));
  const lightCone = computed(() => (detail.value?.kind === "lightCone" ? detail.value.data : null));

  async function open(kind: InventoryKind, id: number) {
    const currentRequest = ++requestId;
    detail.value = null;
    loading.value = true;
    try {
      const next = await inventoryApi.detail(kind, id);
      if (currentRequest === requestId) detail.value = next;
    } catch (cause) {
      if (currentRequest === requestId) setError(String(cause));
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
  }
  function close() {
    requestId += 1;
    detail.value = null;
    loading.value = false;
  }
  return { detail, loading, relic, character, lightCone, open, close };
}
