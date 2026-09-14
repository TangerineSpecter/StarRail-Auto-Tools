import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RelicCleanupPanel from "@/features/relic-cleanup/RelicCleanupPanel.vue";
import { runtimeContextKey } from "@/shared/contracts/runtime";

const api = vi.hoisted(() => ({
  capabilities: vi.fn(),
  modelStatus: vi.fn(),
  listQueue: vi.fn(),
  listRuns: vi.fn(),
  onModelProgress: vi.fn(),
  onProgress: vi.fn(),
  fileUrl: vi.fn(),
}));

vi.mock("@/shared/api/relic-cleanup", () => ({ relicCleanupApi: api }));

const buttonStub = {
  template: '<button v-bind="$attrs"><slot /></button>',
};

function mountPanel() {
  return mount(RelicCleanupPanel, {
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
      stubs: { Button: buttonStub, ProgressBar: true },
    },
  });
}

describe("RelicCleanupPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.capabilities.mockResolvedValue({
      platformSupported: true,
      templatesCalibrated: false,
      previewAvailable: false,
      executionAvailable: false,
      message: "视觉模板尚未校准，预览和执行暂不可用",
    });
    api.modelStatus.mockResolvedValue({
      state: "ready",
      revision: "test",
      directory: "C:\\models",
      downloadedBytes: 1,
      totalBytes: 1,
      currentFile: null,
      message: "模型校验通过",
    });
    api.listQueue.mockResolvedValue([]);
    api.listRuns.mockResolvedValue([]);
    api.fileUrl.mockReturnValue("asset://test");
  });

  it("keeps preview disabled while the backend capability is closed", async () => {
    api.onModelProgress.mockResolvedValue(vi.fn());
    api.onProgress.mockResolvedValue(vi.fn());
    const wrapper = mountPanel();
    await flushPromises();

    const preview = wrapper.findAll("button").find((button) => button.text() === "运行预览");
    expect(preview?.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("视觉模板尚未校准");
  });

  it("immediately disposes subscriptions that resolve after unmount", async () => {
    const disposeModel = vi.fn();
    const disposeProgress = vi.fn();
    let resolveModel!: (dispose: () => void) => void;
    let resolveProgress!: (dispose: () => void) => void;
    api.onModelProgress.mockReturnValue(
      new Promise((resolve) => {
        resolveModel = resolve;
      }),
    );
    api.onProgress.mockReturnValue(
      new Promise((resolve) => {
        resolveProgress = resolve;
      }),
    );

    const wrapper = mountPanel();
    await flushPromises();
    wrapper.unmount();
    resolveModel(disposeModel);
    resolveProgress(disposeProgress);
    await flushPromises();

    expect(disposeModel).toHaveBeenCalledOnce();
    expect(disposeProgress).toHaveBeenCalledOnce();
  });
});
