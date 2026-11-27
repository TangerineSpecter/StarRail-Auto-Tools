import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CombatSimulatorDrawer from "@/features/combat-simulator/CombatSimulatorDrawer.vue";
import type { CombatantInput } from "@/shared/utils/combat";

const sampleFirefly: CombatantInput = {
  characterId: 1310,
  variantKey: "hsr/1310/destruction/base",
  name: "流萤",
  element: "fire",
  path: "毁灭",
  level: 80,
  eidolon: 0,
  abilityVersion: 1,
  skills: { basic: 6, skill: 10, ult: 10, talent: 10 },
  traces: {},
  maxEnergy: 240,
  sets: [
    { setId: 119, name: "荡除蠹灾的铁骑", pieces: 4 },
    { setId: 316, name: "劫火莲灯铸炼宫", pieces: 2 },
  ],
  lightCone: {
    templateId: 24000,
    name: "记一位星神的陨落",
    superimposition: 5,
    level: 80,
    ascension: 6,
  },
  standing: {
    level: 80,
    base: { hp: 2000, atk: 1053, def: 1000, speed: 104 },
    hp: 3100,
    atk: 2541,
    def: 1100,
    speed: 161,
    critRate: 0.2,
    critDamage: 0.7,
    breakEffect: 2.237,
    effectHitRate: 0.1,
    effectRes: 0.3,
    energyRegenRate: 0,
    healingBoost: 0,
    elation: 0,
    genericDamageBoost: 0,
    elementalDamageBoost: {},
    abilityDamageBoost: {},
    breakDamageBoost: 0,
    defensePenetration: 0,
    superBreakDefensePenetration: 0,
    resistancePenetration: 0,
    vulnerability: 0,
    breakVulnerability: 0,
    finalDamageBoost: 0,
    trueDamageModifier: 0,
    breakEfficiencyBoost: 0,
    superBreakModifier: 0,
  },
};

describe("CombatSimulatorDrawer", () => {
  it("renders cycle comparisons, battle logs, skill breakdown and rules tabs", async () => {
    const wrapper = mount(CombatSimulatorDrawer, {
      props: {
        title: "流萤 · 伤害分析与战斗模拟",
        mode: "single",
        combatants: [sampleFirefly],
      },
    });

    expect(wrapper.text()).toContain("流萤 · 伤害分析与战斗模拟");
    expect(wrapper.text()).toContain("1 轮");
    expect(wrapper.text()).toContain("3 轮");
    expect(wrapper.text()).toContain("5 轮");
    expect(wrapper.text()).toContain("10 轮");

    // Expand first battle log row
    const firstLogRow = wrapper.find(".combat-sim-log-row");
    expect(firstLogRow.exists()).toBe(true);
    await firstLogRow.trigger("click");
    expect(wrapper.find(".combat-sim-log-detail").exists()).toBe(true);

    // Switch to skills breakdown tab
    const tabs = wrapper.findAll("[role='tab']");
    await tabs[1]!.trigger("click");
    expect(wrapper.text()).toContain("火萤Ⅳ型-死星过载");
    expect(wrapper.text()).toContain("非暴击");
    expect(wrapper.text()).toContain("暴击");

    // Switch to rules tab
    await tabs[2]!.trigger("click");
    expect(wrapper.text()).toContain("γ模组");

    // Switch cycles to 10轮 and reroll seed
    const cycle10Btn = wrapper.findAll(".combat-sim-seg button").find((b) => b.text() === "10轮");
    expect(cycle10Btn).toBeTruthy();
    await cycle10Btn!.trigger("click");
    expect(wrapper.text()).toContain("10 轮模拟预期");

    const reroll = wrapper.find(".combat-sim-reroll-btn");
    const seedBefore = reroll.text();
    await reroll.trigger("click");
    expect(reroll.text()).not.toBe(seedBefore);

    // Escape closes the drawer
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("shows unavailable state when no combatants can be simulated", () => {
    const wrapper = mount(CombatSimulatorDrawer, {
      props: {
        title: "空队模拟",
        mode: "team",
        combatants: [],
        unavailableNotes: ["流萤 未装备光锥"],
      },
    });
    expect(wrapper.text()).toContain("当前无法启动战斗模拟");
    expect(wrapper.text()).toContain("流萤 未装备光锥");
    wrapper.unmount();
  });
});
