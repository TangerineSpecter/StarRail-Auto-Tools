import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BuildPlanDrawer from "@/features/build-planner/BuildPlanDrawer.vue";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  recommend: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/shared/api/build-plan", () => ({ buildPlanApi: api }));

describe("BuildPlanDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({
      characterId: 1001,
      cavernMode: "fourPiece",
      cavernSetA: 101,
      cavernSetB: null,
      planarSetId: 301,
      mainStats: {},
      targets: [{ statKey: "SPD", target: 134, minimum: 120, priority: 1 }],
      effectiveSubstats: ["SPD"],
      note: "遗器优先速度鞋",
      substatWeights: { SPD: 1 },
      minPotentialPct: 40,
      spdTarget: 134,
    });
    api.save.mockResolvedValue(undefined);
    api.recommend.mockResolvedValue({
      current: [],
      recommended: null,
      recommendedProgress: null,
      message: "",
    });
  });

  it("renders the note editor for the loaded plan and closes on Escape", async () => {
    const close = vi.fn();
    const wrapper = mount(BuildPlanDrawer, {
      props: {
        characterId: 1001,
        onClose: close,
        onError: vi.fn(),
        onNotice: vi.fn(),
        onDeleted: vi.fn(),
      },
      global: {
        stubs: {
          Button: true,
          Checkbox: true,
          InputNumber: true,
          Select: true,
          RelicSetCardPicker: true,
          Textarea: {
            props: ["modelValue"],
            emits: ["update:modelValue"],
            template:
              '<textarea class="build-note-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          },
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("说明");
    // Head/Hands mains are game-fixed; UI must not offer checkboxes for those slots.
    expect(wrapper.text()).toContain("头部 / 手部主词条由游戏固定");
    const legends = wrapper.findAll(".main-stat-grid legend").map((node) => node.text());
    expect(legends).not.toContain("头部");
    expect(legends).not.toContain("手部");
    expect(legends).toEqual(expect.arrayContaining(["躯干", "脚部", "位面球", "连结绳"]));
    expect(wrapper.get(".build-note-section").exists()).toBe(true);
    expect(wrapper.get(".build-note-input").element).toHaveProperty("value", "遗器优先速度鞋");
    expect(wrapper.get(".build-note-hint").text()).toContain("i");
    expect(
      wrapper.get(".build-note-input").attributes("aria-label") ?? "毕业目标说明",
    ).toBeTruthy();
    // Note field stays at the bottom of the scrollable form content.
    const sections = wrapper.findAll(".build-scroll > .build-section");
    expect(sections.at(-1)?.classes()).toContain("build-note-section");

    await wrapper.get(".build-note-input").setValue("双暴优先，速度 134");
    expect(wrapper.get(".build-note-input").element).toHaveProperty("value", "双暴优先，速度 134");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true }));
    expect(close).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledOnce();

    wrapper.unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledOnce();
  });
});
