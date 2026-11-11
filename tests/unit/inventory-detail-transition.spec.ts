import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInventoryDetailTransition } from "@/features/inventory/useInventoryDetailTransition";

const originalStart = document.startViewTransition;
beforeEach(() => {
  document.documentElement.dataset.posture = "unfolded-landscape";
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
});
afterEach(() => {
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    writable: true,
    value: originalStart,
  });
  delete document.documentElement.dataset.posture;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fixture() {
  const master = ref<HTMLElement | null>(null);
  let run!: ReturnType<typeof useInventoryDetailTransition>;
  const wrapper = mount(
    defineComponent({
      setup() {
        run = useInventoryDetailTransition(master);
        return () =>
          h(
            "div",
            { ref: master },
            Array.from({ length: 20 }, () => h("div", { class: "inventory-relic-row" })),
          );
      },
    }),
  );
  const rect = { top: 0, bottom: 500 } as DOMRect;
  vi.spyOn(master.value!, "getBoundingClientRect").mockReturnValue(rect);
  for (const child of master.value!.children)
    vi.spyOn(child, "getBoundingClientRect").mockReturnValue(rect);
  return { run, wrapper, master: master.value! };
}

function mockTransitions() {
  const pending: Array<{
    update: () => Promise<void>;
    finish: () => void;
    skip: ReturnType<typeof vi.fn>;
  }> = [];
  const start = vi.fn((update: () => Promise<void>) => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const skip = vi.fn();
    pending.push({ update, finish, skip });
    return { finished, ready: Promise.resolve(), skipTransition: skip };
  });
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    writable: true,
    value: start,
  });
  return { start, pending };
}

describe("inventory detail transitions", () => {
  it("bounds the shared snapshots and restores existing inline styles after finishing", async () => {
    const { pending } = mockTransitions();
    const { run, wrapper, master } = fixture();
    (master.children[0] as HTMLElement).style.viewTransitionName = "original-card";
    const change = vi.fn();
    run(change);
    expect(master.querySelectorAll('[style*="inventory-card-"]')).toHaveLength(12);
    expect(change).not.toHaveBeenCalled();
    await pending[0]!.update();
    expect(change).toHaveBeenCalledOnce();
    pending[0]!.finish();
    await flushPromises();
    expect(document.documentElement.classList.contains("inventory-detail-transition")).toBe(false);
    expect((master.children[0] as HTMLElement).style.viewTransitionName).toBe("original-card");
    expect(master.querySelectorAll('[style*="inventory-card-"]')).toHaveLength(0);
    wrapper.unmount();
  });

  it("lets the latest interaction win when an animation is interrupted", async () => {
    const { pending } = mockTransitions();
    const { run, wrapper } = fixture();
    const older = vi.fn();
    const latest = vi.fn();
    run(older);
    run(latest, true);
    expect(pending[0]!.skip).toHaveBeenCalledOnce();
    await pending[0]!.update();
    await pending[1]!.update();
    expect(older).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    pending[0]!.finish();
    await flushPromises();
    expect(document.documentElement.classList.contains("inventory-detail-closing")).toBe(true);
    wrapper.unmount();
    expect(pending[1]!.skip).toHaveBeenCalledOnce();
    expect(document.documentElement.classList.contains("inventory-detail-transition")).toBe(false);
    pending[1]!.finish();
    await flushPromises();
  });

  it("applies changes immediately for Reduce Motion and folded screens", () => {
    const { start } = mockTransitions();
    const { run, wrapper } = fixture();
    const change = vi.fn();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    run(change);
    expect(change).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    document.documentElement.dataset.posture = "portrait";
    run(change);
    expect(change).toHaveBeenCalledTimes(2);
    expect(start).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("uses the CSS entrance fallback when shared transitions are unavailable", () => {
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const { run, wrapper } = fixture();
    const change = vi.fn();
    run(change);
    expect(change).toHaveBeenCalledOnce();
    expect(document.documentElement.classList.contains("inventory-detail-fallback")).toBe(true);
    wrapper.unmount();
    expect(document.documentElement.classList.contains("inventory-detail-fallback")).toBe(false);
  });
});
