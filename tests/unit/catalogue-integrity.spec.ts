import { describe, expect, it } from "vitest";
import { mechanicCatalogue } from "@/shared/catalogue/mechanics";
import relicSets from "@/data/relic-sets.json";
import { resolveAbility, validateCatalogueRules } from "@/shared/utils/catalogue-rules";

describe("bundled complete source catalogue", () => {
  it("has unique owner mappings and resolves every supplied level without missing tokens", () => {
    const owners = mechanicCatalogue.owners ?? [];
    const ids = new Set(owners.map((owner) => owner.id));
    expect(ids.size).toBe(owners.length);
    expect(owners.filter((owner) => owner.sourceKind === "character")).toHaveLength(99);
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
  it("keeps control characters out of imported relic set names", () => {
    for (const set of relicSets.sets)
      expect(
        [...set.name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
      ).toBe(false);
    expect(relicSets.sets.find((set) => set.id === 321)?.name).toBe("妖精织梦的乐园");
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

  it("includes synced maxEnergy and combat toughness/energy metadata for characters", () => {
    const owners = mechanicCatalogue.owners ?? [];
    const characters = owners.filter((owner) => owner.sourceKind === "character");
    expect(characters.every((owner) => typeof owner.maxEnergy === "number")).toBe(true);
    const firefly = characters.find((owner) => owner.id === "character:1310");
    expect(firefly?.maxEnergy).toBe(240);
    const enhancedSkill = mechanicCatalogue.abilities.find(
      (ability) => ability.id === "character:1310:skills:109552",
    );
    expect(enhancedSkill?.combat?.toughness).toMatchObject({ main: 30, adjacent: 15 });
    const lingshaSkill = mechanicCatalogue.abilities.find(
      (ability) => ability.id === "character:1222:skills:28585",
    );
    expect(lingshaSkill?.combat).toMatchObject({
      energyGain: 30,
      toughness: { main: 10, perHit: true },
    });
  });
});
