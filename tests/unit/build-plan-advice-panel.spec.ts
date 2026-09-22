import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import BuildPlanAdvicePanel from "@/features/build-planner/BuildPlanAdvicePanel.vue";
import {
  buildAdviceCompareRows,
  defaultAdviceSelections,
} from "@/features/build-planner/plan-advice";
import type { AdvicePlanDraft, CharacterBuildPlan } from "@/types";

const current: CharacterBuildPlan = {
  characterId: 1220,
  cavernMode: "fourPiece",
  cavernSetA: 101,
  cavernSetB: null,
  planarSetId: 301,
  mainStats: { Body: ["CRIT Rate"], Feet: ["SPD"], PlanarSphere: [], LinkRope: [] },
  targets: [],
  effectiveSubstats: [],
  note: "",
  substatWeights: { SPD: 1 },
  minPotentialPct: 40,
  spdTarget: 0,
};

const recommended: AdvicePlanDraft = {
  ...current,
  cavernSetA: 102,
  substatWeights: { SPD: 0.75, "CRIT Rate": 1 },
};

describe("BuildPlanAdvicePanel", () => {
  it("asks per field whether to keep the form value or use the recommendation", async () => {
    const rows = buildAdviceCompareRows(current, recommended);
    const wrapper = mount(BuildPlanAdvicePanel, {
      props: {
        disabled: false,
        loading: false,
        error: "",
        advice: {
          characterId: 1220,
          displayName: "飞霄",
          summary: "当前版本更偏向另一套。",
          plan: recommended,
          sources: [],
          warnings: [],
          searchedAt: 1,
        },
        rows,
        selections: defaultAdviceSelections(rows),
        pendingCount: 1,
      },
    });
    expect(wrapper.text()).toContain("四件套");
    expect(wrapper.text()).toContain("速度权重");
    const spdButtons = wrapper
      .findAll(".advice-row")
      .find((row) => row.text().includes("速度权重"))
      ?.findAll("button");
    await spdButtons?.[1].trigger("click");
    expect(wrapper.emitted("choose")?.[0]).toEqual(["weight.SPD", "ai"]);
  });

  it("does not query while the plan is still loading", async () => {
    const wrapper = mount(BuildPlanAdvicePanel, {
      props: {
        disabled: true,
        loading: false,
        error: "",
        advice: null,
        rows: [],
        selections: {},
        pendingCount: 0,
      },
    });

    const query = wrapper.get(".advisor-query");
    expect(query.attributes("disabled")).toBeDefined();
    await query.trigger("click");
    expect(wrapper.emitted("query")).toBeUndefined();
  });
});
