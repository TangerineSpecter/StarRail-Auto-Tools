import type { InventoryKind } from "@/types";

export const mobileInventoryCategories: { id: InventoryKind; name: string; unit: string }[] = [
  { id: "relic", name: "遗器", unit: "件" },
  { id: "lightCone", name: "光锥", unit: "把" },
  { id: "character", name: "角色", unit: "名" },
];

export function mobileInventoryCategoryMeta(kind: InventoryKind): { name: string; unit: string } {
  return mobileInventoryCategories.find((item) => item.id === kind) ?? mobileInventoryCategories[0];
}
