import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LightConeStatsModal from "@/features/catalogue/LightConeStatsModal.vue";

const lightCone = {
  id: 23024,
  name: "到不了的彼岸",
  rarity: 5,
  path: "毁灭",
  image: null,
};

describe("LightConeStatsModal", () => {
  it("closes on Escape", () => {
    const wrapper = mount(LightConeStatsModal, {
      props: { lightCone, ownedCount: 2 },
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true }));
    expect(wrapper.emitted("close")).toBeUndefined();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });
});
