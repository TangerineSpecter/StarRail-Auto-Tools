import { describe, expect, it, vi } from "vitest";
import { demoEnabled, mobileMock } from "@/shared/dev/mobile-mock";
import { characters, dashboard, relics } from "@/shared/dev/mobile-fixtures";
import { invoke, setDevelopmentInvokeHandler } from "@/shared/api/invoke";
import type { PagedResult, RelicListItem } from "@/types";

const { native } = vi.hoisted(() => ({ native: vi.fn().mockResolvedValue(null) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native }));

describe("mobile development sample data", () => {
  it("starts with demo data unless real data was explicitly selected", () => {
    expect(demoEnabled({ getItem: () => null })).toBe(true);
    expect(demoEnabled({ getItem: () => "real" })).toBe(false);
  });
  it("provides paged, filtered inventory and independent detail results", () => {
    const result = mobileMock("list_relics", { filter: { page: 2, pageSize: 5, slots: ["Head"] } })!
      .value as PagedResult<RelicListItem>;
    expect(result.items).toHaveLength(5);
    expect(result.total).toBe(10);
    expect(result.items.every((r) => r.slot === "Head")).toBe(true);
    const detail = mobileMock("get_inventory_detail", {
      kind: "character",
      id: characters[0]!.characterId,
    })!.value as { data: { name: string; equippedRelics: unknown[] } };
    expect(detail.data.equippedRelics).toHaveLength(6);
    detail.data.name = "changed";
    expect(characters[0]!.name).not.toBe("changed");
  });
  it("binds equipment and plans to character IDs", () => {
    for (const entry of dashboard) {
      expect(entry.character.characterId).toBe(entry.plan.characterId);
      expect(
        relics.filter((r) => r.equippedCharacterId === entry.character.characterId),
      ).toHaveLength(6);
    }
    expect(characters.filter((c) => c.name === "三月七").map((c) => c.path)).toEqual([
      "巡猎",
      "存护",
    ]);
    expect(characters.filter((c) => c.name === "开拓者").map((c) => c.path)).toEqual([
      "毁灭",
      "同谐",
    ]);
    expect(new Set(characters.map((c) => c.characterId)).size).toBe(characters.length);
    expect(mobileMock("list_teams")!.value).toMatchObject({ total: 3 });
    expect(mobileMock("list_relic_set_target_counts")!.value).not.toEqual([]);
  });
  it("intercepts demo IPC, preserves native fold geometry and blocks real writes", async () => {
    setDevelopmentInvokeHandler(mobileMock);
    expect(await invoke("get_inventory_summary")).toMatchObject({ relics: 60 });
    expect(native).not.toHaveBeenCalled();
    await invoke("get_mobile_layout_regions");
    expect(native).toHaveBeenCalledOnce();
    for (const command of [
      "save_sync_settings",
      "download_sync_snapshot",
      "delete_inventory_items",
    ]) {
      await expect(invoke(command)).rejects.toThrow("示例数据模式");
    }
    expect(native).toHaveBeenCalledOnce();
  });
});
