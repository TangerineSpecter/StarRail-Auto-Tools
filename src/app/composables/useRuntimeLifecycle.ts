import { onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { directReadApi } from "@/shared/api/direct-read";
import { inventoryApi } from "@/shared/api/inventory";
import { systemApi } from "@/shared/api/system";
import { useRuntimeStore } from "@/app/stores/runtime";
import type { SystemCapabilities } from "@/types";

/** Loads application-wide snapshots and owns their desktop event subscriptions. */
export function useRuntimeLifecycle() {
  const capabilities = ref<SystemCapabilities | null>(null);
  const runtime = useRuntimeStore();
  const { direct, summary, error } = storeToRefs(runtime);
  let stopDirect: (() => void) | undefined;
  let stopInventory: (() => void) | undefined;
  let disposed = false;
  let receivedDirectEvent = false;
  let receivedInventoryEvent = false;

  onMounted(async () => {
    const attach = (stop: () => void, kind: "direct" | "inventory") => {
      if (disposed) {
        stop();
        return;
      }
      if (kind === "direct") stopDirect = stop;
      else stopInventory = stop;
    };

    const subscriptions = Promise.allSettled([
      directReadApi
        .onStatus((snapshot) => {
          receivedDirectEvent = true;
          direct.value = snapshot;
        })
        .then((stop) => attach(stop, "direct")),
      inventoryApi
        .onChanged((nextSummary) => {
          receivedInventoryEvent = true;
          summary.value = nextSummary;
          runtime.markInventoryChanged();
        })
        .then((stop) => attach(stop, "inventory")),
    ]);

    const initialResults = await Promise.allSettled([
      systemApi.capabilities(),
      directReadApi.snapshot(),
      inventoryApi.summary(),
    ] as const);
    const [capabilitiesResult, directResult, summaryResult] = initialResults;
    if (capabilitiesResult.status === "fulfilled") capabilities.value = capabilitiesResult.value;
    if (directResult.status === "fulfilled" && !receivedDirectEvent)
      direct.value = directResult.value;
    if (summaryResult.status === "fulfilled" && !receivedInventoryEvent)
      summary.value = summaryResult.value;
    const initialFailure = initialResults.find((result) => result.status === "rejected");
    if (initialFailure?.status === "rejected") error.value = String(initialFailure.reason);

    const subscriptionResults = await subscriptions;
    const failure = subscriptionResults.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") error.value = String(failure.reason);
  });

  onUnmounted(() => {
    disposed = true;
    stopDirect?.();
    stopInventory?.();
  });

  return { capabilities };
}
