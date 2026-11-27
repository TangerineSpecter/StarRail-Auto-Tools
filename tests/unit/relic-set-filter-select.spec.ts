import { reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import RelicSetFilterSelect from "@/features/inventory/RelicSetFilterSelect.vue";
import { buildInventoryFilter, createInventoryFilterForm } from "@/features/inventory/filter";
import { inventoryApi } from "@/shared/api/inventory";

vi.mock("@/shared/api/inventory", () => ({
  inventoryApi: {
    equipmentCounts: vi.fn(),
  },
}));

const SelectStub = {
  name: "Select",
  props: ["modelValue", "options"],
  emits: ["update:modelValue"],
  template: "<div class='select-stub' />",
};

describe("RelicSetFilterSelect", () => {
  it("loads per-set owned counts and updates setIds when selecting or clearing", async () => {
    vi.mocked(inventoryApi.equipmentCounts).mockResolvedValue({
      relics: [
        { setId: 133, count: 42 },
        { setId: 329, count: 18 },
      ],
      lightCones: [],
    });

    const form = reactive(createInventoryFilterForm());
    const wrapper = mount(RelicSetFilterSelect, {
      global: { stubs: { Select: SelectStub } },
      props: {
        setIds: form.setIds,
        revision: 1,
        "onUpdate:setIds": (next: number[]) => {
          form.setIds = next;
        },
      },
    });
    await flushPromises();

    const select = wrapper.findComponent(SelectStub);
    const groups = select.props("options") as Array<{
      label: string;
      items: Array<{ id: number; count: number }>;
    }>;
    expect(groups).toHaveLength(2);
    expect(groups[0].items.find((item) => item.id === 133)?.count).toBe(42);
    expect(groups[1].items.find((item) => item.id === 329)?.count).toBe(18);

    select.vm.$emit("update:modelValue", 133);
    await wrapper.vm.$nextTick();

    expect(form.setIds).toEqual([133]);
    expect(wrapper.emitted("change")).toHaveLength(1);
    expect(buildInventoryFilter("relic", form, 1, 50)).toMatchObject({ setIds: [133] });

    select.vm.$emit("update:modelValue", null);
    await wrapper.vm.$nextTick();

    expect(form.setIds).toEqual([]);
    expect(wrapper.emitted("change")).toHaveLength(2);
    expect(buildInventoryFilter("relic", form, 1, 50)).not.toHaveProperty("setIds");
  });
});
