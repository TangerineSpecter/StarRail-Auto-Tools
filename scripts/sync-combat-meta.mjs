#!/usr/bin/env node
/**
 * Incrementally enrich existing `src/data/catalogue-mechanics.json` with combat metadata
 * (maxEnergy, skill energyGain, energyCost, toughness) from StarRailStation without
 * altering existing owners, abilities, or frozen semantic hashes.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractSkillCombatMeta,
  fetchPageConfig,
  validateMechanicCatalogue,
} from "./lib/catalogue-source.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const mechanicsPath = resolve(root, "src/data/catalogue-mechanics.json");

export async function enrichCombatMeta({ fetchConfig = fetchPageConfig } = {}) {
  const data = JSON.parse(await readFile(mechanicsPath, "utf8"));
  const charOwners = data.owners.filter((owner) => owner.sourceKind === "character");
  const abilitiesByOwner = new Map();
  for (const ability of data.abilities) {
    const list = abilitiesByOwner.get(ability.ownerId) ?? [];
    list.push(ability);
    abilitiesByOwner.set(ability.ownerId, list);
  }

  let updatedOwners = 0;
  let updatedAbilities = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < charOwners.length) {
        const owner = charOwners[next++];
        const cfg = await fetchConfig(owner.source.url);
        if (typeof cfg.spRequirement === "number" && Number.isFinite(cfg.spRequirement)) {
          owner.maxEnergy = cfg.spRequirement;
          updatedOwners += 1;
        }
        const skillById = new Map((cfg.skills ?? []).map((s) => [String(s.id), s]));
        for (const ability of abilitiesByOwner.get(owner.id) ?? []) {
          if (ability.sourceKind !== "character") continue;
          const rawSkill = skillById.get(String(ability.sourceNodeId));
          if (!rawSkill) continue;
          const combat = extractSkillCombatMeta(rawSkill);
          if (combat && Object.keys(combat).length > 0) {
            ability.combat = combat;
            updatedAbilities += 1;
          }
        }
      }
    }),
  );

  validateMechanicCatalogue(data);
  await writeFile(mechanicsPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return { updatedOwners, updatedAbilities };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await enrichCombatMeta();
  console.log(
    `Enriched ${result.updatedOwners} characters and ${result.updatedAbilities} skills with combat metadata.`,
  );
}
