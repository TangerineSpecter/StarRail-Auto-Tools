import { defineComponent, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { useFrameRate } from "@/app/composables/useFrameRate";

describe("useFrameRate", () => {
  it("publishes a one-second animation sample and cancels it on unmount", async () => {
    const callbacks: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    const Host = defineComponent({
      setup() {
        return useFrameRate();
      },
      template: '<output>{{ frameRate ?? "--" }}</output>',
    });
    const wrapper = mount(Host);
    expect(wrapper.text()).toBe("--");

    callbacks.shift()?.(0);
    for (let index = 1; index <= 60; index += 1) {
      callbacks.shift()?.(index === 60 ? 1000 : index * (1000 / 60));
    }
    await nextTick();

    expect(wrapper.text()).toBe("61");
    wrapper.unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });
});
