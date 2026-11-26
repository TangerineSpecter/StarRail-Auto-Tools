import { openUrl } from "@tauri-apps/plugin-opener";

export const openerApi = {
  openUrl: (url: string): Promise<void> => openUrl(url),
};
