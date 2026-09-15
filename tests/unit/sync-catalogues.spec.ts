// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
// @ts-expect-error Native Node maintenance entry point.
import {
  catalogueSyncPlan,
  synchronizeCatalogues,
  synchronizeCandidateBatch,
  main,
} from "../../scripts/sync-catalogues.mjs";
// @ts-expect-error Native JSON publication helper.
import { publishCatalogueBatch } from "../../scripts/lib/catalogue-publication.mjs";

describe("unified catalogue sync", () => {
  it("preserves concurrent edits to untouched manual JSON", async () => {
    const project = await mkdtemp(resolve(tmpdir(), "hsr-sync-test-"));
    try {
      await mkdir(resolve(project, "src/data"), { recursive: true });
      const manual = resolve(project, "src/data/catalogue-rules.json");
      await publishCatalogueBatch([{ path: manual, data: { manual: "old" } }]);
      await synchronizeCandidateBatch(
        catalogueSyncPlan(["mechanisms"]),
        async (_task: unknown, staging: string) => {
          await publishCatalogueBatch([
            { path: manual, data: { manual: "new user edit" } },
            { path: resolve(staging, "src/data/generated.json"), data: { generated: true } },
          ]);
        },
        vi.fn(),
        project,
      );
      expect(JSON.parse(await readFile(manual, "utf8"))).toEqual({ manual: "new user edit" });
      expect(
        JSON.parse(await readFile(resolve(project, "src/data/generated.json"), "utf8")),
      ).toEqual({ generated: true });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
  it.each(["edit", "delete", "create"])(
    "aborts the entire batch on a concurrent target %s",
    async (change) => {
      const project = await mkdtemp(resolve(tmpdir(), "hsr-sync-test-"));
      try {
        await mkdir(resolve(project, "src/data"), { recursive: true });
        const first = resolve(project, "src/data/a.json");
        const conflict = resolve(project, "src/data/z.json");
        await publishCatalogueBatch([
          { path: first, data: { version: "old" } },
          ...(change === "create" ? [] : [{ path: conflict, data: { version: "old" } }]),
        ]);
        const log = vi.fn();
        await expect(
          synchronizeCandidateBatch(
            catalogueSyncPlan(["mechanisms"]),
            async (_task: unknown, staging: string) => {
              await publishCatalogueBatch(
                ["a.json", "z.json"].map((name) => ({
                  path: resolve(staging, "src/data", name),
                  data: { version: "candidate" },
                })),
              );
              if (change === "delete") await unlink(conflict);
              else
                await publishCatalogueBatch([{ path: conflict, data: { version: "user edit" } }]);
            },
            log,
            project,
          ),
        ).rejects.toThrow("同步发布冲突");
        expect(JSON.parse(await readFile(first, "utf8"))).toEqual({ version: "old" });
        if (change === "delete")
          await expect(readFile(conflict)).rejects.toMatchObject({ code: "ENOENT" });
        else expect(JSON.parse(await readFile(conflict, "utf8"))).toEqual({ version: "user edit" });
        expect(log.mock.calls.some((call) => call[0].includes("同步完成"))).toBe(false);
      } finally {
        await rm(project, { recursive: true, force: true });
      }
    },
  );
  it("retains all original JSON if a later candidate fails", async () => {
    const project = await mkdtemp(resolve(tmpdir(), "hsr-sync-test-"));
    try {
      await mkdir(resolve(project, "src/data"), { recursive: true });
      const original = resolve(project, "src/data/original.json");
      await publishCatalogueBatch([{ path: original, data: { version: "old" } }]);
      const bytes = await readFile(original, "utf8");
      let count = 0;
      await expect(
        synchronizeCandidateBatch(
          catalogueSyncPlan(),
          async (_task: unknown, staging: string) => {
            if (count++ === 1) throw new Error("later fetch failed");
            await publishCatalogueBatch([
              { path: resolve(staging, "src/data/original.json"), data: { version: "candidate" } },
            ]);
            expect(await readFile(original, "utf8")).toBe(bytes);
          },
          vi.fn(),
          project,
        ),
      ).rejects.toThrow("later fetch failed");
      expect(await readFile(original, "utf8")).toBe(bytes);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
  it("later tasks read earlier candidates and publish only after success", async () => {
    const project = await mkdtemp(resolve(tmpdir(), "hsr-sync-test-"));
    try {
      await mkdir(resolve(project, "src/data"), { recursive: true });
      const original = resolve(project, "src/data/original.json");
      await publishCatalogueBatch([{ path: original, data: { version: "old" } }]);
      let count = 0;
      await synchronizeCandidateBatch(
        catalogueSyncPlan(["relic", "mechanisms"]),
        async (_task: unknown, staging: string) => {
          const candidate = resolve(staging, "src/data/original.json");
          if (count++ === 0)
            await publishCatalogueBatch([{ path: candidate, data: { version: "new" } }]);
          else expect(JSON.parse(await readFile(candidate, "utf8"))).toEqual({ version: "new" });
          expect(JSON.parse(await readFile(original, "utf8"))).toEqual({ version: "old" });
        },
        vi.fn(),
        project,
      );
      expect(JSON.parse(await readFile(original, "utf8"))).toEqual({ version: "new" });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
  it("defaults to all sources in dependency order", () => {
    expect(catalogueSyncPlan().map((task: { id: string }) => task.id)).toEqual([
      "relic",
      "light-cone",
      "mechanic",
      "mechanisms",
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
    expect(execute).toHaveBeenCalledTimes(4);
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
