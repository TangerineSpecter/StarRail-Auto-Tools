import { computed, type Ref } from "vue";
import { directReadApi } from "@/shared/api/direct-read";
import { inventoryApi } from "@/shared/api/inventory";
import type { DirectReadSnapshot, InventorySummary } from "@/types";

interface DirectReadOptions {
  direct: Ref<DirectReadSnapshot>;
  summary: Ref<InventorySummary>;
  busy: Ref<boolean>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}

export function useDirectRead(options: DirectReadOptions) {
  const { direct, summary, busy, setError, setNotice } = options;
  const running = computed(() =>
    ["starting", "waitingForLogin", "connected", "syncing", "ready"].includes(direct.value.phase),
  );

  async function toggle() {
    busy.value = true;
    setError("");
    try {
      direct.value = running.value ? await directReadApi.stop() : await directReadApi.start();
    } catch (cause) {
      setError(String(cause));
    } finally {
      busy.value = false;
    }
  }

  async function switchAccount() {
    if (!window.confirm("这会清空当前本地数据并写入新账号数据，是否继续？")) return;
    busy.value = true;
    try {
      direct.value = await directReadApi.confirmAccountSwitch();
      summary.value = await inventoryApi.summary();
      setNotice("账号数据已切换");
    } catch (cause) {
      setError(String(cause));
    } finally {
      busy.value = false;
    }
  }

  return { running, toggle, switchAccount };
}
