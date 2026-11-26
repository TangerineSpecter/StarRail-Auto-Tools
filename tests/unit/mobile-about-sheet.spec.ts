import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Drawer from "primevue/drawer";
import PrimeVue from "primevue/config";
import MobileAboutSheet from "@/mobile/MobileAboutSheet.vue";
import {
  APP_NAME,
  APP_SLUG,
  APP_VERSION,
  PROJECT_REPOSITORY,
  PROJECT_URL,
} from "@/shared/app-info";
import { characterCatalogue, lightConeCatalogue, relicCatalogue } from "@/shared/catalogue";
import type { InventorySummary } from "@/types";

const DrawerStub = {
  props: {
    visible: { type: Boolean, default: false },
    position: { type: String, default: "left" },
    blockScroll: { type: Boolean, default: false },
    showCloseIcon: { type: Boolean, default: true },
  },
  emits: ["update:visible"],
  template: `
    <div
      v-if="visible"
      class="p-drawer mobile-about-sheet"
      :data-position="position"
      :data-block-scroll="String(blockScroll)"
      :data-show-close-icon="String(showCloseIcon)"
    >
      <div class="p-drawer-header"><slot name="header" /></div>
      <div class="p-drawer-content"><slot /></div>
    </div>
  `,
};

const baseSummary: InventorySummary = {
  relics: 240,
  lightCones: 48,
  characters: 32,
  teams: 6,
  lastSyncAt: Date.UTC(2026, 4, 10, 8, 30, 0),
  protocolVersion: 3,
};

describe("MobileAboutSheet", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    document.body.innerHTML = "";
  });

  it("renders app version, introduction, snapshot stats, and catalogue counts", () => {
    const wrapper = mount(MobileAboutSheet, {
      props: {
        modelValue: true,
        summary: baseSummary,
      },
      global: {
        stubs: {
          Drawer: DrawerStub,
        },
      },
    });

    const drawer = wrapper.getComponent(DrawerStub);
    expect(drawer.props("position")).toBe("bottom");
    expect(drawer.props("blockScroll")).toBe(true);
    expect(drawer.props("showCloseIcon")).toBe(false);

    const text = wrapper.text();
    expect(text).toContain("关于星穹数据航站");
    expect(text).toContain(APP_NAME);
    expect(text).toContain(APP_SLUG);
    expect(text).toContain(`v${APP_VERSION}`);
    expect(text).toContain("v3");
    expect(text).toContain("32 角色 · 48 光锥 · 240 遗器 · 6 配队");
    expect(text).toContain(
      `${characterCatalogue.characters.length} 角色 · ${lightConeCatalogue.lightCones.length} 光锥 · ${relicCatalogue.sets.length} 套装`,
    );
    expect(text).toContain(PROJECT_REPOSITORY);
    expect(text).toContain(PROJECT_URL);
  });

  it("falls back cleanly when sync timestamp and protocol version are absent", () => {
    const wrapper = mount(MobileAboutSheet, {
      props: {
        modelValue: true,
        summary: {
          relics: 60,
          lightCones: 12,
          characters: 8,
          teams: 0,
          lastSyncAt: null,
          protocolVersion: null,
        },
      },
      global: {
        stubs: {
          Drawer: DrawerStub,
        },
      },
    });

    const text = wrapper.text();
    expect(text).toContain("尚未同步");
    expect(text).toContain("未记录");
    expect(text).toContain("8 角色 · 12 光锥 · 60 遗器");
    expect(text).not.toContain("0 配队");
  });

  it("copies project URL cleanly and handles unavailable clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const wrapper = mount(MobileAboutSheet, {
      props: {
        modelValue: true,
        summary: baseSummary,
      },
      global: {
        stubs: {
          Drawer: DrawerStub,
        },
      },
    });

    const copyBtn = wrapper.get(".mobile-about-copy-btn");
    expect(copyBtn.text()).toContain("复制仓库地址");

    await copyBtn.trigger("click");
    expect(writeText).toHaveBeenCalledWith(PROJECT_URL);
    expect(copyBtn.text()).toContain("已复制仓库地址");

    vi.advanceTimersByTime(2200);
    await wrapper.vm.$nextTick();
    expect(copyBtn.text()).toContain("复制仓库地址");

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    await copyBtn.trigger("click");
    expect(copyBtn.text()).toContain("请手动复制上方链接");
  });

  it("closes on finish button click and header drag-down gesture, and renders with PrimeVue Drawer", async () => {
    const onUpdateModelValue = vi.fn();
    const wrapper = mount(MobileAboutSheet, {
      props: {
        modelValue: true,
        summary: baseSummary,
        "onUpdate:modelValue": onUpdateModelValue,
      },
      global: {
        stubs: {
          Drawer: DrawerStub,
        },
      },
    });

    const header = wrapper.get(".mobile-about-header");
    await header.trigger("touchstart", {
      touches: [{ identifier: 1, clientX: 120, clientY: 100 }],
    });
    await header.trigger("touchmove", {
      touches: [{ identifier: 1, clientX: 120, clientY: 190 }],
    });
    await header.trigger("touchend", {
      touches: [],
      changedTouches: [{ identifier: 1, clientX: 120, clientY: 190 }],
    });
    expect(onUpdateModelValue).toHaveBeenCalledWith(false);

    onUpdateModelValue.mockClear();
    await wrapper.get(".mobile-about-close").trigger("click");
    expect(onUpdateModelValue).toHaveBeenCalledWith(false);
    wrapper.unmount();

    const realDrawerWrapper = mount(MobileAboutSheet, {
      props: {
        modelValue: true,
        summary: baseSummary,
      },
      global: {
        plugins: [PrimeVue],
        components: { Drawer },
      },
    });
    await realDrawerWrapper.vm.$nextTick();
    expect(document.body.querySelector(".mobile-about-version")?.textContent).toBe(
      `v${APP_VERSION}`,
    );
    const bodyClose = document.body.querySelector<HTMLButtonElement>(".mobile-about-close");
    expect(bodyClose).not.toBeNull();
    bodyClose?.click();
    await realDrawerWrapper.vm.$nextTick();
    expect(realDrawerWrapper.emitted("update:modelValue")).toEqual([[false]]);
    realDrawerWrapper.unmount();
  });
});
