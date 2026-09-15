// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error Native Node maintenance entry point.
import { catalogueSyncPlan, synchronizeCatalogues, main } from "../../scripts/sync-catalogues.mjs";

describe("unified catalogue sync", () => {
  it("defaults to all sources in dependency order", () => {
    expect(catalogueSyncPlan().map((task: { id: string }) => task.id)).toEqual([
      "relic",
      "light-cone",
      "mechanic",
    ]);
    expect(catalogueSyncPlan(["all"])).toEqual(catalogueSyncPlan());
  });
  it("selects and deduplicates tasks without changing dependency order", () => {
    expect(
      catalogueSyncPlan(["mechanic", "relic", "relic"]).map((task: { id: string }) => task.id),
    ).toEqual(["relic", "mechanic"]);
    expect(catalogueSyncPlan(["light-cone"])).toHaveLength(1);
  });
  it("forwards image switches only to supported scripts", () => {
    const plan = catalogueSyncPlan(["all", "--refresh-images"]);
    expect(plan.map((task: { args: string[] }) => task.args)).toEqual([
      ["--refresh-images"],
      ["--refresh-images"],
      [],
    ]);
    expect(catalogueSyncPlan(["--skip-images"])[0].args).toEqual(["--skip-images"]);
  });
  it("rejects invalid options before executing any task", () => {
    for (const args of [["unknown"], ["--dry-run"], ["--skip-images", "--refresh-images"]])
      expect(() => catalogueSyncPlan(args)).toThrow();
  });
  it("stops immediately on failure and does not report completion", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("fetch failed"));
    const log = vi.fn();
    await expect(synchronizeCatalogues(catalogueSyncPlan(), execute, log)).rejects.toThrow(
      "fetch failed",
    );
    expect(execute).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(2);
  });
  it("executes sequentially and reports success only after all tasks", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();
    await synchronizeCatalogues(catalogueSyncPlan(), execute, log);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(log.mock.calls.at(-1)?.[0]).toContain("同步完成");
  });
  it("prints help without fetching or publishing", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await main(["--list"]);
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
