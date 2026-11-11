import type { Ref } from "vue";
import type { InventoryKind } from "@/types";
import { useHorizontalSwipe } from "@/shared/ui/useHorizontalSwipe";
import { mobileInventoryCategories } from "./mobile-inventory-categories";

export function useInventoryCategorySwipe(options: {
  surface: Ref<HTMLElement | null>;
  kind: Ref<InventoryKind>;
  enabled: Ref<boolean>;
  switchTo: (kind: InventoryKind) => void;
}) {
  useHorizontalSwipe({
    surface: options.surface,
    enabled: options.enabled,
    onSwipe(direction) {
      const index = mobileInventoryCategories.findIndex((item) => item.id === options.kind.value);
      const next = mobileInventoryCategories[index + (direction === "left" ? 1 : -1)];
      if (next) options.switchTo(next.id);
    },
  });
}
