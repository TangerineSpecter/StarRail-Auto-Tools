import { listen } from "@tauri-apps/api/event";
import { invoke } from "@/shared/api/invoke";
import type { DirectReadSnapshot } from "@/types";

export const directReadApi = {
  snapshot: () => invoke<DirectReadSnapshot>("get_direct_read_snapshot"),
  start: () => invoke<DirectReadSnapshot>("start_direct_read"),
  stop: () => invoke<DirectReadSnapshot>("stop_direct_read"),
  confirmAccountSwitch: () => invoke<DirectReadSnapshot>("confirm_account_switch"),
  onStatus: (handler: (snapshot: DirectReadSnapshot) => void) =>
    listen<DirectReadSnapshot>("direct-read://status", (event) => handler(event.payload)),
};
