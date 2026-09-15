#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptOwner, fetchPageConfig, validateMechanicCatalogue } from "./lib/catalogue-source.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const specs = [
  {
    kind: "character",
    list: "characters",
    detail: "character",
    file: "characters.json",
    key: "characters",
  },
  {
    kind: "lightcone",
    list: "equipment",
    detail: "lightcone",
    file: "light-cones.json",
    key: "lightCones",
  },
  { kind: "relic", list: "relics", detail: "relics", file: "relic-sets.json", key: "sets" },
];

async function readOptional(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

/** Return a complete validated candidate and report without publishing anything. */
export async function synchronizeMechanics({
  fetchConfig = fetchPageConfig,
  projectRoot = process.env.CATALOGUE_CANDIDATE_ROOT || root,
  onProgress = () => {},
} = {}) {
  const previous = await readOptional(resolve(projectRoot, "src/data/catalogue-mechanics.json"), {
    abilities: [],
    owners: [],
  });
  const owners = [],
    abilities = [],
    manifest = [],
    changes = { added: [], changed: [], deleted: [] };
  for (const spec of specs) {
    const bundled = JSON.parse(await readFile(resolve(projectRoot, "src/data", spec.file), "utf8"))[
      spec.key
    ];
    const listUrl = `https://starrailstation.com/cn/${spec.list}`;
    const config = await fetchConfig(listUrl);
    if (!Array.isArray(config.entries) || !config.entries.length)
      throw new Error(`Invalid list ${listUrl}`);
    const entries = new Map();
    for (const entry of config.entries) {
      if (
        typeof entry.pageId !== "string" ||
        !/^[a-zA-Z0-9_-]+$/.test(entry.pageId) ||
        entries.has(entry.pageId)
      )
        throw new Error(`Invalid/duplicate source slug ${listUrl}`);
      entries.set(entry.pageId, {
        ...entry,
        id: spec.kind === "character" ? entry.rankKey : Number(entry.pageId),
      });
    }
    const oldSlugs = new Set(bundled.map((entry) => String(entry.slug ?? entry.id)));
    const allSlugs = [...new Set([...oldSlugs, ...entries.keys()])].sort();
    const results = new Array(allSlugs.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (next < allSlugs.length) {
          const index = next++,
            slug = allSlugs[index];
          const url = `https://starrailstation.com/cn/${spec.detail}/${slug}`;
          const entry = entries.get(slug);
          let detail;
          try {
            detail = await fetchConfig(url);
          } catch (error) {
            if (!entry && [404, 410].includes(error.status)) {
              onProgress(`${spec.kind} retired ${slug}`);
              continue;
            }
            throw error;
          }
          // Fetch retired bundled details too, but active membership is authoritative.
          if (entry) {
            try {
              results[index] = adaptOwner(spec.kind, entry, detail, url);
            } catch (error) {
              throw new Error(`${url}: ${error.message}`);
            }
          }
          onProgress(`${spec.kind} ${index + 1}/${allSlugs.length}`);
        }
      }),
    );
    for (const result of results.filter(Boolean)) {
      owners.push(...result.owners);
      abilities.push(...result.abilities);
    }
    manifest.push({
      kind: spec.kind,
      url: listUrl,
      count: entries.size,
      mapping: [...entries.values()].map((entry) => ({
        slug: entry.pageId,
        gameId: String(entry.id),
        pathId: entry.baseTypeId ?? null,
      })),
      added: [...entries.keys()].filter((slug) => !oldSlugs.has(slug)),
      deleted: [...oldSlugs].filter((slug) => !entries.has(slug)),
    });
  }
  for (const collection of [owners, abilities])
    if (new Set(collection.map((item) => item.id)).size !== collection.length)
      throw new Error("Duplicate normalized identity");
  owners.sort((a, b) => a.id.localeCompare(b.id));
  abilities.sort((a, b) => a.id.localeCompare(b.id));
  const old = new Map(previous.abilities.map((item) => [item.id, item]));
  for (const ability of abilities) {
    if (!old.has(ability.id)) changes.added.push(ability.id);
    else if (old.get(ability.id).sourceHash !== ability.sourceHash)
      changes.changed.push(ability.id);
    old.delete(ability.id);
  }
  changes.deleted = [...old.keys()];
  const data = { schemaVersion: 1, abilities, owners };
  validateMechanicCatalogue(data);
  const fingerprints = Object.fromEntries(
    abilities.map((ability) => [ability.id, ability.sourceHash]),
  );
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    manifest,
    changes,
    counts: {
      owners: owners.length,
      abilities: abilities.length,
      pending: abilities.length,
      reviewed: 0,
    },
    auditStatus: "pending",
  };
  return {
    data,
    report,
    fingerprints,
    entries: [
      { path: resolve(projectRoot, "src/data/catalogue-mechanics.json"), data },
      { path: resolve(projectRoot, "src/data/catalogue-mechanics-report.json"), data: report },
      {
        path: resolve(projectRoot, "src/data/catalogue-mechanics-fingerprints.json"),
        data: fingerprints,
      },
    ],
  };
}

export async function main(args = process.argv.slice(2), options = {}) {
  const supported = new Set(["--dry-run", "--skip-images", "--allow-pending"]);
  for (const arg of args) if (!supported.has(arg)) throw new Error(`Unknown option ${arg}`);
  // Public raw synchronization deliberately never reads/writes executable manual rules.
  const candidate = await synchronizeMechanics({
    onProgress: (message) => console.error(message),
    ...options,
  });
  if (!args.includes("--dry-run")) {
    const { publishCatalogueBatch } = await import("./lib/catalogue-publication.mjs");
    await publishCatalogueBatch(candidate.entries);
  }
  console.log(
    JSON.stringify(
      {
        counts: candidate.report.counts,
        changes: Object.fromEntries(
          Object.entries(candidate.report.changes).map(([key, values]) => [key, values.length]),
        ),
        auditStatus: candidate.report.auditStatus,
      },
      null,
      2,
    ),
  );
  return candidate;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
