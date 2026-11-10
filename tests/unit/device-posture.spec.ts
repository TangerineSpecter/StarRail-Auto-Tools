import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { detectDevicePosture } from "@/mobile/device-posture";

describe("detectDevicePosture", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      innerWidth: 400,
      innerHeight: 700,
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

  it("defaults to landscape-hinge-bottom when in landscape and orientation is unspecified", () => {
    Object.assign(globalThis.window, { innerWidth: 700, innerHeight: 400, orientation: undefined });
    expect(detectDevicePosture()).toBe("landscape-hinge-bottom");
  });
});
