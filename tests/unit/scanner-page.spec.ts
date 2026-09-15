import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, onMounted, onUnmounted, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  taskStatus: vi.fn().mockResolvedValue(null),
  onModelProgress: vi.fn().mockResolvedValue(vi.fn()),
  onProgress: vi.fn().mockResolvedValue(vi.fn()),
  cancel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/api/relic-cleanup", () => ({ relicCleanupApi: cleanupApi }));

describe("ScannerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("keeps a stable component name without requiring page caching", () => {
    expect(ScannerPage.name).toBe("ScannerPage");
  });

  it("unmounts the cleanup panel when switching modes and mounts a fresh one when returning", async () => {
    const mounted = vi.fn();
    const unmounted = vi.fn();
    const CleanupPanelStub = defineComponent({
      name: "RelicCleanupPanel",
      setup() {
        onMounted(mounted);
        onUnmounted(unmounted);
        return () => "清理面板";
      },
    });
    const wrapper = mount(ScannerPage, {
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
          RelicCleanupPanel: CleanupPanelStub,
          RelicMainStatScanner: true,
          InventoryDetailDrawer: true,
        },
      },
    });
    await flushPromises();

    expect(mounted).toHaveBeenCalledOnce();

    await wrapper.get(".scanner-mode-switch button:nth-child(2)").trigger("click");
    await flushPromises();

    expect(unmounted).toHaveBeenCalledOnce();

    await wrapper.get(".scanner-mode-switch button:first-child").trigger("click");
    await flushPromises();

    expect(mounted).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    expect(unmounted).toHaveBeenCalledTimes(2);
  });
});
