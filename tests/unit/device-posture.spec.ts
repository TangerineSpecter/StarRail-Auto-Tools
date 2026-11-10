import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { detectDevicePosture, initDevicePostureWatcher } from "@/mobile/device-posture";

describe("detectDevicePosture", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      innerWidth: 400,
      innerHeight: 700,
      getComputedStyle: originalWindow.getComputedStyle.bind(originalWindow),
    };
  });

  afterEach(() => {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  });

  it("detects portrait mode when height > width", () => {
    Object.assign(globalThis.window, { innerWidth: 400, innerHeight: 700 });
    expect(detectDevicePosture()).toBe("portrait");
  });

  it("detects landscape-hinge-top when window.orientation is -90", () => {
    Object.assign(globalThis.window, { innerWidth: 700, innerHeight: 400, orientation: -90 });
    expect(detectDevicePosture()).toBe("landscape-hinge-top");
  });

  it("detects landscape-hinge-bottom when window.orientation is 90", () => {
    Object.assign(globalThis.window, { innerWidth: 700, innerHeight: 400, orientation: 90 });
    expect(detectDevicePosture()).toBe("landscape-hinge-bottom");
  });

  it("detects landscape-hinge-top when window.orientation is 270", () => {
    Object.assign(globalThis.window, { innerWidth: 700, innerHeight: 400, orientation: 270 });
    expect(detectDevicePosture()).toBe("landscape-hinge-top");
  });

  it("detects unfolded-portrait when dimensions match large inner unfolded screen in portrait", () => {
    Object.assign(globalThis.window, { innerWidth: 669, innerHeight: 951 });
    expect(detectDevicePosture()).toBe("unfolded-portrait");
  });

  it("detects unfolded-landscape when dimensions match large inner unfolded screen in landscape", () => {
    Object.assign(globalThis.window, { innerWidth: 951, innerHeight: 669 });
    expect(detectDevicePosture()).toBe("unfolded-landscape");
  });

  it.each([
    [579, 900, "portrait"],
    [580, 800, "unfolded-portrait"],
    [700, 790, "portrait"],
    [799, 600, "landscape-hinge-bottom"],
    [800, 560, "unfolded-landscape"],
    [951, 559, "landscape-hinge-bottom"],
  ])("classifies boundary viewport %i × %i as %s", (innerWidth, innerHeight, posture) => {
    Object.assign(globalThis.window, { innerWidth, innerHeight });
    expect(detectDevicePosture()).toBe(posture);
  });

  it("uses screen orientation when the legacy window angle is unavailable", () => {
    Object.assign(globalThis.window, {
      innerWidth: 700,
      innerHeight: 400,
      screen: { orientation: { angle: 270 } },
    });
    expect(detectDevicePosture()).toBe("landscape-hinge-top");
  });
});

describe("device posture watcher", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.posture;
  });

  it("updates on resize and cancels all pending work when disposed", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(0), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    let width = 466;
    let height = 678;
    vi.spyOn(window, "innerWidth", "get").mockImplementation(() => width);
    vi.spyOn(window, "innerHeight", "get").mockImplementation(() => height);

    const dispose = initDevicePostureWatcher();
    expect(document.documentElement.dataset.posture).toBe("portrait");
    width = 951;
    height = 669;
    window.dispatchEvent(new Event("resize"));
    expect(document.documentElement.dataset.posture).toBe("unfolded-landscape");

    dispose();
    expect(vi.getTimerCount()).toBe(0);
    width = 466;
    height = 678;
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("orientationchange"));
    vi.runAllTimers();
    expect(document.documentElement.dataset.posture).toBe("unfolded-landscape");
  });
});
