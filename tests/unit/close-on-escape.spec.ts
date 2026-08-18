import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useCloseOnEscape } from "@/features/catalogue/close-on-escape";

describe("useCloseOnEscape", () => {
  it("closes on Escape and ignores IME composition", () => {
    const close = vi.fn();
    const wrapper = mount(
      defineComponent({
        setup() {
          useCloseOnEscape(close);
          return () => null;
        },
      }),
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true }));
    expect(close).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledOnce();

    wrapper.unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledOnce();
  });
});
