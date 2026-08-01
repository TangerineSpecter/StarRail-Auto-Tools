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
    let editor!: ReturnType<typeof useBuildPlanEditor>;
    const Host = defineComponent({
      setup() {
        editor = useBuildPlanEditor({
          characterId: ref(1001),
          setError: vi.fn(),
          setNotice: vi.fn(),
          onDeleted: vi.fn(),
        });
        return () => null;
      },
    });
    mount(Host);
    await flushPromises();

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
});
