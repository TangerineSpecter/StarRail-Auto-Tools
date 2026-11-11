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
function fixture() {
  let state!: ReturnType<typeof useInventoryArchive>;
  const error = vi.fn();
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useInventoryArchive({
          summary: ref({ relics: 60, lightCones: 16, characters: 20 }),
          direct: ref({} as never),
          busy: ref(false),
          revision: ref(0),
          setError: error,
          setNotice: vi.fn(),
        });
        return () => h("div");
      },
    }),
  );
  return { state, wrapper, error };
}
describe("prepared inventory categories", () => {
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
