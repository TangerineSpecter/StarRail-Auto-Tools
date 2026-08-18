import type { InventoryEquipmentCounts } from "@/types";

export function relicOwnedCountMap(counts: InventoryEquipmentCounts): Map<number, number> {
  return new Map(counts.relics.map((item) => [item.setId, item.count]));
}

export function lightConeOwnedCountMap(counts: InventoryEquipmentCounts): Map<number, number> {
  return new Map(counts.lightCones.map((item) => [item.templateId, item.count]));
}

export function ownedCountOf(counts: Map<number, number>, id: number): number {
  return counts.get(id) ?? 0;
}

export function formatOwnedCount(count: number, unit: string): string {
  return count > 0 ? `持有 ${count} ${unit}` : "未持有";
}
