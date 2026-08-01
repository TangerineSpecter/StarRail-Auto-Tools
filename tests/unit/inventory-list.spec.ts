import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import InventoryList from "@/features/inventory/InventoryList.vue";
import type { RelicListItem } from "@/types";

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
});
