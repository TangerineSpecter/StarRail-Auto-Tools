import { inventoryApi } from "@/shared/api/inventory";
import type { CharacterListItem } from "@/types";

/** Backend pageSize max is 200; page until every owned character is loaded. */
const OWNED_PAGE_SIZE = 200;

export async function listAllOwnedCharacters(): Promise<CharacterListItem[]> {
  const items: CharacterListItem[] = [];
  let page = 1;
  while (true) {
    const result = await inventoryApi.listCharacters({
      page,
      pageSize: OWNED_PAGE_SIZE,
    });
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) break;
    page += 1;
  }
  return items;
}
