import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import StandingStatEmptyCard from "@/features/inventory/StandingStatEmptyCard.vue";
import type { CharacterDetailData } from "@/features/inventory/detail-types";

describe("StandingStatEmptyCard", () => {
  it("renders status reason and 3 compact tags when light cone is missing", () => {
    const detail: CharacterDetailData = {
      characterId: 1001,
      name: "三月七",
      path: "Preservation",
      level: 80,
      ascension: 6,
      eidolon: 0,
      abilityVersion: "1.0",
      equippedLightCone: null,
      equippedRelics: [],
    };

    const wrapper = mount(StandingStatEmptyCard, {
      props: {
        detail,
        reason: "未装备光锥，无法汇总完整站街属性。",
      },
    });

    expect(wrapper.text()).toContain("数据待补全");
    expect(wrapper.text()).toContain("未装备光锥，无法汇总完整站街属性。");
    expect(wrapper.text()).toContain("角色 80 级");
    expect(wrapper.text()).toContain("已达标");
    expect(wrapper.text()).toContain("装备光锥");
    expect(wrapper.text()).toContain("光锥 80 级");
    expect(wrapper.text()).toContain("未达标");
  });

  it("renders unmet status tags when character level is below 80", () => {
    const detail: CharacterDetailData = {
      characterId: 1001,
      name: "三月七",
      path: "Preservation",
      level: 70,
      ascension: 5,
      eidolon: 0,
      abilityVersion: "1.0",
      equippedLightCone: null,
      equippedRelics: [],
    };

    const wrapper = mount(StandingStatEmptyCard, {
      props: {
        detail,
        reason: "角色与已装备光锥需均为 Lv.80、满突破后展示。",
      },
    });

    expect(wrapper.text()).toContain("未达标");
    expect(wrapper.text()).toContain("角色 80 级");
  });
});
