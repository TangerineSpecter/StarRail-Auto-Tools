import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { useScreenshotCrop } from "@/features/capture/useScreenshotCrop";

const setFullscreen = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/window", () => ({
  windowApi: { setFullscreen, hide: vi.fn(), show: vi.fn() },
}));
vi.mock("@/shared/api/capture", () => ({
  captureApi: { captureDesktop: vi.fn(), recognizeScreenshot: vi.fn() },
}));

describe("useScreenshotCrop", () => {
  it("releases the preview and restores the window when unmounted", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const exposed: { state?: ReturnType<typeof useScreenshotCrop> } = {};
    const Host = defineComponent({
      setup() {
        exposed.state = useScreenshotCrop({
          busy: ref(false),
          setError: vi.fn(),
          setNotice: vi.fn(),
        });
        return () => null;
      },
    });
    const wrapper = mount(Host);
    exposed.state!.screenshotPreviewUrl.value = "blob:preview";
    exposed.state!.screenshotFullscreen.value = true;
    wrapper.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:preview");
    expect(setFullscreen).toHaveBeenCalledWith(false);
    revoke.mockRestore();
  });
});
