#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { publishCatalogueBatch } from "./lib/catalogue-publication.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
for (const arg of process.argv.slice(2))
  if (arg !== "--write-report") throw new Error(`Unknown option ${arg}`);
async function optionalJson(path, fallback) {
  try {
    return JSON.parse(await readFile(resolve(root, path), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

// Load the same TypeScript validator used by the client; do not maintain a second engine.
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
  const catalogue = await optionalJson("src/data/catalogue-mechanics.json", null);
  if (!catalogue) throw new Error("Missing bundled source catalogue");
  const library = await optionalJson("src/data/catalogue-rules.json", { rules: [], audits: [] });
  if (library.schemaVersion !== undefined && library.schemaVersion !== catalogue.schemaVersion)
    throw new Error("Source and rules schema version mismatch");
  const report = evaluateCatalogueCoverage(catalogue, library.rules, library.audits ?? []);
  if (process.argv.includes("--write-report")) {
    await publishCatalogueBatch([
      { path: resolve(root, "src/data/catalogue-audit-report.json"), data: report },
    ]);
  }
  console.log(
    JSON.stringify(
      {
        complete: report.complete,
        summary: report.summary,
        byKind: report.byKind,
        validationErrors: report.validationIssues.filter((issue) => issue.severity === "error"),
        validationWarnings: report.validationIssues.filter((issue) => issue.severity === "warning")
          .length,
      },
      null,
      2,
    ),
  );
  if (!report.complete) process.exitCode = 1;
} finally {
  await server.close();
}
