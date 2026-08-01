import { describe, expect, it, vi } from "vitest";
import { useInventoryDetail } from "@/features/inventory/useInventoryDetail";

const detail = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/inventory", () => ({ inventoryApi: { detail } }));

describe("useInventoryDetail", () => {
  it("ignores an older request that resolves last", async () => {
    let resolveFirst!: (value: unknown) => void;
    detail
      .mockReset()
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ kind: "relic", data: { itemId: 2 } });
    const state = useInventoryDetail(vi.fn());
    const first = state.open("relic", 1);
    await state.open("relic", 2);
    resolveFirst({ kind: "relic", data: { itemId: 1 } });
    await first;
    expect(state.detail.value?.data.itemId).toBe(2);
  });
});
