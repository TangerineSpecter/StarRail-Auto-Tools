import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { relics } from "@/shared/dev/mobile-fixtures";
import type { InventoryKind, InventoryListItem } from "@/types";
import { useMobileInventoryWindow } from "@/features/inventory/useMobileInventoryWindow";

const observers: Array<{ intersect: () => void; disconnect: ReturnType<typeof vi.fn> }> = [];
beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("innerWidth", 466);
  vi.stubGlobal("innerHeight", 678);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      disconnect = vi.fn();
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observers.push({
          intersect: () => callback([{ isIntersecting: true }]),
          disconnect: this.disconnect,
        });
      }
      observe() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
async function fixture() {
  const items = ref<InventoryListItem[]>(relics);
  const kind = ref<InventoryKind>("relic");
  const pending = ref(false);
  const master = ref<HTMLElement | null>(null);
  const shown = ref(true);
  let state!: ReturnType<typeof useMobileInventoryWindow>;
  const View = defineComponent({
    setup() {
      state = useMobileInventoryWindow({ items, kind, pending, master });
      return () =>
        h("div", { ref: master }, [
          ...state.visibleItems.value.map((_, i) => h("span", { key: i }, String(i))),
          state.hasMore.value ? h("div", { ref: state.sentinel }) : null,
        ]);
    },
  });
  const wrapper = mount(() =>
    h(KeepAlive, null, { default: () => (shown.value ? h(View) : null) }),
  );
  await flushPromises();
  return { wrapper, items, kind, pending, shown, state };
}
describe("mobile inventory rendering window", () => {
  it("renders the first screen before the transition and eventually exposes every loaded item in order", async () => {
    const f = await fixture();
    expect(f.state.visibleItems.value).toEqual(relics.slice(0, 6));
    f.pending.value = true;
    await flushPromises();
    observers.at(-1)!.intersect();
    expect(f.state.visibleItems.value).toHaveLength(6);
    f.pending.value = false;
    await flushPromises();
    while (f.state.hasMore.value) {
      observers.at(-1)!.intersect();
      await flushPromises();
    }
    expect(f.state.visibleItems.value).toEqual(relics);
    expect(f.wrapper.findAll("span")).toHaveLength(60);
    f.wrapper.unmount();
  });
  it("rejects stale observations after filtering, deactivation and unmount", async () => {
    const f = await fixture();
    const first = observers.at(-1)!;
    f.shown.value = false;
    await nextTick();
    first.intersect();
    expect(f.state.visibleItems.value).toHaveLength(6);
    expect(first.disconnect).toHaveBeenCalled();
    f.shown.value = true;
    await flushPromises();
    const old = observers.at(-1)!;
    f.items.value = relics.slice(0, 2);
    await flushPromises();
    old.intersect();
    expect(f.state.visibleItems.value).toEqual(relics.slice(0, 2));
    expect(f.state.hasMore.value).toBe(false);
    f.wrapper.unmount();
    old.intersect();
    expect(f.state.visibleItems.value).toHaveLength(2);
  });
  it("keeps the whole list available when IntersectionObserver is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const f = await fixture();
    expect(f.state.visibleItems.value).toHaveLength(60);
    f.wrapper.unmount();
  });
});
