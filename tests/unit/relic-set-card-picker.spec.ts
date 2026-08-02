import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import RelicSetCardPicker from "@/features/build-planner/RelicSetCardPicker.vue";

const options = [
  { setId: 101, name: "云无留迹的过客", kind: "cavern" as const },
  { setId: 102, name: "野穗伴行的快枪手", kind: "cavern" as const },
];

describe("RelicSetCardPicker", () => {
  it("shows illustrated set cards and emits the selected set", async () => {
    const wrapper = mount(RelicSetCardPicker, {
      props: { modelValue: 101, options, label: "四件套" },
    });

    await wrapper.get(".build-set-picker-trigger").trigger("click");
    const setOptions = document.body.querySelectorAll<HTMLElement>('[role="option"]');
    expect(setOptions).toHaveLength(2);
    expect(setOptions[0].textContent).toContain("云无留迹的过客");
    expect(setOptions[1].querySelector("img")?.getAttribute("src")).toBe("/relic-sets/102.webp");

    setOptions[1].click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("update:modelValue")).toEqual([[102]]);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    wrapper.unmount();
  });

  it("filters sets by a partial name and shows an empty state when nothing matches", async () => {
    const wrapper = mount(RelicSetCardPicker, {
      attachTo: document.body,
      props: { modelValue: 101, options, label: "四件套" },
    });

    await wrapper.get(".build-set-picker-trigger").trigger("click");
    const search = document.body.querySelector<HTMLInputElement>(".build-set-dialog-search input");
    expect(document.activeElement).toBe(search);
    search!.value = "快枪";
    search!.dispatchEvent(new Event("input"));
    await wrapper.vm.$nextTick();
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(document.body.textContent).toContain("野穗伴行的快枪手");

    search!.value = "不存在";
    search!.dispatchEvent(new Event("input"));
    await wrapper.vm.$nextTick();
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(document.body.textContent).toContain("未找到匹配的套装");
    wrapper.unmount();
  });

  it("closes only its own layer when the user presses Escape", async () => {
    const wrapper = mount(RelicSetCardPicker, {
      attachTo: document.body,
      props: { modelValue: 101, options, label: "四件套" },
    });

    await wrapper.get(".build-set-picker-trigger").trigger("click");
    const lowerLayerEscape = vi.fn();
    window.addEventListener("keydown", lowerLayerEscape);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(lowerLayerEscape).not.toHaveBeenCalled();
    window.removeEventListener("keydown", lowerLayerEscape);

    await wrapper.get(".build-set-picker-trigger").trigger("click");
    document.querySelector<HTMLElement>(".build-set-dialog-backdrop")?.click();
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    wrapper.unmount();
  });

  it("keeps keyboard focus in the dialog and returns it to the trigger on close", async () => {
    const wrapper = mount(RelicSetCardPicker, {
      attachTo: document.body,
      props: { modelValue: 101, options, label: "四件套" },
    });
    const trigger = wrapper.get<HTMLButtonElement>(".build-set-picker-trigger");

    await trigger.trigger("click");
    const focusable = document.body.querySelectorAll<HTMLElement>(
      ".build-set-dialog input:not([disabled]), .build-set-dialog button:not([disabled])",
    );
    expect(document.activeElement).toBe(
      document.body.querySelector(".build-set-dialog-search input"),
    );

    focusable[focusable.length - 1].focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(document.activeElement).toBe(focusable[0]);

    focusable[0].focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });
});
