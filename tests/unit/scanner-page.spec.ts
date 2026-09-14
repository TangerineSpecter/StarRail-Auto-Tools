import { flushPromises, shallowMount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  cancel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/api/relic-cleanup", () => ({ relicCleanupApi: cleanupApi }));

describe("ScannerPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("has the stable component name required by the app page cache", () => {
    expect(ScannerPage.name).toBe("ScannerPage");
  });

  it("refreshes cleanup data when returning to the cached mode", async () => {
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

    expect(cleanupApi.capabilities).toHaveBeenCalledTimes(2);
    expect(cleanupApi.modelStatus).toHaveBeenCalledTimes(2);
    expect(cleanupApi.listQueue).toHaveBeenCalledTimes(2);
    expect(cleanupApi.listRuns).toHaveBeenCalledTimes(2);
    expect(cleanupApi.onModelProgress).toHaveBeenCalledOnce();
    expect(cleanupApi.onProgress).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("keeps the emergency stop available while the cleanup panel is cached", async () => {
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

    await wrapper.get(".scanner-mode-switch button:nth-child(2)").trigger("click");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F12", ctrlKey: true, shiftKey: true }),
    );
    await flushPromises();

    expect(cleanupApi.cancel).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("applies progress received while the cleanup panel is cached when it becomes active", async () => {
    let progressHandler: ((value: Record<string, unknown>) => void) | undefined;
    cleanupApi.onProgress.mockImplementationOnce((handler) => {
      progressHandler = handler;
      return Promise.resolve(vi.fn());
    });
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
    await wrapper.get(".scanner-mode-switch button:nth-child(2)").trigger("click");

    progressHandler?.({
      runId: 1,
      runCode: "run-000001",
      phase: "previewCompleted",
      current: 1,
      total: 1,
      message: "后台识别完成",
      terminal: true,
    });
    await wrapper.get(".scanner-mode-switch button:first-child").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("后台识别完成");
    wrapper.unmount();
  });
});
