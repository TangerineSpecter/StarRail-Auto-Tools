import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AbilityExplanation from "@/features/catalogue/AbilityExplanation.vue";
import type { CatalogueAbility } from "@/shared/contracts/catalogue-rules";

vi.mock("@/data/catalogue-mechanisms.json", () => ({
  default: {
    definitions: [
      {
        sourceRef: "a",
        sourceHash: "current",
        ownerId: "character:1001",
        unusedParameters: ["p2"],
        clauses: [
          {
            id: "clause",
            start: 0,
            end: 15,
            parameterRefs: ["p1"],
            activation: "unresolvedCondition",
            operations: [{ kind: "unsupported", limitation: "事件条件尚未编译" }],
          },
        ],
      },
    ],
  },
}));
const ability: CatalogueAbility = {
  id: "a",
  ownerId: "character:1001",
  sourceHash: "current",
  sourceNodeId: "node",
  sourceKind: "character",
  groupId: "skill",
  slot: "skill",
  name: "技能",
  descriptionTemplate: "{p1:percent}伤害",
  levelBinding: "skill",
  levels: [1, 10],
  parameters: {
    p1: { kind: "table", levels: [1, 10], values: [1, 2] },
    p2: { kind: "constant", value: 4 },
  },
};

describe("catalogue clause explanation", () => {
  it("loads on expansion and shows exact parameters plus honest limitations", async () => {
    const wrapper = mount(AbilityExplanation, { props: { ability, level: 1 } });
    expect(wrapper.find("dl").exists()).toBe(false);
    (wrapper.element as HTMLDetailsElement).open = true;
    await wrapper.trigger("toggle");
    await vi.dynamicImportSettled();
    await flushPromises();
    expect(wrapper.text()).toContain("非精确审核");
    expect(wrapper.text()).toContain("事件条件尚未编译");
    expect(wrapper.text()).toContain("来源保留");
    await wrapper.setProps({ level: 10 });
    expect(wrapper.find("dd").text()).toBe("2");
    await wrapper.setProps({ ability: { ...ability, id: "other" } });
    expect(wrapper.find("dl").exists()).toBe(false);
    wrapper.unmount();
  });
  it("does not reuse a definition with a stale content hash", async () => {
    const wrapper = mount(AbilityExplanation, {
      props: { ability: { ...ability, sourceHash: "changed" }, level: 1 },
    });
    (wrapper.element as HTMLDetailsElement).open = true;
    await wrapper.trigger("toggle");
    await vi.dynamicImportSettled();
    await flushPromises();
    expect(wrapper.text()).toContain("尚无有效拆解记录");
    wrapper.unmount();
  });
});
