import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { initContentRegionWatcher } from "@/mobile/useLayoutRegions";

const { regions } = vi.hoisted(() => ({ regions: vi.fn() }));
vi.mock("@/shared/api/mobile-layout", () => ({ mobileLayoutApi: { regions } }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  document.body.innerHTML = "";
  delete document.documentElement.dataset.contentFold;
});
describe("native content-region lifecycle", () => {
  it("does not overlap native requests or update the document after cleanup", async () => {
    vi.useFakeTimers();
    let resolve!: (value: null) => void;
    regions.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const stop = initContentRegionWatcher();
    await vi.advanceTimersByTimeAsync(1500);
    expect(regions).toHaveBeenCalledTimes(1);
    stop();
    resolve(null);
    await flushPromises();
    expect(document.documentElement.dataset.contentFold).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1000);
    expect(regions).toHaveBeenCalledTimes(1);
  });
  it("falls back gracefully when reserved-region APIs are unavailable", async () => {
    document.body.innerHTML = '<div class="mobile-content"></div>';
    regions.mockRejectedValue(new Error("unsupported"));
    const stop = initContentRegionWatcher();
    await flushPromises();
    expect(document.documentElement.dataset.contentFold).toBe("flat");
    stop();
    expect(document.documentElement.style.getPropertyValue("--content-sheet-width")).toBe("");
  });
});
