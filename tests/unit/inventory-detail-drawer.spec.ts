import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import InventoryDetailDrawer from "@/features/inventory/InventoryDetailDrawer.vue";

describe("InventoryDetailDrawer", () => {
  it("closes on Escape and ignores Escape used by an IME composition", async () => {
    const close = vi.fn();
    const wrapper = mount(InventoryDetailDrawer, {
      props: { detail: null, loading: true, onClose: close },
      global: {
        stubs: {
          CharacterDetail: true,
          LightConeDetail: true,
          RelicDetail: true,
        },
      },
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true }));
    expect(close).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledOnce();

    wrapper.unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledOnce();
  });
});
