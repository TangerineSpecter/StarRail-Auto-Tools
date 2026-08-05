import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import InventoryList from "@/features/inventory/InventoryList.vue";
import type { CharacterListItem, RelicListItem } from "@/types";

const relic: RelicListItem = {
  itemId: 7,
  setId: 101,
  setName: "云无留迹的过客",
  name: "过客的逢春木簪",
  slot: "head",
  rarity: 5,
  level: 15,
  mainStat: "HPDelta",
  mainStatValue: 705.6,
  subStats: [],
  locked: false,
  discard: false,
  location: "",
};

const character: CharacterListItem = {
  characterId: 1001,
  name: "三月七",
  path: "Preservation",
  level: 80,
  ascension: 6,
  eidolon: 6,
  hasBuildPlan: true,
  abilityVersion: 1,
  source: "network",
  updatedAt: 0,
};

describe("InventoryList", () => {
  it("renders relics with the compact inventory table contract", async () => {
    const wrapper = mount(InventoryList, {
      props: {
        kind: "relic",
        items: [relic],
        selectedIds: new Set<number>(),
        allSelected: false,
        appending: false,
        busy: false,
      },
      global: {
        stubs: {
          Checkbox: { template: '<input type="checkbox" />' },
          Button: { template: "<button><slot /></button>" },
        },
      },
    });

    expect(wrapper.find("table.inventory-table--relic").exists()).toBe(true);
    expect(wrapper.find(".relic-name-cell .relic-icon-box").exists()).toBe(true);
    expect(wrapper.find(".relic-card-grid").exists()).toBe(false);

    await wrapper.get("button.row-action").trigger("click");
    expect(wrapper.emitted("detail")).toEqual([["relic", 7]]);
  });

  it("distinguishes characters with a saved build plan", () => {
    const wrapper = mount(InventoryList, {
      props: {
        kind: "character",
        items: [character],
        selectedIds: new Set<number>(),
        allSelected: false,
        appending: false,
        busy: false,
      },
    });

    expect(wrapper.get(".character-build-action").classes()).toContain("has-build-plan");
    expect(wrapper.get(".character-stars").text()).toBe("★★★★");
  });

  it("uses path icon assets and resolves multi-path Trailblazer avatars", () => {
    const trailblazers: CharacterListItem[] = [
      {
        ...character,
        characterId: 8001,
        name: "开拓者",
        path: "Destruction",
        hasBuildPlan: false,
      },
      {
        ...character,
        characterId: 8003,
        name: "开拓者",
        path: "Preservation",
        hasBuildPlan: false,
      },
    ];
    const wrapper = mount(InventoryList, {
      props: {
        kind: "character",
        items: trailblazers,
        selectedIds: new Set<number>(),
        allSelected: false,
        appending: false,
        busy: false,
      },
    });

    const cards = wrapper.findAll(".character-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.get(".path-icon").attributes("src")).toBe(
      "/character-icons/paths/毁灭.webp",
    );
    expect(cards[0]!.get(".path-text").text()).toBe("毁灭");
    expect(cards[0]!.get(".character-card-avatar").attributes("src")).toContain("playerboy");
    expect(cards[1]!.get(".path-icon").attributes("src")).toBe(
      "/character-icons/paths/存护.webp",
    );
    expect(cards[1]!.get(".character-card-avatar").attributes("src")).toContain("playerboy2");
  });
});
