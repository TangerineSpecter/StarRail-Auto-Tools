import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import LoadingState from "@/shared/ui/LoadingState.vue";
import { useSheetDragDismiss } from "@/shared/ui/useSheetDragDismiss";

describe("LoadingState", () => {
  it("renders structured visual loading designs for every variant", () => {
    const variants = [
      ["page", ".loading-orbit"],
      ["list", ".sk-list-row"],
      ["cards", ".sk-card"],
      ["detail", ".sk-detail-hero"],
      ["chart", ".sk-chart-row"],
      ["form", ".sk-form-field"],
      ["inline", ".inline-spinner"],
      ["bar", ".loading-progress-bar-fill"],
    ] as const;

    for (const [variant, selector] of variants) {
      const wrapper = mount(LoadingState, {
        props: { variant, label: `加载中-${variant}`, rows: 3 },
      });
      expect(wrapper.find('[role="status"]').exists()).toBe(true);
      expect(wrapper.find(selector).exists()).toBe(true);
      if (variant !== "bar") {
        expect(wrapper.text()).toContain(`加载中-${variant}`);
      }
      wrapper.unmount();
    }
  });
});

describe("useSheetDragDismiss", () => {
  it("supports downward drag-to-dismiss on mobile-detail-sheet containers", async () => {
    const onDismiss = vi.fn();
    const Host = defineComponent({
      setup() {
        const drag = useSheetDragDismiss(onDismiss, 48);
        return () =>
          h("aside", { class: "detail-drawer mobile-detail-sheet" }, [
            h("header", {
              class: "drag-handle",
              onTouchstart: drag.handlers.touchstart,
              onTouchmove: drag.handlers.touchmove,
              onTouchend: drag.handlers.touchend,
            }),
          ]);
      },
    });

    const wrapper = mount(Host);
    const header = wrapper.get(".drag-handle");
    await header.trigger("touchstart", { touches: [{ clientX: 100, clientY: 20 }] });
    await header.trigger("touchmove", { touches: [{ clientX: 102, clientY: 96 }] });
    expect((wrapper.element as HTMLElement).style.transform).toBe("translate3d(0, 76px, 0)");
    await header.trigger("touchend");
    expect(onDismiss).toHaveBeenCalledOnce();
    expect((wrapper.element as HTMLElement).style.transform).toBe("");
    wrapper.unmount();
  });
});
