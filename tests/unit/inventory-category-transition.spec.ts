import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryKind } from "@/types";
import { useInventoryCategoryTransition } from "@/features/inventory/useInventoryCategoryTransition";

const originalStart = document.startViewTransition;
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    writable: true,
    value: originalStart,
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function fixture(prepare: (kind: InventoryKind) => Promise<(() => boolean) | null>) {
  const kind = ref<InventoryKind>("relic");
  const body = ref<HTMLElement | null>(null);
  const onCommit = vi.fn();
  const cancelDetail = vi.fn();
  let state!: ReturnType<typeof useInventoryCategoryTransition>;
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useInventoryCategoryTransition({ kind, body, prepare, onCommit, cancelDetail });
        return () => h("div", { ref: body });
      },
    }),
  );
  return { kind, body, state, wrapper, onCommit, cancelDetail };
}

describe("inventory category transitions", () => {
  it("moves selection immediately but keeps the previous category until its data is ready", async () => {
    let ready!: (commit: () => boolean) => void;
    const { state, kind, wrapper, onCommit } = fixture(
      () =>
        new Promise((resolve) => {
          ready = resolve;
        }),
    );
    const switching = state.switchTo("lightCone");
    expect(state.selectedKind.value).toBe("lightCone");
    expect(state.pending.value).toBe(true);
    expect(kind.value).toBe("relic");
    ready(() => {
      kind.value = "lightCone";
      return true;
    });
    await switching;
    expect(kind.value).toBe("lightCone");
    expect(onCommit).toHaveBeenCalledOnce();
    expect(state.pending.value).toBe(false);
    wrapper.unmount();
  });

  it("ignores slower earlier requests and rolls back selection when loading fails", async () => {
    let first!: (commit: () => boolean) => void;
    let second!: (commit: () => boolean) => void;
    const prepare = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            first = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            second = resolve;
          }),
      )
      .mockResolvedValueOnce(null);
    const { state, kind, wrapper } = fixture(prepare);
    const older = state.switchTo("lightCone");
    const latest = state.switchTo("character");
    const staleCommit = vi.fn(() => true);
    second(() => {
      kind.value = "character";
      return true;
    });
    await latest;
    first(staleCommit);
    await older;
    expect(staleCommit).not.toHaveBeenCalled();
    expect(state.selectedKind.value).toBe("character");
    await state.switchTo("relic");
    expect(state.selectedKind.value).toBe("character");
    expect(kind.value).toBe("character");
    wrapper.unmount();
  });

  it("uses reverse motion for a left-hand tab and commits even if the browser rejects capture", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    let update!: () => Promise<void>;
    let finish!: () => void;
    const start = vi.fn((callback) => {
      update = callback;
      return {
        ready: Promise.resolve(),
        finished: new Promise<void>((resolve) => {
          finish = resolve;
        }),
        skipTransition: vi.fn(),
      };
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      writable: true,
      value: start,
    });
    const prepare = vi.fn();
    const { state, kind, wrapper, body } = fixture(prepare);
    kind.value = "character";
    prepare.mockImplementation(async (next: InventoryKind) => () => {
      kind.value = next;
      return true;
    });
    const switching = state.switchTo("relic");
    await flushPromises();
    expect(document.documentElement.classList.contains("inventory-category-back")).toBe(true);
    await update();
    finish();
    await switching;
    expect(body.value!.style.getPropertyValue("--inventory-category-height")).toBe("");
    expect(document.documentElement.classList.contains("inventory-category-transition")).toBe(
      false,
    );
    start.mockImplementation(() => {
      throw new Error("capture unavailable");
    });
    await state.switchTo("lightCone");
    expect(kind.value).toBe("lightCone");
    expect(state.pending.value).toBe(false);
    wrapper.unmount();
  });

  it("cancels a pending commit when leaving the page", async () => {
    let ready!: (commit: () => boolean) => void;
    const { state, wrapper } = fixture(
      () =>
        new Promise((resolve) => {
          ready = resolve;
        }),
    );
    const switching = state.switchTo("character");
    wrapper.unmount();
    const commit = vi.fn(() => true);
    ready(commit);
    await switching;
    expect(commit).not.toHaveBeenCalled();
    expect(state.pending.value).toBe(false);
  });
});
