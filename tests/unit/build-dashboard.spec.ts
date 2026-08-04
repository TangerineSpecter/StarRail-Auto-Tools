import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import BuildDashboard from "@/features/build-planner/BuildDashboard.vue";
import { runtimeContextKey } from "@/shared/contracts/runtime";
import type { BuildDashboardEntry } from "@/types";

const { dashboard, reorderDashboard, setDashboardPinned } = vi.hoisted(() => ({
  dashboard: vi.fn(),
  reorderDashboard: vi.fn(),
  setDashboardPinned: vi.fn(),
}));

vi.mock("@/shared/api/build-plan", () => ({
  buildPlanApi: {
    dashboard,
    reorderDashboard,
    setDashboardPinned,
    exportExcel: vi.fn(),
    importExcel: vi.fn(),
  },
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
    note: "",
  },
  character: {
    characterId: 1005,
    name: "卡芙卡",
    level: 80,
    ascension: 6,
    equippedLightCone: { templateId: 23000, level: 80, ascension: 6 },
    equippedRelics: [],
  },
  displayOrder: 0,
  pinned: false,
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
    expect(wrapper.get(".build-drag-handle").attributes("disabled")).toBeUndefined();
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

  it("toggles the selected character pin state", async () => {
    dashboard.mockResolvedValueOnce([entry]).mockResolvedValueOnce([{ ...entry, pinned: true }]);
    setDashboardPinned.mockResolvedValue(undefined);
    const wrapper = mount(BuildDashboard, {
      global: {
        provide: { [runtimeContextKey as symbol]: { notice: ref("") } },
        stubs: { InputText: true, Select: true },
      },
    });

    await flushPromises();
    await wrapper.get(".build-pin-toggle").trigger("click");
    await flushPromises();

    expect(setDashboardPinned).toHaveBeenCalledWith(1005, true);
    expect(wrapper.get(".build-pin-toggle").attributes("aria-pressed")).toBe("true");
  });

  it("hides the info icon without a note and opens a floating card on click", async () => {
    dashboard.mockResolvedValueOnce([entry]).mockResolvedValueOnce([
      {
        ...entry,
        plan: { ...entry.plan, note: "  优先补速度，暴伤次之  " },
      },
    ]);
    const wrapper = mount(BuildDashboard, {
      attachTo: document.body,
      global: {
        provide: { [runtimeContextKey as symbol]: { notice: ref("") } },
        stubs: { InputText: true, Select: true },
      },
    });

    await flushPromises();
    expect(wrapper.find(".build-note-info").exists()).toBe(false);
    expect(document.querySelector(".build-note-popover")).toBeNull();

    await (wrapper.vm as { reload: () => Promise<void> }).reload();
    await flushPromises();

    const infoButton = wrapper.get(".build-note-info");
    expect(infoButton.text()).toBe("i");
    expect(infoButton.attributes("aria-expanded")).toBe("false");

    await infoButton.trigger("click");
    expect(infoButton.attributes("aria-expanded")).toBe("true");
    const popover = document.querySelector(".build-note-popover");
    expect(popover?.textContent).toContain("优先补速度，暴伤次之");
    expect(popover?.textContent).toContain("卡芙卡");

    wrapper.get(".build-dashboard").element.dispatchEvent(new Event("scroll"));
    await flushPromises();
    expect(document.querySelector(".build-note-popover")).toBeNull();
    expect(infoButton.attributes("aria-expanded")).toBe("false");

    await infoButton.trigger("click");
    expect(document.querySelector(".build-note-popover")).not.toBeNull();
    await infoButton.trigger("click");
    expect(document.querySelector(".build-note-popover")).toBeNull();

    wrapper.unmount();
  });
});
