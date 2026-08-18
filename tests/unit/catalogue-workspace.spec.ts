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

function tabButton(wrapper: ReturnType<typeof mountWorkspace>, label: string) {
  const button = wrapper.findAll(".catalogue-tab-btn").find((item) => item.text().includes(label));
  if (!button) throw new Error(`missing catalogue tab: ${label}`);
  return button;
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

    await tabButton(wrapper, "光锥").trigger("click");
    expect(wrapper.text()).toContain("持有 2 把");
    expect(wrapper.text()).not.toMatch(/#\d+/);
  });

  it("mounts only the active tab and restores visited tab state", async () => {
    equipmentCounts.mockResolvedValue({ relics: [], lightCones: [] });
    const wrapper = mountWorkspace();
    await flushPromises();

    expect(wrapper.find(".relic-catalogue-section").exists()).toBe(true);
    expect(wrapper.find(".lightcone-catalogue-section").exists()).toBe(false);
    expect(wrapper.find(".character-catalogue-section").exists()).toBe(false);
    expect(wrapper.text()).toContain("云无留迹的过客");
    expect(wrapper.text()).not.toContain("太空封印站");

    await tabButton(wrapper, "位面饰品").trigger("click");
    expect(wrapper.text()).toContain("太空封印站");
    expect(wrapper.text()).not.toContain("云无留迹的过客");
    expect(wrapper.find(".lightcone-catalogue-section").exists()).toBe(false);

    await tabButton(wrapper, "光锥").trigger("click");
    expect(wrapper.find(".lightcone-catalogue-section").exists()).toBe(true);
    expect(wrapper.find(".relic-catalogue-section").exists()).toBe(false);
    await wrapper.get(".catalogue-search-input").setValue("快枪");

    await tabButton(wrapper, "角色").trigger("click");
    expect(wrapper.find(".character-catalogue-section").exists()).toBe(true);
    expect(wrapper.find(".lightcone-catalogue-section").exists()).toBe(false);

    await tabButton(wrapper, "光锥").trigger("click");
    expect(wrapper.find(".lightcone-catalogue-section").exists()).toBe(true);
    expect((wrapper.get(".catalogue-search-input").element as HTMLInputElement).value).toBe("快枪");
    wrapper.unmount();
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
