import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RelicPotentialRadar from "@/features/build-planner/RelicPotentialRadar.vue";

describe("RelicPotentialRadar", () => {
  it("renders wasted upgrade count badges on equipped vertices with a legend", () => {
    const wrapper = mount(RelicPotentialRadar, {
      props: {
        averagePotentialPct: 64,
        weakSlot: "Head",
        pieces: [
          {
            slot: "Head",
            potentialPct: 45,
            letterGrade: "A",
            effectiveRolls: 4,
            wastedUpgrades: 2,
          },
          {
            slot: "Hands",
            potentialPct: 72,
            letterGrade: "SSS",
            effectiveRolls: 6,
            wastedUpgrades: 0,
          },
          {
            slot: "Body",
            potentialPct: 61,
            letterGrade: "SS",
            effectiveRolls: 5,
            wastedUpgrades: 1,
          },
        ],
      },
    });

    const badges = wrapper.findAll(".radar-label-count");
    expect(badges).toHaveLength(3);
    expect(badges.map((node) => node.text())).toEqual(["2", "0", "1"]);
    expect(badges[0]!.classes()).toContain("is-weak");
    expect(badges[1]!.classes()).toContain("wasted-clean");
    expect(badges[2]!.classes()).toContain("wasted-mild");
    expect(wrapper.get(".radar-wasted-legend").text()).toContain("角标数字为强化歪词条次数");
  });

  it("hides axis label count badges and legend when wastedUpgrades are not provided", () => {
    const wrapper = mount(RelicPotentialRadar, {
      props: {
        averagePotentialPct: 50,
        pieces: [{ slot: "Head", potentialPct: 50, letterGrade: "S" }],
      },
    });

    expect(wrapper.findAll(".radar-label-count")).toHaveLength(0);
    expect(wrapper.find(".radar-wasted-legend").exists()).toBe(false);
  });
});
