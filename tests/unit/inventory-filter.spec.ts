import { describe, expect, it } from "vitest";
import { buildInventoryFilter, createInventoryFilterForm } from "@/features/inventory/filter";

describe("buildInventoryFilter", () => {
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
});
