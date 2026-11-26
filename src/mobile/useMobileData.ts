import { ref } from "vue";
import { syncApi } from "@/shared/api/sync";
import type { SyncSettings } from "@/types";

export function useMobileData() {
  const loading = ref(false);
  const error = ref("");
  const settings = ref<SyncSettings | null>(null);

  async function loadSettings() {
    try {
      settings.value = await syncApi.getSettings();
      settings.value.protocol = "webdav";
    } catch (cause) {
      error.value = String(cause);
    }
  }

  async function download() {
    if (!settings.value || loading.value) return false;
    loading.value = true;
    error.value = "";
    try {
      const value = { ...settings.value, protocol: "webdav" as const };
      await syncApi.saveSettings(value);
      const result = await syncApi.download(value);
      if (result.status === "conflict") {
        error.value = "本机数据有未同步的修改，已停止下载。请检查后再同步。";
        return false;
      }
      return true;
    } catch (cause) {
      error.value = String(cause);
      return false;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, settings, loadSettings, download };
}
