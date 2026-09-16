import { invoke } from "@/shared/api/invoke";
import type { SystemCapabilities } from "@/types";

export const systemApi = {
  capabilities: () => invoke<SystemCapabilities>("get_system_capabilities"),
};
