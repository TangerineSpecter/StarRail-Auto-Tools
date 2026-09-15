import { defineComponent, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCleanupEmergencyStop } from "@/app/composables/useCleanupEmergencyStop";

const api = vi.hoisted(() => ({ cancel: vi.fn() }));
vi.mock("@/shared/api/relic-cleanup", () => ({ relicCleanupApi: api }));

const Host = defineComponent({
  setup() {
    const error = ref("");
    const notice = ref("");
    useCleanupEmergencyStop({ error, notice });
    return { error, notice };
  },
  template: "<div>{{ notice }}{{ error }}</div>",
});

const emergencyEvent = () =>
  new KeyboardEvent("keydown", { key: "F12", ctrlKey: true, shiftKey: true });

describe("useCleanupEmergencyStop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.cancel.mockResolvedValue(undefined);
  });

  it("keeps one application-wide emergency shortcut and removes it on unmount", async () => {
    const wrapper = mount(Host);

    window.dispatchEvent(emergencyEvent());
    await flushPromises();
    expect(api.cancel).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain("已触发紧急停止");

    wrapper.unmount();
    window.dispatchEvent(emergencyEvent());
    await flushPromises();
    expect(api.cancel).toHaveBeenCalledOnce();
  });
});
