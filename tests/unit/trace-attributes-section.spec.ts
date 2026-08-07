import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createPinia } from "pinia";
import CharacterDetail from "@/features/inventory/CharacterDetail.vue";

describe("CharacterDetail Trace Attributes Section", () => {
  const mockDetail = {
    characterId: 1308,
    name: "黄泉",
    path: "Warlock",
    level: 80,
    ascension: 6,
    eidolon: 0,
    abilityVersion: 1,
    updatedAt: Date.now(),
    skills: {
      a: 6,
      b: 10,
      c: 10,
      d: 10,
    },
    equippedLightCone: null,
    equippedRelics: [],
  };

  it("renders trace section header with count badge and summary bar", () => {
    const wrapper = mount(CharacterDetail, {
      props: { detail: mockDetail },
      global: { plugins: [createPinia()] },
    });

    const traceSection = wrapper.find(".trace-stat-section");
    expect(traceSection.exists()).toBe(true);
    expect(traceSection.find(".trace-count-badge").text()).toContain("已启用");
    expect(traceSection.find(".trace-quick-actions").exists()).toBe(true);

    const cards = traceSection.findAll(".trace-node-card");
    expect(cards.length).toBeGreaterThan(0);
  });

  it("toggles all trace nodes when clicking quick action buttons", async () => {
    const wrapper = mount(CharacterDetail, {
      props: { detail: mockDetail },
      global: { plugins: [createPinia()] },
    });

    const clearBtn = wrapper.find(".trace-quick-actions button:last-child");
    await clearBtn.trigger("click");

    expect(wrapper.find(".trace-summary-empty").exists()).toBe(true);

    const selectBtn = wrapper.find(".trace-quick-actions button:first-child");
    await selectBtn.trigger("click");

    expect(wrapper.find(".trace-summary-bar").exists()).toBe(true);
  });

  it("maintains a stable stat summary order when individual nodes are toggled", async () => {
    const wrapper = mount(CharacterDetail, {
      props: { detail: mockDetail },
      global: { plugins: [createPinia()] },
    });

    const getSummaryKeys = () => wrapper.findAll(".summary-chip .chip-name").map((el) => el.text());

    const initialOrder = getSummaryKeys();
    expect(initialOrder.length).toBeGreaterThan(1);

    // Toggle off a node and then toggle it back on
    const firstNodeCard = wrapper.find(".trace-node-card");
    await firstNodeCard.trigger("click");
    await firstNodeCard.trigger("click");

    const newOrder = getSummaryKeys();
    expect(newOrder).toEqual(initialOrder);
  });
});
