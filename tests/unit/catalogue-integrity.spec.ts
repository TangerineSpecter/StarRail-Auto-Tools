import { describe, expect, it } from "vitest";
import { mechanicCatalogue } from "@/shared/catalogue/mechanics";
import { resolveAbility, validateCatalogueRules } from "@/shared/utils/catalogue-rules";

describe("bundled complete source catalogue", () => {
  it("has unique owner mappings and resolves every supplied level without missing tokens", () => {
    const owners = mechanicCatalogue.owners ?? [];
    const ids = new Set(owners.map((owner) => owner.id));
    expect(ids.size).toBe(owners.length);
    expect(owners.filter((owner) => owner.sourceKind === "character")).toHaveLength(97);
    for (const ability of mechanicCatalogue.abilities) {
      expect(ids.has(ability.ownerId), ability.id).toBe(true);
      expect(ability.sourceNodeId, ability.id).toBeTruthy();
      for (const level of ability.levels) {
        const result = resolveAbility(ability, level);
        expect(result.description, `${ability.id}/${level}`).not.toMatch(/\{p\d+|#\d+\[|\?/);
        expect(
          Object.values(result.parameters).every(
            (value) => typeof value === "number" && Number.isFinite(value),
          ),
          `${ability.id}/${level}`,
        ).toBe(true);
      }
    }
    expect(validateCatalogueRules(mechanicCatalogue, []).valid).toBe(true);
  });
  it("retains levels above ten and isolates summons from character equipment identities", () => {
    expect(mechanicCatalogue.abilities.some((ability) => ability.levels.includes(15))).toBe(true);
    for (const owner of mechanicCatalogue.owners ?? []) {
      if (owner.sourceKind !== "summon") continue;
      expect(owner.parentOwnerId).toBeTruthy();
      expect(owner.id).not.toBe(owner.parentOwnerId);
      expect(
        owner.abilityIds.every((id) =>
          mechanicCatalogue.abilities.some(
            (ability) => ability.id === id && ability.ownerId === owner.id,
          ),
        ),
      ).toBe(true);
    }
  });
});
