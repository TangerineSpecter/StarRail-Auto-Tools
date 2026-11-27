import { reactive } from "vue";
import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it } from "vitest";
import InventoryToolbar from "@/features/inventory/InventoryToolbar.vue";
import { createInventoryFilterForm } from "@/features/inventory/filter";

describe("InventoryToolbar", () => {
  it("shows the missing build-plan toggle only on the character tab and toggles buildPlan filter", async () => {
    const relicFilters = reactive(createInventoryFilterForm());
    const relicWrapper = mount(InventoryToolbar, {
      global: { plugins: [PrimeVue] },
      props: {
        kind: "relic",
        total: 10,
        activeFilterCount: 0,
        hasFilters: false,
        filters: relicFilters,
      },
    });
    expect(relicWrapper.find(".toolbar-missing-plan-toggle").exists()).toBe(false);

    const charFilters = reactive(createInventoryFilterForm());
    const charWrapper = mount(InventoryToolbar, {
      global: { plugins: [PrimeVue] },
      props: {
        kind: "character",
        total: 73,
        activeFilterCount: 0,
        hasFilters: false,
        filters: charFilters,
      },
    });

    const toggle = charWrapper.get(".toolbar-missing-plan-toggle");
    const checkbox = toggle.get('input[type="checkbox"]');
    expect((checkbox.element as HTMLInputElement).checked).toBe(false);

    await checkbox.setValue(true);
    expect(charFilters.buildPlan).toBe("false");
    expect(charWrapper.emitted("search")).toHaveLength(1);
    expect(toggle.classes()).toContain("is-active");

    await checkbox.setValue(false);
    expect(charFilters.buildPlan).toBe("");
    expect(charWrapper.emitted("search")).toHaveLength(2);
    expect(toggle.classes()).not.toContain("is-active");
  });
});
