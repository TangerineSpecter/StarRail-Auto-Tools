import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMobilePageTransition } from "@/mobile/useMobilePageTransition";
const originalStart = document.startViewTransition;

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: originalStart,
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture(prepare = vi.fn().mockResolvedValue(undefined)) {
  const page = ref("inventory");
  const content = ref<HTMLElement | null>(null);
  const error = vi.fn();
  let state!: ReturnType<typeof useMobilePageTransition>;
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useMobilePageTransition({
          page,
          content,
          order: ["inventory", "analysis", "settings"],
          prepare,
          onError: error,
        });
        return () => h("div", { ref: content }, page.value);
      },
    }),
  );
  const motions: Array<{ finish: () => void; cancel: ReturnType<typeof vi.fn> }> = [];
  const animate = vi.fn<(frames: Keyframe[], options: KeyframeAnimationOptions) => Animation>(
    () => {
      let finish!: () => void;
      let reject!: (error: Error) => void;
      const finished = new Promise<void>((resolve, fail) => {
        finish = resolve;
        reject = fail;
      });
      const motion = { finish, cancel: vi.fn(() => reject(new Error("cancelled"))), finished };
      motions.push(motion);
      return motion as unknown as Animation;
    },
  );
  Object.defineProperty(content.value, "animate", { configurable: true, value: animate });
  return { wrapper, page, state, motions, animate, prepare, error };
}
describe("mobile main menu page transitions", () => {
  it("overlaps viewport images and keeps the named menu stationary when capture is supported", async () => {
    let update!: () => Promise<void>;
    let finish!: () => void;
    const skip = vi.fn();
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (callback: () => Promise<void>) => {
        update = callback;
        return {
          ready: Promise.resolve(),
          finished: new Promise<void>((resolve) => {
            finish = resolve;
          }),
          skipTransition: skip,
        };
      },
    });
    const f = fixture();
    const switching = f.state.go("analysis");
    await flushPromises();
    expect(document.documentElement.classList.contains("mobile-page-transition")).toBe(true);
    expect(f.page.value).toBe("inventory");
    await update();
    expect(f.page.value).toBe("analysis");
    finish();
    await switching;
    expect(document.documentElement.classList.contains("mobile-page-transition")).toBe(false);
    expect(f.state.pending.value).toBe(false);
    expect(f.animate).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
  it("slides out and in by menu order, preserving each page's scroll position", async () => {
    const f = fixture();
    vi.stubGlobal("scrollY", 240);
    const forward = f.state.go("analysis");
    await flushPromises();
    expect(f.page.value).toBe("inventory");
    expect(f.state.selected.value).toBe("analysis");
    expect(f.animate.mock.calls[0]?.[0]).toEqual([
      { opacity: 1, transform: "translateX(0)" },
      { opacity: 0, transform: "translateX(-36px)" },
    ]);
    f.motions[0]!.finish();
    await flushPromises();
    expect(f.page.value).toBe("analysis");
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0);
    f.motions[1]!.finish();
    await forward;
    expect(f.state.pending.value).toBe(false);
    vi.stubGlobal("scrollY", 0);
    const back = f.state.go("inventory");
    await flushPromises();
    f.motions[2]!.finish();
    await flushPromises();
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 240);
    expect(f.animate.mock.calls[3]?.[0]).toEqual([
      { opacity: 0, transform: "translateX(-44px)" },
      { opacity: 1, transform: "translateX(0)" },
    ]);
    f.motions[3]!.finish();
    await back;
    expect(f.page.value).toBe("inventory");
    f.wrapper.unmount();
  });
  it("keeps the previous page until code loads and ignores slower earlier selections", async () => {
    let resolve!: () => void;
    const prepare = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue(undefined);
    const f = fixture(prepare);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const slow = f.state.go("analysis");
    expect(f.page.value).toBe("inventory");
    await f.state.go("settings");
    resolve();
    await slow;
    expect(f.page.value).toBe("settings");
    expect(f.state.selected.value).toBe("settings");
    expect(f.animate).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
  it("cancels running motion, rolls back failed loads, and cleans up on unmount", async () => {
    const f = fixture();
    const first = f.state.go("analysis");
    await flushPromises();
    await f.state.go("inventory");
    await first;
    expect(f.motions[0]!.cancel).toHaveBeenCalled();
    expect(f.page.value).toBe("inventory");
    f.prepare.mockRejectedValueOnce(new Error("load failed"));
    await f.state.go("settings");
    expect(f.state.selected.value).toBe("inventory");
    expect(f.error).toHaveBeenCalledOnce();
    const leaving = f.state.go("analysis");
    await flushPromises();
    f.wrapper.unmount();
    await leaving;
    expect(f.state.pending.value).toBe(false);
    expect(f.page.value).toBe("inventory");
  });
  it("still switches when the animation API rejects the effect", async () => {
    const f = fixture();
    f.animate.mockImplementation(() => {
      throw new Error("animation unavailable");
    });
    await f.state.go("analysis");
    expect(f.page.value).toBe("analysis");
    expect(f.state.pending.value).toBe(false);
    f.wrapper.unmount();
  });
});
