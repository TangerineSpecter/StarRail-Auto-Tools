import { shallowMount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it } from "vitest";
import DirectReadPanel from "@/features/capture/DirectReadPanel.vue";
import DirectReadLogPanel from "@/features/capture/DirectReadLogPanel.vue";
import OcrPanel from "@/features/capture/OcrPanel.vue";
import ScreenshotCropOverlay from "@/features/capture/ScreenshotCropOverlay.vue";
import CapturePage from "@/pages/CapturePage.vue";
import { runtimeContextKey } from "@/shared/contracts/runtime";
import type { DirectReadSnapshot, InventorySummary } from "@/types";

const snapshot: DirectReadSnapshot = {
  phase: "waitingForLogin",
  message: "监听已就绪",
  startedAt: 1,
  lastSyncAt: null,
  relics: 0,
  lightCones: 0,
  characters: 0,
  protocolVersion: "reliquary-v23.0.0 / HSR-4.5",
  currentUid: null,
  incomingUid: null,
  requiresAccountSwitch: false,
  logs: [
    { at: 1_780_000_000_000, level: "info", message: "抓包已就绪" },
    { at: 1_780_000_010_000, level: "warn", message: "尚未收到游戏 UDP 包" },
  ],
};

describe("DirectReadPanel", () => {
  it("keeps the action below the counts without duplicating the activity panel", () => {
    const wrapper = shallowMount(DirectReadPanel, {
      props: { direct: snapshot, busy: false, running: true },
      global: { stubs: { Button: false } },
    });

    expect(wrapper.find(".direct-log").exists()).toBe(false);
    const markup = wrapper.html();
    expect(markup.indexOf("capture-counts")).toBeLessThan(markup.indexOf("primary-action"));
  });
});

describe("DirectReadLogPanel", () => {
  it("shows activity and listening state in its own panel", () => {
    const wrapper = shallowMount(DirectReadLogPanel, {
      props: { direct: snapshot, running: true },
    });

    expect(wrapper.findAll(".direct-log-line").map((line) => line.text())).toEqual([
      expect.stringContaining("抓包已就绪"),
      expect.stringContaining("尚未收到游戏 UDP 包"),
    ]);
    expect(wrapper.find("[role='log']").exists()).toBe(true);
    expect(wrapper.find(".direct-log-state").text()).toBe("监听中");
  });

  it("shows the current status before any log arrives", () => {
    const wrapper = shallowMount(DirectReadLogPanel, {
      props: { direct: { ...snapshot, logs: [] }, running: false },
    });

    expect(wrapper.find(".direct-log-empty").text()).toBe("监听已就绪");
    expect(wrapper.find(".direct-log-state").text()).toBe("未监听");
  });
});

describe("CapturePage", () => {
  it("places the log beside the direct reader and hides screenshot recognition", () => {
    const summary: InventorySummary = {
      relics: 0,
      lightCones: 0,
      characters: 0,
      teams: 0,
      lastSyncAt: null,
      protocolVersion: snapshot.protocolVersion,
    };
    const wrapper = shallowMount(CapturePage, {
      global: {
        provide: {
          [runtimeContextKey as symbol]: {
            direct: ref(snapshot),
            summary: ref(summary),
            busy: ref(false),
            error: ref(""),
            notice: ref(""),
            inventoryRevision: ref(0),
          },
        },
      },
    });

    expect(wrapper.findComponent(DirectReadPanel).exists()).toBe(true);
    expect(wrapper.findComponent(DirectReadLogPanel).props("direct")).toEqual(snapshot);
    expect(wrapper.findComponent(OcrPanel).exists()).toBe(false);
    expect(wrapper.findComponent(ScreenshotCropOverlay).exists()).toBe(false);
  });
});
