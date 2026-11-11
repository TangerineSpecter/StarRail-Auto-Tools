import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import InventoryDetailDrawer from "@/features/inventory/InventoryDetailDrawer.vue";
import { readOnlyViewKey } from "@/shared/contracts/view-mode";
import { mobileViewKey } from "@/shared/contracts/mobile-view";

const getPlan = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/build-plan", () => ({
  buildPlanApi: { get: getPlan },
}));

describe("InventoryDetailDrawer", () => {
  it("supports right-swipe return in mobile overlay and split detail, retaining vertical scrolling", async () => {
    getPlan.mockResolvedValue(null);
    const wrapper = mount(InventoryDetailDrawer, {
      props: { detail: null, loading: true },
      global: { provide: { [readOnlyViewKey as symbol]: true, [mobileViewKey as symbol]: true } },
    });
    await flushPromises();
    const content = wrapper.get(".detail-loading");
    const point = (x: number, y: number) => ({ identifier: 1, clientX: x, clientY: y });
    const swipe = async (dx: number, dy = 0, x = 100) => {
      await content.trigger("touchstart", { touches: [point(x, 200)] });
      const event = new Event("touchmove", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", { value: [point(x + dx, 200 + dy)] });
      content.element.dispatchEvent(event);
      await content.trigger("touchend", { touches: [], changedTouches: [point(x + dx, 200 + dy)] });
      return event;
    };
    expect((await swipe(4, -120)).defaultPrevented).toBe(false);
    await swipe(-100);
    await swipe(20);
    expect(wrapper.emitted("close")).toBeUndefined();
    await swipe(140, 0, 5);
    expect(wrapper.emitted("close")).toHaveLength(1);
    await wrapper.setProps({ inline: true });
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    document.body.append(modal);
    await swipe(140);
    expect(wrapper.emitted("close")).toHaveLength(1);
    modal.remove();
    await swipe(140);
    expect(wrapper.emitted("close")).toHaveLength(2);
    wrapper.unmount();
  });

  it("keeps inline details open on background clicks and while another modal handles Escape", async () => {
    getPlan.mockResolvedValue(null);
    const wrapper = mount(InventoryDetailDrawer, {
      props: { detail: null, loading: true, inline: true },
      global: { provide: { [readOnlyViewKey as symbol]: true } },
    });
    expect(wrapper.get("aside").attributes("role")).toBe("region");
    expect(wrapper.get("aside").attributes("aria-modal")).toBeUndefined();
    await wrapper.get(".inventory-detail-inline").trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    document.body.append(modal);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wrapper.emitted("close")).toBeUndefined();
    modal.remove();
    await wrapper.get('[aria-label="关闭详情"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("closes on Escape and ignores Escape used by an IME composition", async () => {
    getPlan.mockResolvedValue(null);
    const close = vi.fn();
    const wrapper = mount(InventoryDetailDrawer, {
      props: { detail: null, loading: true, onClose: close },
      global: {
        stubs: {
          CharacterDetail: true,
          LightConeDetail: true,
          RelicDetail: true,
        },
      },
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true }));
    expect(close).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledOnce();

    wrapper.unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("ignores stale plan responses when switching characters quickly", async () => {
    let resolveSlow: (value: unknown) => void = () => undefined;
    const slow = new Promise((resolve) => {
      resolveSlow = resolve;
    });
    getPlan
      .mockImplementationOnce(() => slow)
      .mockResolvedValueOnce({
        characterId: 2,
        cavernMode: "fourPiece",
        cavernSetA: 1,
        cavernSetB: null,
        planarSetId: 1,
        mainStats: {},
        targets: [{ statKey: "SPD", target: 134, minimum: 120, priority: 1 }],
        effectiveSubstats: [],
        note: "fast",
        substatWeights: {},
        minPotentialPct: 40,
        spdTarget: 0,
      });

    const wrapper = mount(InventoryDetailDrawer, {
      props: {
        detail: {
          kind: "character",
          data: {
            characterId: 1,
            name: "慢角色",
            path: "Hunt",
            level: 80,
            ascension: 6,
            eidolon: 0,
            skills: {},
            traces: {},
            abilityVersion: 1,
            updatedAt: 0,
          },
        },
        loading: false,
      },
      global: {
        stubs: {
          CharacterDetail: {
            props: ["detail", "plan"],
            template: `<div class="stub-plan">{{ plan?.note ?? "none" }}</div>`,
          },
          LightConeDetail: true,
          RelicDetail: true,
        },
      },
    });
    await flushPromises();

    await wrapper.setProps({
      detail: {
        kind: "character",
        data: {
          characterId: 2,
          name: "快角色",
          path: "Hunt",
          level: 80,
          ascension: 6,
          eidolon: 0,
          skills: {},
          traces: {},
          abilityVersion: 1,
          updatedAt: 0,
        },
      },
    });
    await flushPromises();
    expect(wrapper.find(".stub-plan").text()).toBe("fast");

    resolveSlow({
      characterId: 1,
      cavernMode: "fourPiece",
      cavernSetA: 1,
      cavernSetB: null,
      planarSetId: 1,
      mainStats: {},
      targets: [{ statKey: "SPD", target: 134, minimum: 120, priority: 1 }],
      effectiveSubstats: [],
      note: "stale-slow",
      substatWeights: {},
      minPotentialPct: 40,
      spdTarget: 0,
    });
    await flushPromises();
    // Stale response must not overwrite the newer character plan.
    expect(wrapper.find(".stub-plan").text()).toBe("fast");
    wrapper.unmount();
  });
});
