#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { compileMechanisms } from "./lib/compile-mechanisms.mjs";
import { publishCatalogueBatch } from "./lib/catalogue-publication.mjs";

const root = process.env.CATALOGUE_CANDIDATE_ROOT || fileURLToPath(new URL("..", import.meta.url));
export async function main(args = process.argv.slice(2)) {
  if (args.some((arg) => !["--check", "--dry-run"].includes(arg)))
    throw new Error("Unsupported argument");
  const catalogue = JSON.parse(
    await readFile(resolve(root, "src/data/catalogue-mechanics.json"), "utf8"),
  );
  const { library, report } = compileMechanisms(catalogue);
  const entries = [
    { path: resolve(root, "src/data/catalogue-mechanisms.json"), data: library },
    { path: resolve(root, "src/data/catalogue-mechanisms-report.json"), data: report },
  ];
  if (args.includes("--check")) {
    for (const entry of entries) {
      if (!isDeepStrictEqual(JSON.parse(await readFile(entry.path, "utf8")), entry.data))
        throw new Error(`Stale generated file: ${entry.path}`);
    }
  } else if (!args.includes("--dry-run")) await publishCatalogueBatch(entries);
  console.log(
    `遍历 ${report.abilities} 条能力、${report.clauses} 条描述；可执行 ${report.executableClauses} 条，语义覆盖尚未完成。`,
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
