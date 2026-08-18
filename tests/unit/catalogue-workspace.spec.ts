import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, KeepAlive, ref } from "vue";
import CatalogueWorkspace from "@/features/catalogue/CatalogueWorkspace.vue";
import { runtimeContextKey } from "@/shared/contracts/runtime";

const { equipmentCounts } = vi.hoisted(() => ({
  equipmentCounts: vi.fn(),
}));

vi.mock("@/shared/api/inventory", () => ({
  inventoryApi: { equipmentCounts },
}));

vi.mock("@/shared/api/build-plan", () => ({
  buildPlanApi: { recommendedCharactersForSet: vi.fn().mockResolvedValue([]) },
}));

function mountWorkspace() {
  return mount(CatalogueWorkspace, {
    global: {
      provide: {
        [runtimeContextKey as symbol]: {
          inventoryRevision: ref(1),
        },
      },
    },
  });
}

describe("CatalogueWorkspace", () => {
  beforeEach(() => {
    equipmentCounts.mockReset();
  });

  it("renders owned equipment counts without relic or ornament ids", async () => {
    equipmentCounts.mockResolvedValue({
      relics: [
        { setId: 101, count: 6 },
        { setId: 301, count: 3 },
      ],
      lightCones: [{ templateId: 23024, count: 2 }],
    });

    const wrapper = mountWorkspace();
    await flushPromises();

    expect(wrapper.text()).toContain("持有 6 件");
    expect(wrapper.text()).not.toMatch(/#\d+/);

    const lightConeTab = wrapper
      .findAll(".catalogue-tab-btn")
      .find((button) => button.text().includes("光锥"));
    expect(lightConeTab).toBeTruthy();
    await lightConeTab!.trigger("click");
    expect(wrapper.text()).toContain("持有 2 把");
    expect(wrapper.text()).not.toMatch(/#\d+/);
  });

  it("keeps the latest inventory counts when an earlier request resolves late", async () => {
    let resolveFirst!: (value: {
      relics: Array<{ setId: number; count: number }>;
      lightCones: Array<{ templateId: number; count: number }>;
    }) => void;
    const firstRequest = new Promise<{
      relics: Array<{ setId: number; count: number }>;
      lightCones: Array<{ templateId: number; count: number }>;
    }>((resolve) => {
      resolveFirst = resolve;
    });
    equipmentCounts.mockReturnValueOnce(firstRequest).mockResolvedValueOnce({
      relics: [{ setId: 101, count: 9 }],
      lightCones: [],
    });

    const revision = ref(1);
    const wrapper = mount(CatalogueWorkspace, {
      global: {
        provide: {
          [runtimeContextKey as symbol]: {
            inventoryRevision: revision,
          },
        },
      },
    });
    revision.value = 2;
    await flushPromises();
    resolveFirst({ relics: [{ setId: 101, count: 1 }], lightCones: [] });
    await flushPromises();

    expect(wrapper.text()).toContain("持有 9 件");
    expect(wrapper.text()).not.toContain("持有 1 件");
    wrapper.unmount();
  });

  it("refreshes after an inactive request returns for an older revision", async () => {
    let resolveFirst!: (value: {
      relics: Array<{ setId: number; count: number }>;
      lightCones: Array<{ templateId: number; count: number }>;
    }) => void;
    const firstRequest = new Promise<{
      relics: Array<{ setId: number; count: number }>;
      lightCones: Array<{ templateId: number; count: number }>;
    }>((resolve) => {
      resolveFirst = resolve;
    });
    equipmentCounts.mockReturnValueOnce(firstRequest).mockResolvedValueOnce({
      relics: [{ setId: 101, count: 9 }],
      lightCones: [],
    });

    const revision = ref(1);
    const visible = ref(true);
    const wrapper = mount(
      defineComponent({
        setup() {
          return () => h(KeepAlive, null, () => (visible.value ? h(CatalogueWorkspace) : null));
        },
      }),
      {
        global: {
          provide: {
            [runtimeContextKey as symbol]: { inventoryRevision: revision },
          },
        },
      },
    );

    visible.value = false;
    await wrapper.vm.$nextTick();
    revision.value = 2;
    resolveFirst({ relics: [{ setId: 101, count: 1 }], lightCones: [] });
    await flushPromises();
    visible.value = true;
    await flushPromises();

    expect(wrapper.text()).toContain("持有 9 件");
    expect(wrapper.text()).not.toContain("持有 1 件");
    wrapper.unmount();
  });

  it("closes the open catalogue card on Escape", async () => {
    equipmentCounts.mockResolvedValue({ relics: [], lightCones: [] });
    const wrapper = mountWorkspace();
    await flushPromises();
    await wrapper.get(".catalogue-card").trigger("click");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
