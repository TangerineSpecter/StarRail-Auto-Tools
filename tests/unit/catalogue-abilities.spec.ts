import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import CharacterAbilities from "@/features/catalogue/CharacterAbilities.vue";
import CharacterDetail from "@/features/inventory/CharacterDetail.vue";
import BuildDashboard from "@/features/build-planner/BuildDashboard.vue";
import { buildPlanApi } from "@/shared/api/build-plan";
import { runtimeContextKey } from "@/shared/contracts/runtime";
import type { BuildDashboardEntry } from "@/types";
import {
  catalogueAbilityLevels,
  characterAbilityGroups,
  characterMechanicOwner,
  defaultCatalogueAbilityLevel,
  mechanicCatalogue,
  bundledCatalogueRules,
  reviewedCatalogueAbilityRuleCount,
  type OwnedMechanicCatalogue,
} from "@/shared/catalogue/mechanics";
import * as mechanics from "@/shared/catalogue/mechanics";
import type { CatalogueAbility, CatalogueOwner } from "@/shared/contracts/catalogue-rules";

function ability(overrides: Partial<CatalogueAbility> = {}): CatalogueAbility {
  return {
    id: "character:1402:skills:1",
    sourceNodeId: "1",
    ownerId: "character:1402",
    groupId: "skills",
    slot: "skill",
    name: "战技",
    descriptionTemplate: "造成{p1}点伤害。",
    levelBinding: "skill",
    levels: [1, 10, 15],
    sourceKind: "character",
    parameters: { p1: { kind: "table", levels: [1, 10, 15], values: [50, 100, 150] } },
    sourceHash: "source-hash",
    ...overrides,
  };
}
const character = { slug: "aglaea", name: "阿格莱雅", path: "记忆", element: "雷", image: null };
function owner(
  entry: Pick<CatalogueOwner, "id" | "sourceKind" | "slug" | "name" | "parentOwnerId">,
): CatalogueOwner {
  return {
    ...entry,
    gameId: entry.id,
    source: { url: "https://example.test/source", mapping: { slug: entry.slug, gameId: entry.id } },
    abilityIds: [],
  };
}
function catalogue(abilities: CatalogueAbility[] = [ability()]): OwnedMechanicCatalogue {
  return {
    schemaVersion: 1,
    owners: [
      owner({ id: "character:1402", sourceKind: "character", slug: "aglaea", name: "阿格莱雅" }),
      owner({
        id: "summon:1402:servant",
        sourceKind: "summon",
        slug: "aglaea/servant",
        name: "衣匠",
        parentOwnerId: "character:1402",
      }),
      owner({ id: "character:8001", sourceKind: "character", slug: "playerboy", name: "开拓者" }),
      owner({ id: "character:8007", sourceKind: "character", slug: "playerboy4", name: "开拓者" }),
    ],
    abilities,
  };
}
afterEach(() => vi.restoreAllMocks());

describe("mechanic catalogue ownership and levels", () => {
  it("bundles reviewed rule records without implying a complete mechanism audit", () => {
    expect(bundledCatalogueRules.length).toBeGreaterThan(0);
    const rule = bundledCatalogueRules.find((entry) => entry.status === "reviewed")!;
    const source = mechanicCatalogue.abilities.find((entry) => entry.id === rule.sourceRef)!;
    expect(reviewedCatalogueAbilityRuleCount(source)).toBeGreaterThan(0);
    expect(reviewedCatalogueAbilityRuleCount({ ...source, sourceHash: "changed-source" })).toBe(0);
    vi.spyOn(mechanics, "characterAbilityGroups").mockReturnValue([
      {
        id: "reviewed",
        ownerId: source.ownerId,
        sourceKind: source.sourceKind,
        label: "技能",
        abilities: [source, ability()],
      },
    ]);
    const wrapper = mount(CharacterAbilities, { props: { character } });
    expect(wrapper.findAll(".catalogue-ability-audit")[0]!.text()).toBe(
      `已记录 ${reviewedCatalogueAbilityRuleCount(source)} 条规则，完整机制待审核`,
    );
    expect(wrapper.findAll(".catalogue-ability-audit")[1]!.text()).toBe("机制待审核");
    wrapper.unmount();
  });
  it("integrates real source owners, grouped skill forms and summons", () => {
    const groups = characterAbilityGroups(character);
    expect(groups.find((group) => group.id.includes("skills:0"))?.label).toBe("主要技能 · 普攻");
    expect(groups.some((group) => group.label === "衣匠 · 行迹")).toBe(true);
    expect(groups.some((group) => group.sourceKind === "eidolon")).toBe(true);
    const sourceOwner = characterMechanicOwner({ slug: "playerboy4" });
    expect(sourceOwner?.id).toBe("character:8007");
    const remembrance = characterAbilityGroups({ slug: "playerboy4" });
    expect(remembrance.length).toBeGreaterThan(0);
    expect(
      remembrance.every(
        (group) =>
          group.ownerId === sourceOwner?.id ||
          mechanicCatalogue.owners?.some(
            (owner) => owner.id === group.ownerId && owner.parentOwnerId === sourceOwner?.id,
          ),
      ),
    ).toBe(true);
    const wrapper = mount(CharacterAbilities, { props: { character } });
    expect(wrapper.findAll("article").length).toBe(
      groups
        .filter((group) => group.sourceKind !== "trace" && !group.id.includes("servant-traces"))
        .reduce((count, group) => count + group.abilities.length, 0),
    );
    expect(
      wrapper.findAll("article p").every((description) => !description.text().includes("{p")),
    ).toBe(true);
    wrapper.unmount();
  });
  it("resolves exact source slug without inferring owner ID or translated name", () => {
    expect(characterMechanicOwner(character, catalogue())?.id).toBe("character:1402");
    expect(characterMechanicOwner({ slug: "playerboy4" }, catalogue())?.id).toBe("character:8007");
    expect(characterMechanicOwner({ slug: "unknown" }, catalogue())).toBeUndefined();
    expect(characterAbilityGroups(character, { schemaVersion: 1, abilities: [ability()] })).toEqual(
      [],
    );
    const ambiguous = catalogue();
    ambiguous.owners = [...ambiguous.owners, { ...ambiguous.owners[0]!, id: "another-owner" }];
    expect(characterMechanicOwner(character, ambiguous)).toBeUndefined();
  });

  it("groups only main skills, traces, eidolons and explicitly owned summons", () => {
    const entries = [
      ability(),
      ability({ id: "trace", sourceKind: "trace", groupId: "traces" }),
      ability({ id: "eidolon", sourceKind: "eidolon", groupId: "ranks" }),
      ability({
        id: "summon",
        sourceKind: "summon",
        ownerId: "summon:1402:servant",
        groupId: "servant-skills",
      }),
      ability({
        id: "summon-trace",
        sourceKind: "summon",
        ownerId: "summon:1402:servant",
        groupId: "servant-traces",
      }),
      ability({ id: "foreign", ownerId: "character:8007" }),
      ability({ id: "unmapped-summon", sourceKind: "summon", ownerId: "summon:1402:unmapped" }),
      ability({ id: "cone", sourceKind: "lightCone" }),
    ];
    const groups = characterAbilityGroups(character, catalogue(entries));
    expect(groups.map((group) => group.label)).toEqual([
      "主要技能",
      "行迹",
      "星魂",
      "衣匠 · 技能",
      "衣匠 · 行迹",
    ]);
    expect(groups.flatMap((group) => group.abilities.map((entry) => entry.id))).toEqual(
      entries.slice(0, 5).map((entry) => entry.id),
    );
    expect(characterAbilityGroups({ slug: "playerboy" }, catalogue(entries))).toEqual([]);
  });

  it("uses exactly the supplied levels including levels beyond base caps", () => {
    const entry = ability({ levels: [15, 10, 1, 10, 0, -1, 1.5, Infinity] });
    expect(catalogueAbilityLevels(entry)).toEqual([1, 10, 15]);
    expect(defaultCatalogueAbilityLevel(entry)).toBe(1);
    expect(defaultCatalogueAbilityLevel(ability({ levels: [12, 5] }))).toBe(5);
    expect(defaultCatalogueAbilityLevel(ability({ levels: [] }))).toBeNull();
  });
});

describe("CharacterAbilities", () => {
  it("hides character and summon traces without removing catalogue data or other abilities", () => {
    const entries = [
      ability(),
      ability({ id: "trace", sourceKind: "trace", groupId: "traces", name: "角色行迹" }),
      ability({ id: "eidolon", sourceKind: "eidolon", groupId: "ranks", name: "星魂效果" }),
      ability({
        id: "summon-skill",
        ownerId: "summon:1402:servant",
        sourceKind: "summon",
        groupId: "servant-skills",
        name: "忆灵技能",
      }),
      ability({
        id: "summon-trace",
        ownerId: "summon:1402:servant",
        sourceKind: "summon",
        groupId: "servant-traces",
        name: "忆灵行迹",
      }),
    ];
    const groups = characterAbilityGroups(character, catalogue(entries));
    expect(groups.some((group) => group.sourceKind === "trace")).toBe(true);
    vi.spyOn(mechanics, "characterAbilityGroups").mockReturnValue(groups);
    const wrapper = mount(CharacterAbilities, { props: { character } });
    expect(wrapper.text()).not.toContain("角色行迹");
    expect(wrapper.text()).not.toContain("忆灵行迹");
    expect(wrapper.text()).toContain("星魂效果");
    expect(wrapper.text()).toContain("忆灵技能");
    expect(wrapper.findAll(".catalogue-ability")).toHaveLength(3);
    wrapper.unmount();
  });
  it("selects real source levels independently and resets when the character changes", async () => {
    const groups = characterAbilityGroups(
      character,
      catalogue([ability(), ability({ id: "second", name: "第二技能" })]),
    );
    vi.spyOn(mechanics, "characterAbilityGroups").mockReturnValue(groups);
    const wrapper = mount(CharacterAbilities, { props: { character } });
    expect(
      wrapper
        .findAll("option")
        .slice(0, 3)
        .map((option) => option.attributes("value")),
    ).toEqual(["1", "10", "15"]);
    expect(wrapper.findAll("article")[0]!.text()).toContain("造成50点伤害。");
    await wrapper.find("select").setValue("15");
    expect(wrapper.findAll("article")[0]!.text()).toContain("造成150点伤害。");
    expect(wrapper.findAll("article")[1]!.text()).toContain("造成50点伤害。");
    await wrapper.setProps({ character: { ...character, slug: "playerboy" } });
    expect(wrapper.findAll("article")[0]!.text()).toContain("造成50点伤害。");
    wrapper.unmount();
  });

  it("renders source descriptions as escaped text and does not interpret HTML", () => {
    vi.spyOn(mechanics, "characterAbilityGroups").mockReturnValue(
      characterAbilityGroups(
        character,
        catalogue([ability({ descriptionTemplate: '<img src="x" onerror="alert(1)">\n{p1}' })]),
      ),
    );
    const wrapper = mount(CharacterAbilities, { props: { character } });
    expect(wrapper.find("article p").text()).toContain('<img src="x" onerror="alert(1)">');
    expect(wrapper.find("article img").exists()).toBe(false);
    wrapper.unmount();
  });

  it("uses the lowest provided level when 1 is unavailable and hides constant selectors", () => {
    vi.spyOn(mechanics, "characterAbilityGroups").mockReturnValue(
      characterAbilityGroups(
        character,
        catalogue([
          ability({ levels: [10, 15] }),
          ability({
            id: "fixed",
            name: "固定效果",
            levels: [],
            levelBinding: null,
            parameters: { p1: { kind: "constant", value: 20 } },
          }),
        ]),
      ),
    );
    const wrapper = mount(CharacterAbilities, { props: { character } });
    expect(wrapper.find("select").element.value).toBe("10");
    expect(wrapper.findAll("article")[0]!.text()).toContain("造成100点伤害。");
    expect(wrapper.findAll("article")[1]!.text()).toContain("造成20点伤害。");
    expect(wrapper.findAll("select")).toHaveLength(1);
    wrapper.unmount();
  });

  it("is optional when a source owner or abilities are absent", () => {
    vi.spyOn(mechanics, "characterAbilityGroups").mockReturnValue([]);
    const wrapper = mount(CharacterAbilities, { props: { character } });
    expect(wrapper.find("section").exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("reviewed standing rule availability", () => {
  it.each([false, true])(
    "keeps dashboard dependency warnings visible with available cards: %s",
    async (includeAvailable) => {
      function entry(
        characterId: number,
        name: string,
        templateId: number,
        superimposition = 1,
      ): BuildDashboardEntry {
        return {
          character: {
            characterId,
            name,
            level: 80,
            ascension: 6,
            equippedLightCone: { templateId, level: 80, ascension: 6, superimposition },
            equippedRelics: [],
          },
          plan: {
            characterId,
            cavernMode: "fourPiece",
            cavernSetA: 101,
            cavernSetB: null,
            planarSetId: 301,
            mainStats: {},
            targets: [],
            effectiveSubstats: [],
            note: "",
            substatWeights: {},
            minPotentialPct: 40,
            spdTarget: 0,
          },
          displayOrder: 0,
          pinned: false,
        };
      }
      vi.spyOn(buildPlanApi, "dashboard").mockResolvedValue([
        entry(1505, "绯英", 23058),
        entry(1211, "罗刹", 21000, 99),
        ...(includeAvailable ? [entry(1003, "姬子", 23000)] : []),
      ]);
      const wrapper = mount(BuildDashboard, {
        global: {
          provide: { [runtimeContextKey as symbol]: { notice: ref("") } },
          stubs: { InputText: true, Select: true },
        },
      });
      await flushPromises();
      const warnings = wrapper.get(".build-standing-warnings");
      expect(warnings.findAll("li")).toHaveLength(2);
      expect(warnings.text()).toContain("最大能量");
      expect(warnings.text()).toContain("装备来源规则尚未审核");
      expect(wrapper.findAll(".build-progress-row")).toHaveLength(includeAvailable ? 1 : 0);
      wrapper.unmount();
    },
  );
  it.each([
    { templateId: 23058, superimposition: 1, path: "Elation", reason: "最大能量" },
    { templateId: 21000, superimposition: 99, path: "Abundance", reason: "装备来源规则尚未审核" },
  ])(
    "does not show partial standing stats for $reason",
    ({ templateId, superimposition, path, reason }) => {
      const wrapper = mount(CharacterDetail, {
        props: {
          detail: {
            characterId: 1005,
            name: "卡芙卡",
            path,
            level: 80,
            ascension: 6,
            eidolon: 0,
            abilityVersion: "1",
            equippedLightCone: {
              templateId,
              name: "光锥",
              level: 80,
              ascension: 6,
              superimposition,
            },
            equippedRelics: [],
          },
        },
        global: { stubs: { CharacterScorePanel: true } },
      });
      expect(wrapper.text()).toContain(reason);
      expect(wrapper.find(".standing-stat-grid").exists()).toBe(false);
      wrapper.unmount();
    },
  );
});
