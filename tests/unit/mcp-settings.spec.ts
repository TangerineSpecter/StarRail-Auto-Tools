import { describe, expect, it } from "vitest";
import {
  clientConfig,
  DEFAULT_MCP_PORT,
  emptyMcpSettings,
  maskToken,
  mcpEndpoint,
  mergeMcpSettings,
  statusHeadline,
  validateMcpSettings,
} from "@/features/mcp/mcp-settings";
import type { McpStatus } from "@/types";

function status(overrides: Partial<McpStatus> = {}): McpStatus {
  return {
    enabled: false,
    running: false,
    bindAddress: "127.0.0.1",
    port: DEFAULT_MCP_PORT,
    endpoint: mcpEndpoint(DEFAULT_MCP_PORT),
    lastError: null,
    tools: [],
    ...overrides,
  };
}

describe("mcp-settings", () => {
  it("fills defaults without enabling the server", () => {
    expect(mergeMcpSettings()).toEqual(emptyMcpSettings());
    expect(mergeMcpSettings({ enabled: true, port: 19001 }).token).toBe("");
  });

  it("rejects privileged or non-integer ports", () => {
    expect(validateMcpSettings({ enabled: false, port: 80, token: "" })).toBe(
      "端口必须在 1024 到 65535 之间。",
    );
    expect(validateMcpSettings({ enabled: true, port: 18765.2, token: "abc" })).toBe(
      "端口必须在 1024 到 65535 之间。",
    );
    expect(validateMcpSettings(emptyMcpSettings())).toBe("");
  });

  it("summarizes runtime state for the settings hero", () => {
    expect(statusHeadline(status())).toBe("未启用");
    expect(statusHeadline(status({ enabled: true, running: true }))).toBe("监听中");
    expect(statusHeadline(status({ enabled: true, lastError: "端口占用" }))).toBe("启动失败");
    expect(statusHeadline(status({ enabled: true }))).toBe("已停止");
  });

  it("masks tokens and builds client snippets from the live endpoint", () => {
    expect(maskToken("")).toContain("自动生成");
    expect(maskToken("abcdef0123456789")).toBe("abcd••••6789");
    const grok = clientConfig("grok", "http://127.0.0.1:19001/mcp", "secret");
    expect(grok).toContain('url = "http://127.0.0.1:19001/mcp"');
    expect(grok).toContain('Authorization = "Bearer secret"');
    const claude = clientConfig("claude", "http://127.0.0.1:19001/mcp", "secret");
    expect(claude).toContain('"url": "http://127.0.0.1:19001/mcp"');
    expect(claude).toContain("Bearer secret");
    const traeWork = clientConfig("traework", "http://127.0.0.1:19001/mcp", "secret");
    expect(traeWork).toContain('"mcpServers"');
    expect(traeWork).toContain('"url": "http://127.0.0.1:19001/mcp"');
  });
});
