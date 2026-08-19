import { invoke } from "@tauri-apps/api/core";
import type { McpSettings, McpStatus } from "@/types";

export const mcpApi = {
  getSettings: () => invoke<McpSettings>("get_mcp_settings"),
  saveSettings: (settings: McpSettings) => invoke<McpSettings>("save_mcp_settings", { settings }),
  getStatus: () => invoke<McpStatus>("get_mcp_status"),
  regenerateToken: () => invoke<McpSettings>("regenerate_mcp_token"),
};
