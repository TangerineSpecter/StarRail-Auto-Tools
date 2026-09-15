// @vitest-environment node
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publishCatalogueBatch } from "../../scripts/lib/catalogue-publication.mjs";

describe("publishCatalogueBatch", () => {
  let directory: string;
  let targets: string[];
  const original = Buffer.from('{ "old": true }\r\n');
  const failure = new Error("injected I/O failure");
  const entries = () => targets.map((path, index) => ({ path, data: { index } }));

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), "catalogue-publication-"));
    targets = [join(directory, "relic.json"), join(directory, "characters.json")];
    for (const path of targets) await fs.writeFile(path, original);
    await fs.writeFile(join(directory, "inventory.json"), original);
  });

  afterEach(async () => {
    // Remove only explicit files in this test's own temporary directory.
    for (const name of await fs.readdir(directory)) await fs.unlink(join(directory, name));
    await fs.rmdir(directory);
  });

  async function expectUnchanged() {
    for (const path of targets) expect(await fs.readFile(path)).toEqual(original);
    expect(await fs.readFile(join(directory, "inventory.json"))).toEqual(original);
    expect((await fs.readdir(directory)).sort()).toEqual([
      "characters.json",
      "inventory.json",
      "relic.json",
    ]);
  }

  it("stages every JSON serially before the first rename and leaves inventory untouched", async () => {
    const events: string[] = [];
    await publishCatalogueBatch(entries(), {
      ...fs,
      async open(path: string, flags: string) {
        events.push(path.endsWith(".stage") ? "stage" : "backup");
        return fs.open(path, flags);
      },
      async rename(from: string, to: string) {
        events.push("rename");
        await fs.rename(from, to);
      },
    });
    expect(events).toEqual(["stage", "backup", "stage", "backup", "rename", "rename"]);
    for (const [index, path] of targets.entries()) {
      expect(await fs.readFile(path, "utf8")).toBe(`${JSON.stringify({ index }, null, 2)}\n`);
    }
    expect(await fs.readFile(join(directory, "inventory.json"))).toEqual(original);
    expect(await fs.readdir(directory)).toHaveLength(3);
  });

  it("rejects normalized duplicate paths and serialization failures before any I/O", async () => {
    await expect(
      publishCatalogueBatch([entries()[0], { path: join(directory, "./relic.json"), data: {} }]),
    ).rejects.toThrow("Duplicate target");
    await expect(
      publishCatalogueBatch([entries()[0], { path: targets[1], data: 1n }]),
    ).rejects.toThrow();
    await expect(publishCatalogueBatch([{ path: "", data: {} }])).rejects.toThrow("Invalid target");
    await expectUnchanged();
  });

  it.each([1, 2, 3, 4])("does not publish when staging/backup write %i fails", async (failAt) => {
    let writes = 0;
    await expect(
      publishCatalogueBatch(entries(), {
        ...fs,
        async open(path: string, flags: string) {
          const file = await fs.open(path, flags);
          return {
            async writeFile(data: string | Buffer) {
              writes += 1;
              if (writes === failAt) {
                await file.writeFile("partial");
                throw failure;
              }
              await file.writeFile(data);
            },
            close: () => file.close(),
          };
        },
      }),
    ).rejects.toBe(failure);
    await expectUnchanged();
  });

  it.each([1, 2])("restores exact original buffers when commit rename %i fails", async (failAt) => {
    let renames = 0;
    await expect(
      publishCatalogueBatch(entries(), {
        ...fs,
        async rename(from: string, to: string) {
          renames += 1;
          if (renames === failAt) throw failure;
          await fs.rename(from, to);
        },
      }),
    ).rejects.toBe(failure);
    await expectUnchanged();
  });

  it("falls back to exact buffers when backup restoration rename also fails", async () => {
    let renames = 0;
    await expect(
      publishCatalogueBatch(entries(), {
        ...fs,
        async rename(from: string, to: string) {
          if (++renames > 1) throw failure;
          await fs.rename(from, to);
        },
      }),
    ).rejects.toBe(failure);
    await expectUnchanged();
  });

  it("removes newly created targets when a later commit fails", async () => {
    await fs.unlink(targets[0]);
    await expect(
      publishCatalogueBatch(entries(), {
        ...fs,
        async rename(from: string, to: string) {
          if (to === targets[1]) throw failure;
          await fs.rename(from, to);
        },
      }),
    ).rejects.toBe(failure);
    await expect(fs.readFile(targets[0])).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(targets[1])).toEqual(original);
    expect(await fs.readdir(directory)).toHaveLength(2);
  });

  it("preserves the publication exception and backup if restoration cannot complete", async () => {
    let renames = 0;
    await expect(
      publishCatalogueBatch(entries(), {
        ...fs,
        async rename(from: string, to: string) {
          if (++renames > 1) throw failure;
          await fs.rename(from, to);
        },
        async writeFile() {
          throw new Error("restoration failed");
        },
      }),
    ).rejects.toBe(failure);
    const backups = (await fs.readdir(directory)).filter((name) => name.endsWith(".backup"));
    expect(backups).toHaveLength(1);
    expect(await fs.readFile(join(directory, backups[0]))).toEqual(original);
  });
});
