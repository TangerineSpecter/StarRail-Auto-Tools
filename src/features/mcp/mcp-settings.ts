import type { McpSettings, McpStatus, McpToolInfo } from "@/types";

export const DEFAULT_MCP_PORT = 18765;
export const MCP_BIND_HOST = "127.0.0.1";

export const MCP_CLIENTS = [
  { id: "grok", label: "Grok" },
  { id: "claude", label: "Claude" },
  { id: "traework", label: "TraeWork" },
] as const;

export type McpClientId = (typeof MCP_CLIENTS)[number]["id"];

export function emptyMcpSettings(): McpSettings {
  return { enabled: false, port: DEFAULT_MCP_PORT, token: "" };
}

export function mergeMcpSettings(value?: Partial<McpSettings> | null): McpSettings {
  const base = emptyMcpSettings();
  if (!value) return base;
  return {
    enabled: Boolean(value.enabled),
    port: typeof value.port === "number" ? value.port : base.port,
    token: value.token ?? "",
  };
}

export function emptyMcpStatus(settings: McpSettings = emptyMcpSettings()): McpStatus {
  return {
    enabled: settings.enabled,
    running: false,
    bindAddress: MCP_BIND_HOST,
    port: settings.port,
    endpoint: mcpEndpoint(settings.port),
    lastError: null,
    tools: catalogTools(),
  };
}

export function catalogTools(): McpToolInfo[] {
  return [
    {
      name: "upload_local_data",
      title: "上传本地数据",
      description: "把当前本地录入、培养方案与配队上传到已配置的 WebDAV / FTP / SFTP 同步站。",
      destructive: false,
    },
    {
      name: "download_local_data",
      title: "下载本地数据",
      description:
        "从同步站下载远端快照并完整覆盖本地同步范围内的数据。调用时必须传入 confirm=true。",
      destructive: true,
    },
  ];
}

export function mcpEndpoint(port: number): string {
  return `http://${MCP_BIND_HOST}:${port}/mcp`;
}

export function validateMcpSettings(settings: McpSettings): string {
  if (!Number.isInteger(settings.port) || settings.port < 1024 || settings.port > 65535) {
    return "端口必须在 1024 到 65535 之间。";
  }
  return "";
}

export function statusHeadline(status: McpStatus): string {
  if (!status.enabled) return "未启用";
  if (status.running) return "监听中";
  if (status.lastError) return "启动失败";
  return "已停止";
}

export function maskToken(token: string): string {
  if (!token) return "保存并启用后自动生成";
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

export function clientConfig(client: McpClientId, endpoint: string, token: string): string {
  const bearer = token || "<token>";
  if (client === "grok") {
    return [
      "[mcp_servers.starrail]",
      `url = "${endpoint}"`,
      "enabled = true",
      "",
      "[mcp_servers.starrail.headers]",
      `Authorization = "Bearer ${bearer}"`,
    ].join("\n");
  }
  return JSON.stringify(
    {
      mcpServers: {
        starrail: {
          url: endpoint,
          headers: { Authorization: `Bearer ${bearer}` },
        },
      },
    },
    null,
    2,
  );
}
