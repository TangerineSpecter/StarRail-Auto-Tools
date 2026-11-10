import { invoke } from "./invoke";
export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface MobileLayoutRegions {
  width: number;
  height: number;
  division: LayoutRect[];
  occlusion: LayoutRect[];
}
export const mobileLayoutApi = {
  regions: () => invoke<MobileLayoutRegions | null>("get_mobile_layout_regions"),
};
