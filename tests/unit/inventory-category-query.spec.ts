import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { relics, lightCones, characters } from "@/shared/dev/mobile-fixtures";
import { useInventoryArchive } from "@/features/inventory/useInventoryArchive";

const api = vi.hoisted(() => ({
  listRelics: vi.fn(),
  listLightCones: vi.fn(),
  listCharacters: vi.fn(),
}));
vi.mock("@/shared/api/inventory", () => ({ inventoryApi: api }));
const page = <T>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 50 });
beforeEach(() => {
  vi.clearAllMocks();
  api.listRelics.mockResolvedValue(page(relics));
  api.listLightCones.mockResolvedValue(page(lightCones));
  api.listCharacters.mockResolvedValue(page(characters));
});
function fixture(cachePrepared = false) {
  let state!: ReturnType<typeof useInventoryArchive>;
  const error = vi.fn();
  const revision = ref(0);
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useInventoryArchive({
          summary: ref({ relics: 60, lightCones: 16, characters: 20 }),
          direct: ref({} as never),
          busy: ref(false),
          revision,
          cachePrepared,
          setError: error,
          setNotice: vi.fn(),
        });
        return () => h("div");
      },
    }),
  );
  return { state, wrapper, error, revision };
}
describe("prepared inventory categories", () => {
  it("preloads a neighbour without changing the active page or cancelling an existing read", async () => {
    const { state, wrapper } = fixture(true);
    await state.load();
    const page = state.result.value;
    const ready = await state.previewKind("lightCone");
    expect(ready.items).toEqual(lightCones);
    expect(state.kind.value).toBe("relic");
    expect(state.result.value).toBe(page);
    (await state.prepareKind("lightCone"))!();
    expect(api.listLightCones).toHaveBeenCalledOnce();
    expect(state.kind.value).toBe("lightCone");
    wrapper.unmount();
  });
  it("reuses a first-page mobile result only for the same filters and inventory revision", async () => {
    const { state, wrapper, revision } = fixture(true);
    await state.load();
    state.result.value.page = 2;
    (await state.prepareKind("lightCone"))!();
    (await state.prepareKind("relic"))!();
    expect(api.listRelics).toHaveBeenCalledOnce();
    expect(state.result.value.page).toBe(1);
    state.filters.value.search = "新筛选";
    (await state.prepareKind("lightCone"))!();
    (await state.prepareKind("relic"))!();
    expect(api.listRelics).toHaveBeenCalledTimes(2);
    expect(api.listRelics).toHaveBeenLastCalledWith(expect.objectContaining({ search: "新筛选" }));
    const prepared = await state.prepareKind("lightCone");
    revision.value += 1;
    expect(prepared!()).toBe(false);
    (await state.prepareKind("lightCone"))!();
    expect(api.listLightCones).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
  it("ignores a late loading error after the pending category is cancelled", async () => {
    const { state, wrapper, error } = fixture();
    await state.load();
    let reject!: (error: Error) => void;
    api.listLightCones.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const pending = state.prepareKind("lightCone");
    state.cancelPreparedKind();
    error.mockClear();
    reject(new Error("cancelled query failed late"));
    expect(await pending).toBeNull();
    expect(state.kind.value).toBe("relic");
    expect(state.result.value.items).toEqual(relics);
    expect(error).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("keeps existing data until a ready category is committed", async () => {
    const { state, wrapper } = fixture();
    await state.load();
    state.selectedIds.value = new Set([relics[0]!.itemId]);
    const prepared = await state.prepareKind("lightCone");
    expect(state.kind.value).toBe("relic");
    expect(state.result.value.items).toEqual(relics);
    expect(state.selectedIds.value.size).toBe(1);
    expect(prepared!()).toBe(true);
    expect(state.kind.value).toBe("lightCone");
    expect(state.result.value.items).toEqual(lightCones);
    expect(state.selectedIds.value.size).toBe(0);
    expect(api.listLightCones).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 50 }),
    );
    wrapper.unmount();
  });
  it("invalidates older prepared data and keeps the visible page after errors", async () => {
    const { state, wrapper, error } = fixture();
    await state.load();
    const older = await state.prepareKind("lightCone");
    const latest = await state.prepareKind("character");
    expect(older!()).toBe(false);
    expect(latest!()).toBe(true);
    api.listRelics.mockRejectedValueOnce(new Error("read failed"));
    expect(await state.prepareKind("relic")).toBeNull();
    expect(state.kind.value).toBe("character");
    expect(state.result.value.items).toEqual(characters);
    expect(error).toHaveBeenLastCalledWith("Error: read failed");
    wrapper.unmount();
  });
});
