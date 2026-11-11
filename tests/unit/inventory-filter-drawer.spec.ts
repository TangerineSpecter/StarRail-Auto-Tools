import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import Drawer from "primevue/drawer";
import InventoryFilterDrawer from "@/features/inventory/InventoryFilterDrawer.vue";
import { createInventoryFilterForm } from "@/features/inventory/filter";
import { mobileViewKey } from "@/shared/contracts/mobile-view";

describe("inventory filter drawer", () => {
  it.each([false, true])(
    "positions the drawer for mobile=%s and retains filter actions",
    async (mobile) => {
      const wrapper = mount(InventoryFilterDrawer, {
        props: {
          kind: "relic",
          busy: false,
          modelValue: true,
          filters: createInventoryFilterForm(),
        },
        global: {
          provide: { [mobileViewKey as symbol]: mobile },
          stubs: {
            Drawer: { props: ["position", "visible"], template: "<div><slot /></div>" },
            Select: true,
            Button: { template: "<button><slot /></button>" },
          },
        },
      });

      expect(wrapper.getComponent(Drawer).props("position")).toBe(mobile ? "bottom" : "right");
      await wrapper.get("form").trigger("submit");
      expect(wrapper.emitted("apply")).toHaveLength(1);
      await wrapper.get(".filter-reset").trigger("click");
      expect(wrapper.emitted("reset")).toHaveLength(1);
      if (mobile) {
        await wrapper.get('[aria-label="关闭筛选"]').trigger("click");
        expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
      } else {
        expect(wrapper.find('[aria-label="关闭筛选"]').exists()).toBe(false);
      }
    },
  );
});
