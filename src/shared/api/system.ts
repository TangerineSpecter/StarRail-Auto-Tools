import { invoke } from "@tauri-apps/api/core";
import type { SystemCapabilities } from "@/types";

export const systemApi = {
  capabilities: () => invoke<SystemCapabilities>("get_system_capabilities"),
};
