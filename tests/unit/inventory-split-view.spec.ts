import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInventorySplitView } from "@/features/inventory/useInventorySplitView";

afterEach(() => {
  delete document.documentElement.dataset.posture;
  delete document.documentElement.dataset.contentFold;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("mobile inventory split view", () => {
  function create() {
    const open = ref(false);
    const master = ref<HTMLElement | null>(null);
    let split!: ReturnType<typeof useInventorySplitView>;
    const wrapper = mount(
      defineComponent({
        setup() {
          split = useInventorySplitView(open, master);
          return () => h("div", { ref: master });
        },
      }),
    );
    return { wrapper, open, split, master };
  }

  it("enters split view only when expanded and restores the outer list scroll on close", async () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.stubGlobal("scrollY", 240);
    document.documentElement.dataset.posture = "unfolded-landscape";
    const state = create();
    expect(state.split.value).toBe(false);
    state.open.value = true;
    await flushPromises();
    expect(state.split.value).toBe(true);
    expect(scroll).toHaveBeenLastCalledWith(0, 0);
    expect(state.master.value?.scrollTop).toBe(240);
    state.open.value = false;
    await flushPromises();
    expect(scroll).toHaveBeenLastCalledWith(0, 240);
    expect(state.split.value).toBe(false);
    state.wrapper.unmount();
  });

  it("adapts an open detail to folding and reserved tabletop regions without closing it", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    document.documentElement.dataset.posture = "portrait";
    const state = create();
    state.open.value = true;
    await flushPromises();
    expect(state.split.value).toBe(false);
    document.documentElement.dataset.posture = "unfolded-portrait";
    await flushPromises();
    expect(state.split.value).toBe(true);
    document.documentElement.dataset.contentFold = "tabletop";
    await flushPromises();
    expect(state.split.value).toBe(false);
    expect(state.open.value).toBe(true);
    document.documentElement.dataset.contentFold = "flat";
    await flushPromises();
    expect(state.split.value).toBe(true);
    state.wrapper.unmount();
    document.documentElement.dataset.posture = "portrait";
    await flushPromises();
    expect(state.split.value).toBe(false);
  });
});
