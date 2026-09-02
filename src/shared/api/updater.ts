import { check, type Update } from "@tauri-apps/plugin-updater";

export interface AppUpdate {
  version: string;
  notes: string | null;
  install: () => Promise<void>;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function checkForAppUpdate(): Promise<AppUpdate | null> {
  if (!isTauriRuntime()) return null;

  const update = await check();
  if (!update) return null;

  return {
    version: update.version,
    notes: update.body ?? null,
    install: () => installUpdate(update),
  };
}

async function installUpdate(update: Update) {
  await update.downloadAndInstall();
}
