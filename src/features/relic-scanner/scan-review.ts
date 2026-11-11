import type { RelicMainStatSetGroup } from "@/types";

export interface ScanReviewFilters {
  category: string;
  slot: string;
  search: string;
}

export const emptyScanReviewFilters = (): ScanReviewFilters => ({
  category: "all",
  slot: "all",
  search: "",
});

export interface ScanReviewGroup extends RelicMainStatSetGroup {
  groupTotal: number;
  isPlanar: boolean;
}
