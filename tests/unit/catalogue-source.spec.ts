import { describe, expect, it } from "vitest";
// @ts-expect-error The maintenance script intentionally has no TypeScript dependency.
import {
  adaptOwner,
  normalizeDescription,
  normalizeParams,
  parsePageConfig,
  semanticHash,
  stripHtml,
  validateMechanicCatalogue,
} from "../../scripts/lib/catalogue-source.mjs";
import mechanicsJson from "../../src/data/catalogue-mechanics.json";
import fingerprintsJson from "../../src/data/catalogue-mechanics-fingerprints.json";
import { resolveAbility, validateCatalogueRules } from "../../src/shared/utils/catalogue-rules";
import type { MechanicCatalogue } from "../../src/shared/contracts/catalogue-rules";

const skill = {
  id: 51,
  name: "Attack",
  typeDescHash: "普攻",
  tagHash: "单攻",
  descHash: "<nobr>#1[i]%</nobr><br/>#2[f1] + #3[i]",
  levelData: [
    { level: 1, params: [0.123456789, 2.5, 7] },
    { level: 2, params: [0.2, 3.5, 8] },
  ],
};
const entry = { rankKey: 1402, pageId: "aglaea", name: "Aglaea", baseTypeId: 8 };

describe("public PAGE_CONFIG mechanic normalization", () => {
  it("parses quoted braces, escapes and whitespace without evaluating scripts", () => {
    const config = { name: 'x } { " \\', nested: { a: 1 } };
    expect(
      parsePageConfig(`<script>window.PAGE_CONFIG = ${JSON.stringify(config)};evil()</script>`),
    ).toEqual(config);
    expect(() => parsePageConfig("window.PAGE_CONFIG = {oops}")).toThrow();
    expect(() => parsePageConfig("window.PAGE_CONFIG = foo()")).toThrow();
  });

  it("strips rich text preserving explicit breaks and token formats", () => {
    expect(normalizeDescription(skill.descHash)).toBe(
      "{p1:percentInteger}\n{p2:fixed1} + {p3:integer}",
    );
    expect(normalizeDescription("#1[f2] #2[f2]%")).toBe("{p1:fixed2} {p2:percentFixed2}");
    expect(stripHtml("<p>A&amp;B</p><div>&#x4e2d;&nbsp;C</div><script>bad()</script>")).toBe(
      "A&B\n中 C",
    );
    expect(() => normalizeDescription("#1[f9]")).toThrow();
  });

  it("preserves every numeric source value and level without rounding", () => {
    const normalized = normalizeParams(skill);
    expect(normalized.source).toEqual(skill.levelData);
    expect(normalized.parameters.p1).toEqual({
      kind: "table",
      levels: [1, 2],
      values: [0.123456789, 0.2],
    });
    expect(normalizeParams({ params: [0.026999999, 0] }).parameters).toEqual({
      p1: { kind: "constant", value: 0.026999999 },
      p2: { kind: "constant", value: 0 },
    });
    expect(
      normalizeParams({
        levelData: [
          { level: 1, params: [3] },
          { level: 2, params: [3] },
        ],
      }),
    ).toMatchObject({ levels: [1, 2], parameters: { p1: { kind: "constant", value: 3 } } });
    expect(() => normalizeParams({ levelData: [{ level: 1, params: [NaN] }] })).toThrow();
    expect(() =>
      normalizeParams({
        levelData: [
          { level: 1, params: [1] },
          { level: 1, params: [2] },
        ],
      }),
    ).toThrow();
  });

  it("rounds fractional integer display and preserves percentage trailing precision", () => {
    const adapted = adaptOwner(
      "lightcone",
      { id: 20008 },
      {
        skill: {
          id: 20008,
          descHash: "#1[i] #2[f1]% #3[f2]% #4[i]%",
          params: [7.5, 0.09, 0.091, 0.075],
        },
      },
      "x",
    );
    const ability = adapted.abilities[0] as MechanicCatalogue["abilities"][number];
    expect(ability.parameters.p1).toEqual({ kind: "constant", value: 7.5 });
    expect(resolveAbility(ability).description).toBe("8 9.0% 9.10% 8%");
    expect(
      resolveAbility({
        ...ability,
        descriptionTemplate: "{p1:integer}",
        parameters: { p1: { kind: "constant", value: -7.5 } },
      }).description,
    ).toBe("-7");
  });

  it("adapts actual skills/ranks/tree and servant field shapes", () => {
    const config = {
      skills: [skill],
      skillGrouping: [[51]],
      ranks: [{ id: 1, name: "Rank", descHash: "#1[i]", params: [3] }],
      skillTreePoints: [
        {
          id: 100,
          embedBonusSkill: { id: 52, descHash: "#1[i]%", levelData: [{ level: 1, params: [0.1] }] },
          children: [
            {
              id: 101,
              embedBuff: { id: 53, statusList: [{ key: "DEF", value: 0.026999999 }] },
              children: [],
            },
          ],
        },
      ],
      servant: {
        name: "Garmentmaker",
        skills: [
          {
            id: 61,
            name: "Summon",
            skillDesc: "#1[i]%",
            typeDesc: "忆灵技",
            icon: "abc",
            tag: "扩散",
            levelData: [
              { level: 1, params: [0.5] },
              { level: 2, params: [0.6] },
            ],
          },
        ],
        skillGrouping: [[61]],
        skillTreePoints: [
          {
            id: 62,
            embedServantSkill: { id: 62, levelData: [{ level: 1, params: [] }] },
            children: [],
          },
        ],
      },
    };
    const result = adaptOwner("character", entry, config, "https://example.test/aglaea");
    expect(result.owners).toHaveLength(2);
    expect(result.owner.variantKey).toBe("hsr/1402/remembrance/base");
    expect(result.owners[1].parentOwnerId).toBe("character:1402");
    expect(result.abilities).toHaveLength(6);
    expect(result.abilities[0]).toMatchObject({
      sourceKind: "character",
      slot: "basic",
      groupId: "skills:0",
      sourceNodeId: "51",
      levelBinding: "basic",
    });
    expect(
      result.abilities.find((item: { sourceNodeId: string }) => item.sourceNodeId === "61"),
    ).toMatchObject({
      ownerId: "summon:1402:servant",
      sourceKind: "summon",
      slot: "skill",
      type: "忆灵技",
      tag: "扩散",
      icon: "abc",
      levelBinding: "memosprite:skill",
    });
    expect(() =>
      adaptOwner("character", entry, { skills: [{ ...skill, descHash: "#4[i]" }] }, "x"),
    ).toThrow("Unbound");
  });

  it("adapts light cone skill and relic useNum separately from metadata", () => {
    expect(adaptOwner("lightcone", { id: 20000 }, { skill }, "x").abilities[0]).toMatchObject({
      slot: "passive",
      levelBinding: "superimposition",
    });
    expect(adaptOwner("lightcone", { id: 20000 }, { skill }, "x").abilities[0].sourceKind).toBe(
      "lightCone",
    );
    const relic = adaptOwner(
      "relic",
      { id: 101 },
      {
        skills: [
          { useNum: 2, desc: "#1[i]%", params: [0.1] },
          { useNum: 4, desc: "Fixed", params: [] },
        ],
      },
      "x",
    );
    expect(relic.owner.abilityIds).toEqual(["relic:101:set:2", "relic:101:set:4"]);
    expect(relic.abilities.map((ability: { slot: string }) => ability.slot)).toEqual([
      "twoPiece",
      "fourPiece",
    ]);
  });

  it("hashes semantic content independent of names, icons and timestamps", () => {
    const ability = adaptOwner("lightcone", { id: 20000 }, { skill }, "x").abilities[0];
    expect(
      semanticHash({ ...ability, icon: "different", name: "Renamed", syncedAt: "later" }),
    ).toBe(ability.sourceHash);
    expect(semanticHash({ ...ability, descriptionTemplate: "changed" })).not.toBe(
      ability.sourceHash,
    );
    expect(semanticHash({ ...ability, type: "战技" })).not.toBe(ability.sourceHash);
    expect(semanticHash({ ...ability, ownerId: "lightcone:20001" })).not.toBe(ability.sourceHash);
    expect(semanticHash({ ...ability, sourceNodeId: "different" })).not.toBe(ability.sourceHash);
  });

  it("validates the actual full generated snapshot and evaluator contract", () => {
    const catalogue = mechanicsJson as unknown as MechanicCatalogue;
    expect(validateMechanicCatalogue(catalogue)).toMatchObject({
      valid: true,
      owners: catalogue.owners?.length,
    });
    const validation = validateCatalogueRules(catalogue, []);
    expect(Object.keys(fingerprintsJson)).toHaveLength(catalogue.abilities.length);
    const fingerprints = fingerprintsJson as Readonly<Record<string, string>>;
    expect(validation.valid).toBe(true);
    expect(validation.coverage).toEqual({
      total: catalogue.abilities.length,
      covered: 0,
      reviewed: 0,
    });
    for (const ability of catalogue.abilities) {
      expect(fingerprints[ability.id]).toBe(ability.sourceHash);
      if (ability.sourceKind === "lightCone")
        expect(ability).toMatchObject({ slot: "passive", levelBinding: "superimposition" });
      if (ability.sourceKind === "relic")
        expect(ability.slot).toBe(ability.sourceNodeId === "2" ? "twoPiece" : "fourPiece");
      for (const alias of [
        "description",
        "sourceParams",
        "semanticHash",
        "grouping",
        "sourceId",
        "group",
      ])
        expect(Object.hasOwn(ability, alias)).toBe(false);
    }
  });
});
