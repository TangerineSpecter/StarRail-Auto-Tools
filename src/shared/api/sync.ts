import { invoke } from "@/shared/api/invoke";
import type { SyncConflict, SyncDownloadResult, SyncSettings, SyncUploadResult } from "@/types";

export const syncApi = {
  getSettings: () => invoke<SyncSettings>("get_sync_settings"),
  saveSettings: (settings: SyncSettings) => invoke<void>("save_sync_settings", { settings }),
  test: (settings: SyncSettings) => invoke<void>("test_sync_connection", { settings }),
  upload: (settings: SyncSettings, confirmation?: SyncConflict) =>
    invoke<SyncUploadResult>("upload_sync_snapshot", {
      settings,
      expectedLocalGeneratedAt: confirmation?.localGeneratedAt,
      expectedRemoteRevision: confirmation?.remoteRevision,
    }),
  download: (settings: SyncSettings, confirmation?: SyncConflict) =>
    invoke<SyncDownloadResult>("download_sync_snapshot", {
      settings,
      expectedLocalGeneratedAt: confirmation?.localGeneratedAt,
      expectedRemoteRevision: confirmation?.remoteRevision,
    }),
};
