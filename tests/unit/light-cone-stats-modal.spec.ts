import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { mobileViewKey } from "@/shared/contracts/mobile-view";
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
  it("uses the compact mobile strip without duplicate English labels", () => {
    const props = {
      lightCone: { ...lightCone, baseStats: { hp: 1058, attack: 635, defense: 396 } },
      ownedCount: 0,
    };
    const mobile = mount(LightConeStatsModal, {
      props,
      global: { provide: { [mobileViewKey as symbol]: true } },
    });
    expect(mobile.get(".lightcone-catalogue-modal").classes()).toContain("lightcone-modal-mobile");
    expect(mobile.findAll(".lightcone-stat-item")).toHaveLength(3);
    expect(mobile.find(".stat-abbr").exists()).toBe(false);
    expect(mobile.findAll(".stat-value").map((value) => value.text())).toEqual([
      "1058",
      "635",
      "396",
    ]);
    const desktop = mount(LightConeStatsModal, { props });
    expect(desktop.findAll(".stat-abbr")).toHaveLength(3);
    mobile.unmount();
    desktop.unmount();
  });
});
