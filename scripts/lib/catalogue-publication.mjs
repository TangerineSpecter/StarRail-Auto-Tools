import * as fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

/**
 * Publish JSON entries ({ path, data }) after all collection has succeeded.
 * Only caller-specified catalogue files are touched; images are outside this batch.
 * This provides rollback on I/O errors, not crash atomicity or concurrent-writer isolation.
 * Failed restoration retains its explicit backup for manual recovery.
 */
export async function publishCatalogueBatch(entries, io = fs) {
  const paths = new Set();
  const batch = entries.map(({ path, data }) => {
    if (typeof path !== "string" || !path.trim()) throw new TypeError("Invalid target path");
    const target = resolve(path);
    if (paths.has(target)) throw new Error(`Duplicate target path: ${target}`);
    paths.add(target);
    const json = JSON.stringify(data, null, 2);
    if (json === undefined) throw new TypeError(`Invalid JSON data: ${target}`);
    const token = randomUUID();
    return {
      target,
      contents: `${json}\n`,
      staging: `${target}.${token}.stage`,
      backup: `${target}.${token}.backup`,
      original: null,
      committed: false,
      keepBackup: false,
    };
  });
  const owned = new Set();
  try {
    for (const entry of batch) {
      try {
        entry.original = await io.readFile(entry.target);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      // Exclusive opens ensure cleanup never removes a pre-existing sidecar.
      for (const [path, contents] of [
        [entry.staging, entry.contents],
        ...(entry.original === null ? [] : [[entry.backup, entry.original]]),
      ]) {
        const file = await io.open(path, "wx");
        owned.add(path);
        try {
          await file.writeFile(contents);
        } catch (error) {
          try {
            await file.close();
          } catch {
            // Preserve the write failure even if closing the handle also fails.
          }
          throw error;
        }
        await file.close();
      }
    }
    for (const entry of batch) {
      await io.rename(entry.staging, entry.target);
      entry.committed = true;
    }
  } catch (error) {
    for (const entry of [...batch].reverse()) {
      if (!entry.committed) continue;
      try {
        if (entry.original === null) await io.unlink(entry.target);
        else {
          try {
            await io.rename(entry.backup, entry.target);
          } catch {
            // A rename fault must not prevent exact-byte restoration.
            await io.writeFile(entry.target, entry.original);
          }
        }
      } catch {
        entry.keepBackup = true;
      }
    }
    throw error;
  } finally {
    for (const entry of batch) {
      for (const path of [entry.staging, ...(entry.keepBackup ? [] : [entry.backup])]) {
        if (!owned.has(path)) continue;
        try {
          await io.unlink(path);
        } catch {
          // Cleanup is best-effort and must never mask the publication exception.
        }
      }
    }
  }
}
