import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import InventoryList from "@/features/inventory/InventoryList.vue";
import { lightCones as demoLightCones, relics as demoRelics } from "@/shared/dev/mobile-fixtures";
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
  substats: [],
  locked: false,
  discard: false,
  location: "",
  equippedCharacterId: null,
  source: "network",
  updatedAt: 0,
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
  it("opens mobile light cone cards directly and preserves distinct equipped path variants", async () => {
    const items = [
      { ...demoLightCones[0]!, itemId: 11, location: "三月七", equippedCharacterId: 1224 },
      { ...demoLightCones[1]!, itemId: 12, location: "开拓者", equippedCharacterId: 8006 },
      {
        ...demoLightCones[2]!,
        itemId: 13,
        templateId: -1,
        location: "",
        equippedCharacterId: null,
        superimposition: 5,
      },
    ];
    const wrapper = mount(InventoryList, {
      props: {
        kind: "lightCone",
        items,
        selectedIds: new Set<number>(),
        allSelected: false,
        appending: false,
        busy: false,
        readOnly: true,
        activeDetailId: 12,
      },
    });
    expect(wrapper.find(".lightcone-cell-action").exists()).toBe(false);
    expect(wrapper.find(".check-cell").exists()).toBe(false);
    const cards = wrapper.findAll(".inventory-lightcone-row");
    expect(cards[0]!.attributes("role")).toBe("button");
    expect(cards[1]!.attributes("aria-current")).toBe("true");
    expect(cards[0]!.get(".lightcone-card-owner").text()).toBe("三月七·巡猎");
    expect(cards[1]!.get(".lightcone-card-owner").text()).toBe("开拓者·同谐");
    expect(cards[0]!.get(".lightcone-card-path").text()).toBe("智识");
    expect(cards[0]!.get(".lightcone-card-stars").text()).toBe("★★★★★");
    expect(cards[0]!.get(".lightcone-card-cover img").attributes("src")).toContain("23000");
    expect(cards[2]!.get(".lightcone-card-cover-fallback").text()).toBe("光锥");
    expect(cards[2]!.get(".lightcone-card-unequipped").text()).toBe("未装备");
    expect(cards[2]!.get(".lightcone-card-rank").classes()).toContain("is-max");
    await cards[0]!.trigger("click");
    await cards[1]!.trigger("keydown.enter");
    await cards[2]!.trigger("keydown.space");
    expect(wrapper.emitted("detail")).toEqual([
      ["lightCone", 11],
      ["lightCone", 12],
      ["lightCone", 13],
    ]);
    wrapper.unmount();
  });

  it("retains the desktop light cone table and its detail button", async () => {
    const wrapper = mount(InventoryList, {
      props: {
        kind: "lightCone",
        items: [demoLightCones[0]!],
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
    expect(wrapper.find(".inventory-lightcone-card").exists()).toBe(false);
    expect(wrapper.find(".check-cell").exists()).toBe(true);
    await wrapper.get(".lightcone-cell-action button").trigger("click");
    expect(wrapper.emitted("detail")).toEqual([["lightCone", demoLightCones[0]!.itemId]]);
    wrapper.unmount();
  });

  it("shows +3, +4 and MAX highlights on the first three mobile demo cards", () => {
    const items = demoRelics.slice(0, 3);
    const wrapper = mount(InventoryList, {
      props: {
        kind: "relic",
        items,
        selectedIds: new Set<number>(),
        allSelected: false,
        appending: false,
        busy: false,
        readOnly: true,
      },
    });

    for (const [index, hits] of [3, 4, 5].entries()) {
      const item = items[index]!;
      expect(item.substats.reduce((sum, stat) => sum + stat.count, 0)).toBe(9);
      expect(item.substats.every((stat) => stat.key !== item.mainStat)).toBe(true);
      const card = wrapper.findAll(".inventory-relic-row")[index]!;
      expect(card.get(`.hit-${hits} .hit-count-badge`).text()).toBe(
        hits === 5 ? "MAX" : `+${hits}`,
      );
    }
  });

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

  it("shows multipath equipped owner with path suffix", () => {
    const wrapper = mount(InventoryList, {
      props: {
        kind: "relic",
        items: [
          {
            ...relic,
            location: "开拓者",
            equippedCharacterId: 8006,
          },
          {
            ...relic,
            itemId: 8,
            location: "三月七",
            equippedCharacterId: 1224,
          },
        ],
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

    const tags = wrapper.findAll(".relic-equip-tag");
    expect(tags[0]!.text()).toBe("开拓者·同谐");
    expect(tags[1]!.text()).toBe("三月七·巡猎");
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
    expect(cards[0]!.get(".character-name").text()).toBe("开拓者·毁灭");
    expect(cards[1]!.get(".character-name").text()).toBe("开拓者·存护");
    expect(cards[0]!.get(".path-icon").attributes("src")).toBe("/character-icons/paths/毁灭.webp");
    expect(cards[0]!.get(".path-text").text()).toBe("毁灭");
    expect(cards[0]!.get(".character-card-avatar").attributes("src")).toContain("playerboy");
    expect(cards[1]!.get(".path-icon").attributes("src")).toBe("/character-icons/paths/存护.webp");
    expect(cards[1]!.get(".character-card-avatar").attributes("src")).toContain("playerboy2");
  });
});

it("keeps detail access but removes editing and selection in the mobile viewer", async () => {
  const props = {
    kind: "character" as const,
    items: [character],
    selectedIds: new Set<number>(),
    allSelected: false,
    appending: false,
    busy: false,
    readOnly: true,
  };
  const wrapper = mount(InventoryList, { props });
  expect(wrapper.find(".character-build-action").exists()).toBe(false);
  await wrapper.get(".character-card").trigger("click");
  expect(wrapper.emitted("detail")).toEqual([["character", 1001]]);
  const relicWrapper = mount(InventoryList, {
    props: {
      ...props,
      kind: "relic",
      items: [
        {
          ...relic,
          slot: "Head",
          name: "云无留迹的过客·头部",
          locked: true,
          location: "开拓者",
          equippedCharacterId: 8006,
        },
      ],
    },
  });
  expect(relicWrapper.find(".check-cell").exists()).toBe(false);
  expect(relicWrapper.get(".relic-icon-box").classes()).toContain("rarity-5");
  expect(relicWrapper.get(".item-name").text()).toBe("云无留迹的过客");
  expect(relicWrapper.get(".relic-slot-tag").text()).toBe("头部");
  expect(relicWrapper.find(".relic-set-subtitle").exists()).toBe(false);
  expect(relicWrapper.get(".relic-rarity-stars").text()).toBe("★★★★★");
  expect(relicWrapper.get(".relic-state-tag.is-locked").text()).toBe("已锁定");
  expect(relicWrapper.find(".relic-cell-equip").exists()).toBe(false);
  expect(relicWrapper.find(".relic-cell-action").exists()).toBe(false);

  await relicWrapper.get("tr.inventory-relic-row").trigger("click");
  expect(relicWrapper.emitted("detail")).toEqual([["relic", 7]]);
  await relicWrapper.get("tr.inventory-relic-row").trigger("keydown.enter");
  await relicWrapper.get("tr.inventory-relic-row").trigger("keydown.space");
  expect(relicWrapper.emitted("detail")).toEqual([
    ["relic", 7],
    ["relic", 7],
    ["relic", 7],
  ]);
});
