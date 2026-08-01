import { defineComponent } from "vue";
import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRuntimeLifecycle } from "@/app/composables/useRuntimeLifecycle";
import { useRuntimeStore } from "@/app/stores/runtime";

const mocks = vi.hoisted(() => ({
  capabilities: vi.fn(),
  snapshot: vi.fn(),
  summary: vi.fn(),
  onStatus: vi.fn(),
  onChanged: vi.fn(),
}));
vi.mock("@/shared/api/system", () => ({ systemApi: { capabilities: mocks.capabilities } }));
vi.mock("@/shared/api/direct-read", () => ({
  directReadApi: { snapshot: mocks.snapshot, onStatus: mocks.onStatus },
}));
vi.mock("@/shared/api/inventory", () => ({
  inventoryApi: { summary: mocks.summary, onChanged: mocks.onChanged },
}));

const Host = defineComponent({ setup: () => useRuntimeLifecycle(), template: "<div />" });
const direct = {
  phase: "stopped",
  message: "",
  startedAt: null,
  lastSyncAt: null,
  relics: 0,
  lightCones: 0,
  characters: 0,
  protocolVersion: "v",
  currentUid: null,
  incomingUid: null,
  requiresAccountSwitch: false,
};
const summary = { relics: 0, lightCones: 0, characters: 0, lastSyncAt: null, protocolVersion: "v" };

describe("useRuntimeLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.snapshot.mockResolvedValue(direct);
    mocks.summary.mockResolvedValue(summary);
    mocks.capabilities.mockResolvedValue({ platform: "test" });
    mocks.onStatus.mockResolvedValue(vi.fn());
    mocks.onChanged.mockResolvedValue(vi.fn());
  });

  it("subscribes even when an initial snapshot fails", async () => {
    mocks.capabilities.mockRejectedValue(new Error("capabilities failed"));
    const pinia = createPinia();
    mount(Host, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(mocks.onStatus).toHaveBeenCalledOnce();
    expect(mocks.onChanged).toHaveBeenCalledOnce();
    expect(useRuntimeStore(pinia).summary).toEqual(summary);
  });

  it("disposes a subscription that resolves after unmount", async () => {
    let resolveStatus!: (stop: () => void) => void;
    const stop = vi.fn();
    mocks.onStatus.mockReturnValue(new Promise((resolve) => (resolveStatus = resolve)));
    const wrapper = mount(Host, { global: { plugins: [createPinia()] } });
    wrapper.unmount();
    resolveStatus(stop);
    await flushPromises();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("does not overwrite newer events with late initial snapshots", async () => {
    let resolveDirect!: (value: typeof direct) => void;
    let resolveSummary!: (value: typeof summary) => void;
    let directHandler!: (value: typeof direct) => void;
    let inventoryHandler!: (value: typeof summary) => void;
    mocks.snapshot.mockReturnValue(new Promise((resolve) => (resolveDirect = resolve)));
    mocks.summary.mockReturnValue(new Promise((resolve) => (resolveSummary = resolve)));
    mocks.onStatus.mockImplementation((handler) => {
      directHandler = handler;
      return Promise.resolve(vi.fn());
    });
    mocks.onChanged.mockImplementation((handler) => {
      inventoryHandler = handler;
      return Promise.resolve(vi.fn());
    });

    const pinia = createPinia();
    mount(Host, { global: { plugins: [pinia] } });
    await flushPromises();
    const eventDirect = { ...direct, phase: "ready", relics: 12 };
    const eventSummary = { ...summary, relics: 12 };
    directHandler(eventDirect);
    inventoryHandler(eventSummary);
    resolveDirect(direct);
    resolveSummary(summary);
    await flushPromises();

    const runtime = useRuntimeStore(pinia);
    expect(runtime.direct).toEqual(eventDirect);
    expect(runtime.summary).toEqual(eventSummary);
    expect(runtime.inventoryRevision).toBe(1);
  });
});
