import { flushPromises, shallowMount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ScannerPage from "@/pages/ScannerPage.vue";
import { runtimeContextKey } from "@/shared/contracts/runtime";

const cleanupApi = vi.hoisted(() => ({
  capabilities: vi.fn().mockResolvedValue({
    platformSupported: true,
    templatesCalibrated: false,
    previewAvailable: false,
    executionAvailable: false,
    message: "视觉模板尚未校准",
  }),
  modelStatus: vi.fn().mockResolvedValue({
    state: "missing",
    revision: null,
    directory: "",
    downloadedBytes: 0,
    totalBytes: 0,
    currentFile: null,
    message: "模型缺失",
  }),
  listQueue: vi.fn().mockResolvedValue([]),
  listRuns: vi.fn().mockResolvedValue([]),
  onModelProgress: vi.fn().mockResolvedValue(vi.fn()),
  onProgress: vi.fn().mockResolvedValue(vi.fn()),
}));

vi.mock("@/shared/api/relic-cleanup", () => ({ relicCleanupApi: cleanupApi }));

describe("ScannerPage", () => {
  it("does not initialize cleanup data again when returning to the cached mode", async () => {
    const wrapper = shallowMount(ScannerPage, {
      global: {
        provide: {
          [runtimeContextKey as symbol]: {
            direct: ref({ phase: "stopped" }),
            summary: ref({ relics: 0, lightCones: 0, characters: 0, teams: 0 }),
            busy: ref(false),
            error: ref(""),
            notice: ref(""),
            inventoryRevision: ref(0),
          },
        },
        stubs: {
          KeepAlive: false,
          RelicCleanupPanel: false,
          RelicMainStatScanner: true,
          InventoryDetailDrawer: true,
        },
      },
    });
    await flushPromises();

    expect(cleanupApi.capabilities).toHaveBeenCalledOnce();
    expect(cleanupApi.modelStatus).toHaveBeenCalledOnce();
    expect(cleanupApi.listQueue).toHaveBeenCalledOnce();
    expect(cleanupApi.listRuns).toHaveBeenCalledOnce();

    await wrapper.get(".scanner-mode-switch button:nth-child(2)").trigger("click");
    await wrapper.get(".scanner-mode-switch button:first-child").trigger("click");
    await flushPromises();

    expect(cleanupApi.capabilities).toHaveBeenCalledOnce();
    expect(cleanupApi.modelStatus).toHaveBeenCalledOnce();
    expect(cleanupApi.listQueue).toHaveBeenCalledOnce();
    expect(cleanupApi.listRuns).toHaveBeenCalledOnce();
  });
});
