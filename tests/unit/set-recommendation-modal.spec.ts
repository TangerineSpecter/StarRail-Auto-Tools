import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import SetRecommendationModal from "@/features/catalogue/SetRecommendationModal.vue";

type TargetCharacter = {
  characterId: number;
  name: string;
  mainStats: Record<string, string[]>;
  effectiveSubstats: string[];
};

const { recommendedCharactersForSet } = vi.hoisted(() => ({
  recommendedCharactersForSet: vi.fn(),
}));

vi.mock("@/shared/api/build-plan", () => ({
  buildPlanApi: { recommendedCharactersForSet },
}));

const sets = {
  cavern: {
    id: 101,
    name: "遗器套装 A",
    kind: "cavern" as const,
    effects: { twoPiece: "", fourPiece: "" },
    image: null,
  },
  planar: {
    id: 201,
    name: "位面饰品 B",
    kind: "planar" as const,
    effects: { twoPiece: "", fourPiece: "" },
    image: null,
  },
};

const characters = [
  { slug: "a", name: "角色 A", element: "火", path: "毁灭", image: null },
  { slug: "b", name: "角色 B", element: "冰", path: "巡猎", image: null },
];

describe("SetRecommendationModal", () => {
  it("keeps the latest set's result when earlier request resolves late", async () => {
    let resolveFirst!: (value: TargetCharacter[]) => void;
    const firstRequest = new Promise<TargetCharacter[]>((resolve) => {
      resolveFirst = resolve;
    });
    recommendedCharactersForSet
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce([
        { characterId: 2, name: "角色 B", mainStats: {}, effectiveSubstats: [] },
      ]);

    const wrapper = mount(SetRecommendationModal, {
      props: { set: sets.cavern, characters },
    });
    await wrapper.setProps({ set: sets.planar });
    await flushPromises();
    resolveFirst([{ characterId: 1, name: "角色 A", mainStats: {}, effectiveSubstats: [] }]);
    await flushPromises();

    expect(wrapper.text()).toContain("位面饰品 B");
    expect(wrapper.text()).toContain("角色 B");
    expect(wrapper.text()).not.toContain("角色 A");
  });

  it("closes on Escape", async () => {
    recommendedCharactersForSet.mockResolvedValueOnce([]);
    const wrapper = mount(SetRecommendationModal, {
      props: { set: sets.cavern, characters },
    });
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("renders an empty state for a set without saved targets", async () => {
    recommendedCharactersForSet.mockResolvedValueOnce([]);
    const wrapper = mount(SetRecommendationModal, {
      props: { set: sets.cavern, characters },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("尚未有角色将此套装设为毕业目标");
  });

  it("shows combined keep stats while retaining the target character list", async () => {
    recommendedCharactersForSet.mockResolvedValueOnce([
      {
        characterId: 1,
        name: "角色 A",
        effectiveSubstats: ["CRIT Rate", "SPD"],
        mainStats: { Body: ["CRIT Rate"], Feet: ["SPD"] },
      },
      {
        characterId: 2,
        name: "角色 B",
        effectiveSubstats: ["CRIT DMG", "SPD"],
        mainStats: { Body: ["CRIT DMG"], Feet: ["ATK%"] },
      },
    ]);

    const wrapper = mount(SetRecommendationModal, {
      props: { set: sets.cavern, characters },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("建议保留词条");
    expect(wrapper.text()).toContain("暴击率");
    expect(wrapper.text()).toContain("暴击伤害");
    expect(wrapper.text()).toContain("躯干主属性");
    expect(wrapper.text()).toContain("设为目标的角色");
    expect(wrapper.text()).toContain("角色 A");
    expect(wrapper.text()).toContain("角色 B");
  });
});
