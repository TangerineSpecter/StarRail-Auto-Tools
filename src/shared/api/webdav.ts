import { invoke } from "@tauri-apps/api/core";
import type { InventorySummary, WebDavSettings } from "@/types";

export const webDavApi = {
  getSettings: () => invoke<WebDavSettings>("get_webdav_settings"),
  saveSettings: (settings: WebDavSettings) => invoke<void>("save_webdav_settings", { settings }),
  test: (settings: WebDavSettings) => invoke<void>("test_webdav_connection", { settings }),
  upload: (settings: WebDavSettings) => invoke<void>("upload_webdav_snapshot", { settings }),
  download: (settings: WebDavSettings) =>
    invoke<InventorySummary>("download_webdav_snapshot", { settings }),
};
