#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBailuMechanicRules } from "./lib/bailu-mechanic-rules.mjs";
import { publishCatalogueBatch } from "./lib/catalogue-publication.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Compile authored rules without touching unrelated hand-maintained records. */
export function buildCatalogueRules(catalogue, previous, evaluateCoverage) {
  const authored = createBailuMechanicRules(catalogue);
  if (authored.rejected.length)
    throw new Error(`Reviewed source changed: ${JSON.stringify(authored.rejected)}`);
  const managed = previous.compiled?.bailu ?? { ruleIds: [], auditRefs: [], deltaIds: [] };
  const merge = (old, generated, managedIds, key) => {
    const keep = old.filter((entry) => !managedIds.includes(entry[key]));
    const ids = new Set(keep.map((entry) => entry[key]));
    for (const entry of generated) {
      if (ids.has(entry[key]))
        throw new Error(`Refusing to overwrite manual record: ${entry[key]}`);
      ids.add(entry[key]);
    }
    return [...keep, ...generated];
  };
  const library = {
    ...previous,
    schemaVersion: 1,
    rules: merge(previous.rules ?? [], authored.rules, managed.ruleIds, "id"),
    audits: merge(previous.audits ?? [], authored.audits, managed.auditRefs, "sourceRef"),
    accountLevelDeltas: merge(
      previous.accountLevelDeltas ?? [],
      authored.accountLevelDeltas,
      managed.deltaIds,
      "id",
    ),
    compiled: {
      ...previous.compiled,
      bailu: {
        ruleIds: authored.rules.map((r) => r.id),
        auditRefs: authored.audits.map((a) => a.sourceRef),
        deltaIds: authored.accountLevelDeltas.map((d) => d.id),
      },
    },
  };
  const report = JSON.parse(
    JSON.stringify(evaluateCoverage(catalogue, library.rules, library.audits)),
  );
  const errors = report.validationIssues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(`Invalid compiled rules: ${JSON.stringify(errors)}`);
  const invalidAudits = report.issues.filter((issue) =>
    [
      "duplicate-audit",
      "invalid-source",
      "invalid-clause",
      "invalid-exclusion",
      "unknown-rule",
      "invalid-rule",
      "wrong-source",
      "unknown-source",
    ].includes(issue.reason),
  );
  if (invalidAudits.length)
    throw new Error(`Invalid audit references: ${JSON.stringify(invalidAudits)}`);
  library.review = { ...previous.review, complete: report.complete };
  return { library, report };
}

export async function main(args = process.argv.slice(2)) {
  for (const arg of args)
    if (!["--dry-run", "--check", "--allow-pending"].includes(arg))
      throw new Error(`Unknown option ${arg}`);
  const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
  const catalogue = await read("src/data/catalogue-mechanics.json");
  const previous = await read("src/data/catalogue-rules.json");
  const { createServer } = await import("vite");
  const server = await createServer({
    root,
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
  });
  try {
    const { evaluateCatalogueCoverage } = await server.ssrLoadModule(
      "/src/shared/utils/catalogue-coverage.ts",
    );
    const candidate = buildCatalogueRules(catalogue, previous, evaluateCatalogueCoverage);
    if (args.includes("--check")) {
      if (
        !isDeepStrictEqual(candidate.library, previous) ||
        !isDeepStrictEqual(candidate.report, await read("src/data/catalogue-audit-report.json"))
      )
        throw new Error("Bundled rules/report differ from authored rules; rebuild explicitly");
    } else if (!args.includes("--dry-run")) {
      if (!candidate.report.complete && !args.includes("--allow-pending"))
        throw new Error(
          "Full audit remains incomplete; use --allow-pending for an explicitly partial publication",
        );
      await publishCatalogueBatch([
        { path: resolve(root, "src/data/catalogue-rules.json"), data: candidate.library },
        { path: resolve(root, "src/data/catalogue-audit-report.json"), data: candidate.report },
      ]);
    }
    console.log(
      JSON.stringify(
        {
          complete: candidate.report.complete,
          rules: candidate.library.rules.length,
          summary: candidate.report.summary,
        },
        null,
        2,
      ),
    );
    return candidate;
  } finally {
    await server.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
