import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LightConeGrid from "@/features/catalogue/LightConeGrid.vue";
import type { LightConeCatalogueEntry } from "@/types";

const lightCone: LightConeCatalogueEntry = {
  id: 23024,
  name: "到不了的彼岸",
  rarity: 5,
  path: "毁灭",
  image: null,
};

describe("LightConeGrid", () => {
  it("shows owned counts without template ids", async () => {
    const wrapper = mount(LightConeGrid, {
      props: {
        lightCones: [lightCone],
        ownedCounts: new Map([[23024, 2]]),
      },
    });

    expect(wrapper.text()).toContain("到不了的彼岸");
    expect(wrapper.text()).toContain("持有 2 把");
    expect(wrapper.get(".catalogue-owned b").text()).toBe("2");
    expect(wrapper.get(".lightcone-catalogue-body").exists()).toBe(true);
    expect(wrapper.get(".lightcone-catalogue-stars").text()).toBe("★★★★★");
    expect(wrapper.text()).not.toContain("#23024");
    expect(wrapper.text()).not.toContain("23024");

    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("select")).toEqual([[lightCone]]);
  });
});
