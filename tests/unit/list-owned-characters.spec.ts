import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterListItem } from "@/types";

const listCharacters = vi.fn();

vi.mock("@/shared/api/inventory", () => ({
  inventoryApi: {
    listCharacters: (...args: unknown[]) => listCharacters(...args),
  },
}));

import { listAllOwnedCharacters } from "@/features/team/list-owned-characters";

function character(id: number): CharacterListItem {
  return {
    characterId: id,
    name: `角色${id}`,
    path: "Hunt",
    level: 80,
    ascension: 6,
    eidolon: 0,
    hasBuildPlan: false,
    abilityVersion: 1,
    source: "test",
    updatedAt: 1,
  };
}

describe("listAllOwnedCharacters", () => {
  beforeEach(() => {
    listCharacters.mockReset();
  });

  it("pages until every owned character is loaded", async () => {
    listCharacters
      .mockResolvedValueOnce({
        items: Array.from({ length: 200 }, (_, index) => character(index + 1)),
        total: 250,
        page: 1,
        pageSize: 200,
      })
      .mockResolvedValueOnce({
        items: Array.from({ length: 50 }, (_, index) => character(index + 201)),
        total: 250,
        page: 2,
        pageSize: 200,
      });

    const items = await listAllOwnedCharacters();
    expect(items).toHaveLength(250);
    expect(listCharacters).toHaveBeenCalledTimes(2);
    expect(listCharacters).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 200 });
    expect(listCharacters).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 200 });
  });

  it("stops when a page returns no items", async () => {
    listCharacters.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 200,
    });
    await expect(listAllOwnedCharacters()).resolves.toEqual([]);
    expect(listCharacters).toHaveBeenCalledTimes(1);
  });
});
