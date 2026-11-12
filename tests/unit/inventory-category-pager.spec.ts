import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryKind } from "@/types";
import { useInventoryCategoryPager } from "@/features/inventory/useInventoryCategoryPager";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("innerWidth", 466);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const point = (x: number, y = 240) => ({ identifier: 1, clientX: x, clientY: y });
function touch(target: Element, type: string, x: number, y = 240) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: type === "touchend" || type === "touchcancel" ? [] : [point(x, y)] },
    changedTouches: { value: [point(x, y)] },
  });
  target.dispatchEvent(event);
  return event;
}
async function fixture() {
  const surface = ref<HTMLElement | null>(null);
  const body = ref<HTMLElement | null>(null);
  const kind = ref<InventoryKind>("relic");
  const enabled = ref(true);
  const preview = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
  const commit = vi.fn(async (next: InventoryKind) => {
    kind.value = next;
    return true;
  });
  let pager!: ReturnType<typeof useInventoryCategoryPager>;
  const wrapper = mount(
    defineComponent({
      setup() {
        pager = useInventoryCategoryPager({ surface, body, kind, enabled, preview, commit });
        return () => h("div", { ref: surface }, [h("div", { ref: body }, "卡片")]);
      },
    }),
  );
  await nextTick();
  Object.defineProperty(body.value, "clientWidth", { value: 360 });
  const start = () => touch(body.value!, "touchstart", 300);
  const move = (x: number, y?: number) => touch(body.value!, "touchmove", x, y);
  const end = (x: number) => touch(body.value!, "touchend", x);
  async function settle() {
    await Promise.resolve();
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    await nextTick();
  }
  return { wrapper, body, kind, enabled, preview, commit, pager, start, move, end, settle };
}
describe("finger-following inventory pager", () => {
  it("tracks held movement and the indicator without committing, including a long hold", async () => {
    const f = await fixture();
    f.start();
    f.move(180);
    await nextTick();
    expect(f.pager.offset.value).toBe(-120);
    expect(f.pager.paneStyle.value?.transform).toBe("translate3d(-120px,0,0)");
    expect(f.pager.neighbourStyle.value.transform).toBe("translate3d(256px,0,0)");
    expect(f.pager.position.value).toBeCloseTo(120 / 376);
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.kind.value).toBe("relic");
    expect(f.commit).not.toHaveBeenCalled();
    f.end(180);
    await f.settle();
    expect(f.kind.value).toBe("lightCone");
    expect(f.pager.active.value).toBe(false);
    expect(f.pager.position.value).toBe(1);
    f.wrapper.unmount();
  });
  it("rebounds a short slow drag, reversals and outer edges, while supporting a fast flick", async () => {
    const f = await fixture();
    f.start();
    f.move(260);
    await vi.advanceTimersByTimeAsync(200);
    f.end(260);
    await f.settle();
    expect(f.commit).not.toHaveBeenCalled();
    f.start();
    f.move(160);
    f.move(295);
    await vi.advanceTimersByTimeAsync(200);
    f.end(295);
    await f.settle();
    expect(f.commit).not.toHaveBeenCalled();
    f.start();
    f.move(450);
    expect(f.pager.offset.value).toBeLessThan(50);
    f.end(450);
    await f.settle();
    expect(f.kind.value).toBe("relic");
    f.start();
    await vi.advanceTimersByTimeAsync(20);
    f.move(260);
    f.end(260);
    await f.settle();
    expect(f.kind.value).toBe("lightCone");
    f.start();
    f.move(160);
    f.end(420);
    await f.settle();
    expect(f.kind.value).toBe("relic");
    f.wrapper.unmount();
  });
  it("does not intercept vertical scrolling and ignores a failed or stale neighbour", async () => {
    const f = await fixture();
    f.start();
    expect(f.move(302, 100).defaultPrevented).toBe(false);
    expect(f.pager.active.value).toBe(false);
    f.preview.mockRejectedValueOnce(new Error("read failed"));
    f.start();
    f.move(150);
    await Promise.resolve();
    await nextTick();
    f.end(150);
    await f.settle();
    expect(f.kind.value).toBe("relic");
    expect(f.pager.active.value).toBe(false);
    let done!: (value: unknown) => void;
    f.preview.mockReturnValueOnce(
      new Promise((resolve) => {
        done = resolve;
      }),
    );
    f.start();
    f.move(150);
    f.end(150);
    f.wrapper.unmount();
    done({ items: [], total: 0, page: 1, pageSize: 50 });
    await f.settle();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.pager.active.value).toBe(false);
  });
  it("cancels the touch on rotation and allows explicit cancellation during settling", async () => {
    const f = await fixture();
    f.start();
    f.move(150);
    window.dispatchEvent(new Event("resize"));
    f.move(100);
    f.end(100);
    await f.settle();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.pager.active.value).toBe(false);
    f.start();
    f.move(150);
    f.end(150);
    await Promise.resolve();
    await nextTick();
    f.pager.cancel();
    await f.settle();
    expect(f.commit).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
});
