import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InventoryKind } from "@/types";
import { useInventoryCategorySwipe } from "@/features/inventory/useInventoryCategorySwipe";

afterEach(() => vi.restoreAllMocks());
const point = (x: number, y = 200, identifier = 1) => ({ clientX: x, clientY: y, identifier });
function touch(
  target: Element,
  type: string,
  touches: ReturnType<typeof point>[],
  changed = touches,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: touches },
    changedTouches: { value: changed },
  });
  target.dispatchEvent(event);
  return event;
}
function swipe(target: Element, x = -120, y = 0) {
  touch(target, "touchstart", [point(220)]);
  const move = touch(target, "touchmove", [point(220 + x, 200 + y)]);
  touch(target, "touchend", [], [point(220 + x, 200 + y)]);
  return move;
}
async function fixture() {
  const surface = ref<HTMLElement | null>(null);
  const kind = ref<InventoryKind>("relic");
  const enabled = ref(true);
  const shown = ref(true);
  const switchTo = vi.fn((next: InventoryKind) => (kind.value = next));
  const detail = vi.fn();
  const View = defineComponent({
    setup() {
      useInventoryCategorySwipe({ surface, kind, enabled, switchTo });
      return () =>
        h("div", { ref: surface }, [
          h("article", { onClick: detail }, "卡片"),
          h("input"),
          h("button", "筛选"),
          h("div", { class: "nested", style: "overflow-x:auto" }, [h("span", "水平滚动")]),
        ]);
    },
  });
  const wrapper = mount(() =>
    h(KeepAlive, null, { default: () => (shown.value ? h(View) : null) }),
  );
  await nextTick();
  Object.defineProperty(surface.value, "clientWidth", { value: 360 });
  return {
    wrapper,
    surface,
    kind,
    enabled,
    shown,
    switchTo,
    detail,
    card: wrapper.get("article").element,
  };
}

describe("inventory category touch navigation", () => {
  it("moves through the ordered categories in both directions and stops at either end", async () => {
    const f = await fixture();
    expect(swipe(f.card).defaultPrevented).toBe(true);
    expect(f.kind.value).toBe("lightCone");
    swipe(f.card);
    expect(f.kind.value).toBe("character");
    swipe(f.card);
    expect(f.switchTo).toHaveBeenCalledTimes(2);
    swipe(f.card, 120);
    expect(f.kind.value).toBe("lightCone");
    swipe(f.card, 120);
    expect(f.kind.value).toBe("relic");
    swipe(f.card, 120);
    expect(f.switchTo).toHaveBeenCalledTimes(4);
    f.wrapper.unmount();
  });

  it("keeps native vertical scrolling and rejects diagonal, short, slow, canceled and multitouch gestures", async () => {
    const f = await fixture();
    expect(swipe(f.card, 4, -120).defaultPrevented).toBe(false);
    swipe(f.card, -100, -100);
    swipe(f.card, -25);
    touch(f.card, "touchstart", [point(220)]);
    touch(f.card, "touchmove", [point(100)]);
    touch(f.card, "touchcancel", []);
    touch(f.card, "touchend", [], [point(100)]);
    touch(f.card, "touchstart", [point(220)]);
    touch(f.card, "touchmove", [point(100), point(120, 210, 2)]);
    touch(f.card, "touchend", [], [point(100)]);
    const now = Date.now();
    const date = vi.spyOn(Date, "now").mockReturnValue(now);
    touch(f.card, "touchstart", [point(220)]);
    touch(f.card, "touchmove", [point(100)]);
    date.mockReturnValue(now + 1500);
    touch(f.card, "touchend", [], [point(100)]);
    expect(f.switchTo).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });

  it("suppresses the click following a drag while retaining taps and keyboard card activation", async () => {
    const f = await fixture();
    swipe(f.card, -25);
    f.card.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    expect(f.detail).not.toHaveBeenCalled();
    f.card.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    expect(f.detail).toHaveBeenCalledOnce();
    touch(f.card, "touchstart", [point(220)]);
    touch(f.card, "touchend", [], [point(220)]);
    f.card.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(f.detail).toHaveBeenCalledTimes(2);
    f.wrapper.unmount();
  });

  it("ignores controls, nested horizontal scroll, screen edges, disabled states and deactivated views", async () => {
    const f = await fixture();
    swipe(f.wrapper.get("input").element);
    swipe(f.wrapper.get("button").element);
    const nested = f.wrapper.get(".nested").element;
    Object.defineProperties(nested, { clientWidth: { value: 100 }, scrollWidth: { value: 200 } });
    swipe(f.wrapper.get(".nested span").element);
    touch(f.card, "touchstart", [point(5)]);
    touch(f.card, "touchmove", [point(150)]);
    touch(f.card, "touchend", [], [point(150)]);
    f.enabled.value = false;
    await nextTick();
    swipe(f.card);
    f.enabled.value = true;
    await nextTick();
    touch(f.card, "touchstart", [point(220)]);
    f.shown.value = false;
    await nextTick();
    touch(f.card, "touchmove", [point(100)]);
    touch(f.card, "touchend", [], [point(100)]);
    expect(f.switchTo).not.toHaveBeenCalled();
    f.shown.value = true;
    await nextTick();
    swipe(f.card);
    expect(f.switchTo).toHaveBeenCalledOnce();
    f.wrapper.unmount();
    swipe(f.card);
    expect(f.switchTo).toHaveBeenCalledOnce();
  });
});
