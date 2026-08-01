import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RelicMainStatScanner from "@/features/relic-scanner/RelicMainStatScanner.vue";

const { relicMainStatScanPlanCount, scanRelicsByMainStat } = vi.hoisted(() => ({
  relicMainStatScanPlanCount: vi.fn(),
  scanRelicsByMainStat: vi.fn(),
}));

vi.mock("@/shared/api/inventory", () => ({
  inventoryApi: { relicMainStatScanPlanCount, scanRelicsByMainStat },
}));

const buttonStub = {
  emits: ["click"],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
};

describe("RelicMainStatScanner", () => {
  beforeEach(() => {
    relicMainStatScanPlanCount.mockReset();
    scanRelicsByMainStat.mockReset();
  });

  it("disables analysis when there are no saved build plans", async () => {
    relicMainStatScanPlanCount.mockResolvedValue(0);
    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined },
      global: { stubs: { Button: buttonStub } },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("请先在数据管理");
    expect(wrapper.find("button").attributes("disabled")).toBeDefined();
  });

  it("shows unconfigured-slot context and emits the selected relic", async () => {
    relicMainStatScanPlanCount.mockResolvedValue(1);
    scanRelicsByMainStat.mockResolvedValue({
      items: [
        {
          itemId: 7,
          setId: 101,
          name: "测试遗器",
          setName: "测试套装",
          slot: "Head",
          rarity: 5,
          level: 15,
          mainStat: "HP",
          mainStatValue: 705,
          location: "",
          equippedCharacterId: null,
          locked: false,
          discard: false,
          source: "test",
          updatedAt: 0,
          substats: [],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      planCount: 1,
      allowedMainStats: {},
    });
    const wrapper = mount(RelicMainStatScanner, {
      props: { imageFor: () => undefined },
      global: { stubs: { Button: buttonStub } },
    });
    await flushPromises();
    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("尚未设置目标主词条");
    await wrapper.find(".scanner-item").trigger("click");
    expect(wrapper.emitted("open-relic")?.[0][0]).toMatchObject({ itemId: 7 });
  });
});
