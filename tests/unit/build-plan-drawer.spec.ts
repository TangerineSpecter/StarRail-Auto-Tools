import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BuildPlanDrawer from "@/features/build-planner/BuildPlanDrawer.vue";
import type { CharacterBuildAdvice, CharacterBuildPlan } from "@/types";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  optimizerContext: vi.fn(),
  delete: vi.fn(),
}));

const advisor = vi.hoisted(() => ({
  adviseCharacter: vi.fn(),
  cachedCharacterAdvice: vi.fn(),
}));

vi.mock("@/shared/api/build-plan", () => ({ buildPlanApi: api }));
vi.mock("@/shared/api/advisor", () => ({ advisorApi: advisor }));

const savedPlan: CharacterBuildPlan = {
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
  gameVersion: "4.2",
  updatedAt: new Date(2026, 5, 10, 9, 15).getTime(),
};

describe("BuildPlanDrawer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.get.mockResolvedValue(savedPlan);
    api.save.mockResolvedValue(undefined);
    api.optimizerContext.mockResolvedValue(null);
    advisor.cachedCharacterAdvice.mockResolvedValue(null);
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

    expect(wrapper.text()).toContain("查询当前版本配装");
    expect(wrapper.text()).toContain("AI 推荐对照");
    expect(wrapper.get(".build-plan-version-pill").text()).toContain("v4.2");
    expect(wrapper.get(".build-plan-updated-text").text()).toContain("2026-06-10 09:15");
    expect(wrapper.text()).toContain("说明");
    expect(wrapper.text()).toContain("全局优化选项");
    expect(wrapper.text()).toContain("同时计算散件对照");
    // Head/Hands mains are game-fixed; UI must not offer checkboxes for those slots.
    expect(wrapper.text()).toContain("头部 / 手部主词条由游戏固定");
    const legends = wrapper.findAll(".main-stat-grid legend").map((node) => node.text());
    expect(legends).not.toContain("头部");
    expect(legends).not.toContain("手部");
    expect(legends).toEqual(expect.arrayContaining(["躯干", "脚部", "位面球", "连结绳"]));
    expect(wrapper.get(".build-note-hint").text()).toContain("直接展示");
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

  it("restores the last report against the saved plan without searching or applying again", async () => {
    const report: CharacterBuildAdvice = {
      characterId: 1001,
      displayName: "三月七",
      summary: "推荐优先搭配速度鞋。",
      insights: [{ tag: "配速", detail: "速度达到 134。" }],
      sources: [{ title: "参考攻略", url: "https://example.com/build" }],
      warnings: [],
      plan: { ...savedPlan, note: "推荐备注" },
      searchedAt: 1,
    };
    advisor.adviseCharacter.mockResolvedValueOnce(report);
    const openDrawer = () =>
      mount(BuildPlanDrawer, {
        props: { characterId: 1001 },
        global: {
          stubs: {
            Button: true,
            Checkbox: true,
            InputNumber: true,
            Select: true,
            RelicSetCardPicker: true,
            Textarea: true,
          },
        },
      });
    const first = openDrawer();
    await flushPromises();
    await first.get(".advisor-query").trigger("click");
    await flushPromises();
    expect(first.get(".advisor-summary").text()).toBe(report.summary);
    first.unmount();

    advisor.cachedCharacterAdvice.mockResolvedValueOnce(report);
    api.get.mockResolvedValueOnce({ ...savedPlan, note: "后来保存的备注" });
    const reopened = openDrawer();
    await flushPromises();
    expect(advisor.cachedCharacterAdvice).toHaveBeenLastCalledWith(1001);
    expect(advisor.adviseCharacter).toHaveBeenCalledTimes(1);
    expect(reopened.get(".advisor-summary").text()).toBe(report.summary);
    expect(reopened.get(".advisor-insights").text()).toContain("速度达到 134");
    expect(reopened.get(".advice-source-link").text()).toContain("参考攻略");
    expect(reopened.get(".build-advice-pane").text()).toContain("后来保存的备注");
    expect(api.save).not.toHaveBeenCalled();

    advisor.adviseCharacter.mockRejectedValueOnce(new Error("检索失败"));
    await reopened.get(".advisor-query").trigger("click");
    await flushPromises();
    expect(reopened.get(".advisor-error").text()).toContain("检索失败");
    expect(reopened.get(".advisor-summary").text()).toBe(report.summary);
    reopened.unmount();
  });
});
