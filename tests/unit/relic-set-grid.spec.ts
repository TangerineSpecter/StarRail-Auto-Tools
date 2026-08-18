import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RelicSetGrid from "@/features/catalogue/RelicSetGrid.vue";
import type { RelicSetCatalogueEntry } from "@/types";

const cavern: RelicSetCatalogueEntry = {
  id: 101,
  name: "云无留迹的过客",
  kind: "cavern",
  effects: { twoPiece: "治疗量提高 10%。", fourPiece: "释放战技或终结技时回复生命。" },
  image: null,
};
const planar: RelicSetCatalogueEntry = {
  id: 301,
  name: "太空封印站",
  kind: "planar",
  effects: { twoPiece: "攻击力提高 12%。", fourPiece: "" },
  image: null,
};

describe("RelicSetGrid", () => {
  it("shows owned relic counts and hides set ids", () => {
    const wrapper = mount(RelicSetGrid, {
      props: {
        sets: [cavern, planar],
        ownedCounts: new Map([
          [101, 8],
          [301, 0],
        ]),
      },
    });

    expect(wrapper.text()).toContain("持有 8 件");
    expect(wrapper.text()).toContain("未持有");
    expect(wrapper.text()).toContain("云无留迹的过客");
    expect(wrapper.text()).toContain("太空封印站");
    expect(wrapper.text()).not.toContain("#101");
    expect(wrapper.text()).not.toContain("#301");
    expect(wrapper.text()).not.toMatch(/#\d+/);
    expect(wrapper.findAll(".catalogue-card-media .catalogue-owned")).toHaveLength(2);
    expect(wrapper.get(".catalogue-card-media .catalogue-owned").classes()).not.toContain("empty");
    expect(wrapper.get(".catalogue-card-media .catalogue-owned b").text()).toBe("8");
    expect(wrapper.findAll(".catalogue-owned.empty")).toHaveLength(1);
  });
});
