// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { inventoryApi } from "@/shared/api/inventory";
import { buildPlanApi } from "@/shared/api/build-plan";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/shared/api/invoke", () => ({ invoke }));

describe("mobile analysis native command contract", () => {
  it("registers the real frontend analysis requests in the mobile handler, without demo IPC", async () => {
    invoke.mockClear();
    await inventoryApi.relicMainStatScanPlanCount();
    await inventoryApi.scanRelicsByMainStatGrouped();
    await inventoryApi.scanRelicsByMainStat({ page: 1, pageSize: 50 });
    await buildPlanApi.dashboard();
    await inventoryApi.listRelics({ page: 1, pageSize: 200, equipped: false });
    await inventoryApi.detail("relic", 1);
    await buildPlanApi.get(1);

    const source = readFileSync(new URL("../../src-tauri/src/lib.rs", import.meta.url), "utf8");
    const mobileEntry = source.split("#[tauri::mobile_entry_point]")[1];
    expect(mobileEntry).toBeDefined();
    const handler = mobileEntry!.match(
      /\.invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/,
    )?.[1];
    expect(handler).toBeDefined();
    const registered = new Set([...handler!.matchAll(/commands::(\w+)/g)].map((match) => match[1]));
    for (const [command] of invoke.mock.calls) {
      expect(registered, `mobile native command missing: ${command}`).toContain(command);
    }
  });
});
