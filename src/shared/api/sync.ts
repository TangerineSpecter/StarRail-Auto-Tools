import { invoke } from "@tauri-apps/api/core";
import type { InventorySummary, SyncSettings } from "@/types";

export const syncApi = {
  getSettings: () => invoke<SyncSettings>("get_sync_settings"),
  saveSettings: (settings: SyncSettings) => invoke<void>("save_sync_settings", { settings }),
  test: (settings: SyncSettings) => invoke<void>("test_sync_connection", { settings }),
  upload: (settings: SyncSettings) => invoke<void>("upload_sync_snapshot", { settings }),
  download: (settings: SyncSettings) =>
    invoke<InventorySummary>("download_sync_snapshot", { settings }),
};
