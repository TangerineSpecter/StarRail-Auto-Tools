import { describe, expect, it } from "vitest";
import { buildInventoryFilter, createInventoryFilterForm } from "@/features/inventory/filter";

describe("buildInventoryFilter", () => {
  it("accepts numeric substat counts emitted by PrimeVue Select", () => {
    const form = createInventoryFilterForm();
    form.minSubstatCount = 2;
    form.maxSubstatCount = 5;

    expect(buildInventoryFilter("relic", form, 1, 50)).toMatchObject({
      minSubstatCount: 2,
      maxSubstatCount: 5,
    });
  });
  it("omits unset relic filters and preserves multi-select values", () => {
    const form = createInventoryFilterForm();
    form.search = "  信使  ";
    form.slots = ["Feet"];
    form.rarities = [5];
    form.locked = "false";

    expect(buildInventoryFilter("relic", form, 2, 50)).toEqual({
      page: 2,
      pageSize: 50,
      search: "信使",
      slots: ["Feet"],
      rarities: [5],
      locked: false,
    });
  });

  it("sends the character build-plan state to the list query", () => {
    const form = createInventoryFilterForm();
    form.buildPlan = "false";

    expect(buildInventoryFilter("character", form, 1, 50)).toMatchObject({
      hasBuildPlan: false,
    });
  });
});
