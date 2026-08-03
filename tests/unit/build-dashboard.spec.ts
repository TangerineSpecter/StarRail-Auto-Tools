import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import BuildDashboard from "@/features/build-planner/BuildDashboard.vue";
import { runtimeContextKey } from "@/shared/contracts/runtime";
import type { BuildDashboardEntry } from "@/types";

const { dashboard } = vi.hoisted(() => ({ dashboard: vi.fn() }));

vi.mock("@/shared/api/build-plan", () => ({
  buildPlanApi: { dashboard, exportExcel: vi.fn(), importExcel: vi.fn() },
}));

const entry: BuildDashboardEntry = {
  plan: {
    characterId: 1005,
    cavernMode: "fourPiece",
    cavernSetA: 101,
    cavernSetB: null,
    planarSetId: 301,
    mainStats: {},
    targets: [{ statKey: "攻击力", target: 2000, minimum: 1800, priority: 1 }],
    effectiveSubstats: ["攻击力"],
  },
  character: {
    characterId: 1005,
    name: "卡芙卡",
    level: 80,
    ascension: 6,
    equippedLightCone: { templateId: 23000, level: 80, ascension: 6 },
    equippedRelics: [],
  },
};

describe("BuildDashboard", () => {
  afterEach(() => vi.clearAllMocks());

  it("opens the selected character's target editor from the dashboard", async () => {
    dashboard.mockResolvedValue([entry]);
    const wrapper = mount(BuildDashboard, {
      global: {
        provide: {
          [runtimeContextKey as symbol]: {
            notice: ref(""),
          },
        },
        stubs: { InputText: true, Select: true },
      },
    });

    await flushPromises();
    await wrapper.get(".build-target-edit").trigger("click");

    expect(wrapper.get(".build-target-edit").text()).toContain("编辑目标");
    expect(wrapper.get(".recommended-set-status").text()).toBe("×");
    expect(wrapper.emitted("editBuild")).toEqual([[1005]]);
  });

  it("marks every target set as matched when its required pieces are equipped", async () => {
    dashboard.mockResolvedValue([
      {
        ...entry,
        character: {
          ...entry.character,
          equippedRelics: [
            ...Array.from({ length: 4 }, () => ({
              setId: 101,
              mainStat: "HP",
              mainStatValue: 0,
              substats: [],
            })),
            ...Array.from({ length: 2 }, () => ({
              setId: 301,
              mainStat: "HP",
              mainStatValue: 0,
              substats: [],
            })),
          ],
        },
      },
    ]);
    const wrapper = mount(BuildDashboard, {
      global: {
        provide: { [runtimeContextKey as symbol]: { notice: ref("") } },
        stubs: { InputText: true, Select: true },
      },
    });

    await flushPromises();

    expect(wrapper.findAll(".recommended-set-status.matched")).toHaveLength(2);
    expect(wrapper.findAll(".recommended-set-status").every((item) => item.text() === "✓")).toBe(
      true,
    );
  });
});
