import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import RelicSetCardPicker from "@/features/build-planner/RelicSetCardPicker.vue";

const options = [
  { setId: 101, name: "云无留迹的过客", kind: "cavern" as const },
  { setId: 102, name: "野穗伴行的快枪手", kind: "cavern" as const },
];

const planarOptions = [{ setId: 301, name: "太空封印站", kind: "planar" as const }];

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

  it("opens the archive card from the selected trigger info button without opening the picker", async () => {
    const emptyWrapper = mount(RelicSetCardPicker, {
      attachTo: document.body,
      props: { modelValue: null, options, label: "四件套" },
    });
    expect(emptyWrapper.find(".build-set-picker-info").exists()).toBe(false);
    emptyWrapper.unmount();

    const wrapper = mount(RelicSetCardPicker, {
      attachTo: document.body,
      props: { modelValue: 101, options, label: "四件套" },
    });

    const infoButton = wrapper.get<HTMLButtonElement>(".build-set-picker-info");
    const actionButtons = wrapper.findAll(".build-set-picker-actions > button");
    expect(actionButtons.map((btn) => btn.classes()[0])).toEqual([
      "build-set-info-btn",
      "build-set-picker-change",
    ]);
    expect(infoButton.attributes("aria-label")).toBe("查看云无留迹的过客图鉴效果");

    await infoButton.trigger("click");
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector(".build-set-dialog")).toBeNull();
    const infoModal = document.body.querySelector<HTMLElement>(".build-set-info-modal");
    expect(infoModal).not.toBeNull();
    expect(infoModal?.textContent).toContain("云无留迹的过客");
    expect(infoModal?.textContent).toContain("隧洞遗器");
    expect(infoModal?.textContent).toContain("治疗量提高");
    expect(infoModal?.textContent).toContain("恢复1个战技点");
    expect(infoModal?.textContent).toContain("头部");
    expect(infoModal?.textContent).toContain("脚部");
    expect(infoModal?.querySelector(".build-set-info-btn-primary")).toBeNull();
    expect(document.activeElement).toBe(infoModal?.querySelector(".build-set-info-close"));

    const lowerLayerEscape = vi.fn();
    window.addEventListener("keydown", lowerLayerEscape);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true }));
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector(".build-set-info-modal")).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector(".build-set-info-modal")).toBeNull();
    expect(lowerLayerEscape).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(infoButton.element);
    window.removeEventListener("keydown", lowerLayerEscape);

    await infoButton.trigger("click");
    await wrapper.vm.$nextTick();
    document.body.querySelector<HTMLElement>(".build-set-info-backdrop")?.click();
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector(".build-set-info-modal")).toBeNull();

    await wrapper.get(".build-set-picker-change").trigger("click");
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector(".build-set-dialog")).not.toBeNull();
    wrapper.unmount();
  });

  it("opens the archive card from option info buttons, preserves picker state on close, and supports selecting from the card", async () => {
    const wrapper = mount(RelicSetCardPicker, {
      attachTo: document.body,
      props: { modelValue: 101, options, label: "四件套" },
    });
    const trigger = wrapper.get<HTMLButtonElement>(".build-set-picker-trigger");

    await trigger.trigger("click");
    const optionInfoButtons = document.body.querySelectorAll<HTMLButtonElement>(
      ".build-set-dialog-option-info",
    );
    expect(optionInfoButtons).toHaveLength(2);

    // Inspect already-selected set first: shows selected badge without primary select button.
    optionInfoButtons[0].click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(document.body.querySelector(".build-set-dialog")).not.toBeNull();
    expect(document.body.querySelector(".build-set-info-selected-badge")?.textContent).toContain(
      "当前已选择",
    );
    expect(document.body.querySelector(".build-set-info-btn-primary")).toBeNull();

    // Escape closes only the archive card and keeps the picker dialog open.
    const lowerLayerEscape = vi.fn();
    window.addEventListener("keydown", lowerLayerEscape);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector(".build-set-info-modal")).toBeNull();
    expect(document.body.querySelector(".build-set-dialog")).not.toBeNull();
    expect(lowerLayerEscape).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(optionInfoButtons[0]);
    window.removeEventListener("keydown", lowerLayerEscape);

    // Inspect unselected set: Tab traps within the info modal, and selecting emits & closes both layers.
    optionInfoButtons[1].click();
    await wrapper.vm.$nextTick();
    const infoModal = document.body.querySelector<HTMLElement>(".build-set-info-modal");
    expect(infoModal?.textContent).toContain("野穗伴行的快枪手");
    expect(infoModal?.textContent).toContain("攻击力提高");

    const infoFocusable = infoModal!.querySelectorAll<HTMLElement>("button:not([disabled])");
    expect(infoFocusable.length).toBeGreaterThanOrEqual(3);
    infoFocusable[infoFocusable.length - 1].focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(document.activeElement).toBe(infoFocusable[0]);

    infoModal!.querySelector<HTMLButtonElement>(".build-set-info-btn-primary")!.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("update:modelValue")).toEqual([[102]]);
    expect(document.body.querySelector(".build-set-info-modal")).toBeNull();
    expect(document.body.querySelector(".build-set-dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it("renders planar ornament archive cards without a four-piece row", async () => {
    const wrapper = mount(RelicSetCardPicker, {
      attachTo: document.body,
      props: { modelValue: 301, options: planarOptions, label: "位面饰品 2 件套" },
    });

    await wrapper.get(".build-set-picker-info").trigger("click");
    await wrapper.vm.$nextTick();

    const infoModal = document.body.querySelector<HTMLElement>(".build-set-info-modal");
    expect(infoModal?.textContent).toContain("太空封印站");
    expect(infoModal?.textContent).toContain("位面饰品");
    expect(infoModal?.textContent).toContain("位面球");
    expect(infoModal?.textContent).toContain("连结绳");
    expect(infoModal?.querySelectorAll(".build-set-info-effect-row")).toHaveLength(1);
    wrapper.unmount();
  });
});
