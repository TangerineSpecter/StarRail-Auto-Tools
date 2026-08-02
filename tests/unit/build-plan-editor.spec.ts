import { defineComponent, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBuildPlanEditor } from "@/features/build-planner/useBuildPlanEditor";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  recommend: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/shared/api/build-plan", () => ({ buildPlanApi: api }));
const setError = vi.fn();
const setNotice = vi.fn();

let editor!: ReturnType<typeof useBuildPlanEditor>;
const Host = defineComponent({
  setup() {
    editor = useBuildPlanEditor({
      characterId: ref(1001),
      setError,
      setNotice,
      onDeleted: vi.fn(),
    });
    return () => null;
  },
});

async function mountEditor() {
  mount(Host);
  await flushPromises();
}

describe("useBuildPlanEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(null);
    api.save.mockResolvedValue(undefined);
    api.recommend.mockResolvedValue({
      current: [],
      recommended: null,
      recommendedProgress: null,
      message: "",
    });
  });

  it("keeps the original target defaults and rewrites priorities after sorting", async () => {
    await mountEditor();

    editor.addTarget();
    editor.addTarget();
    expect(editor.plan.targets[0]).toMatchObject({
      statKey: "CRIT DMG",
      target: 160,
      minimum: 140,
      priority: 1,
    });
    editor.plan.targets[1].statKey = "SPD";
    editor.moveTargetTo(1, 0);
    expect(editor.plan.targets.map((target) => [target.statKey, target.priority])).toEqual([
      ["SPD", 1],
      ["CRIT DMG", 2],
    ]);
  });

  it("exposes calculation progress and ignores repeated calculation requests", async () => {
    let finishCalculation!: () => void;
    api.recommend.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCalculation = () =>
            resolve({ current: [], recommended: null, recommendedProgress: null, message: "" });
        }),
    );
    await mountEditor();

    void editor.calculate();
    void editor.calculate();
    expect(editor.calculating.value).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.recommend).toHaveBeenCalledTimes(1);

    finishCalculation();
    await flushPromises();
    expect(editor.calculating.value).toBe(false);
  });

  it("keeps the two 2-piece set selections distinct and blocks invalid saves", async () => {
    await mountEditor();

    editor.setCavernSetA(101);
    editor.plan.cavernSetB = 102;
    editor.setCavernMode("twoPlusTwo");
    editor.setCavernSetA(102);
    expect(editor.plan.cavernSetB).not.toBe(editor.plan.cavernSetA);

    editor.plan.cavernSetB = editor.plan.cavernSetA;
    await editor.save();
    expect(setError).toHaveBeenCalledWith("2+2 件套不能选择相同的遗器套装");
    expect(api.save).not.toHaveBeenCalled();
  });

  it("does not claim the recommendation was updated when calculation fails after saving", async () => {
    api.recommend.mockRejectedValue(new Error("推荐服务不可用"));
    await mountEditor();

    await editor.save();

    expect(api.save).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith("Error: 推荐服务不可用");
    expect(setNotice).not.toHaveBeenCalledWith("培养方案已保存，推荐结果已更新");
  });
});
