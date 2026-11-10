import type { MobileLayoutRegions } from "@/shared/api/mobile-layout";

export interface ContentFrame {
  left: number;
  right: number;
  width: number;
  height: number;
}
export function foldLayout(regions: MobileLayoutRegions | null, frame: ContentFrame) {
  if (!regions || regions.width <= 0 || regions.height <= 0) return null;
  const sx = frame.width / regions.width;
  const sy = frame.height / regions.height;
  for (const raw of regions.division) {
    const rect = { x: raw.x * sx, y: raw.y * sy, width: raw.width * sx, height: raw.height * sy };
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) continue;
    // Inactive/flat division regions have zero thickness. Require two usable lanes.
    if (rect.height > frame.height * 0.5 && rect.width > 0) {
      const left = rect.x - frame.left;
      const right = frame.right - rect.x - rect.width;
      if (Math.min(left, right) >= 180)
        return {
          mode: "book" as const,
          left,
          right,
          gap: rect.width,
          sheetLeft: rect.x + rect.width,
          sheetTop: 0,
          sheetWidth: frame.right - rect.x - rect.width,
          sheetHeight: frame.height,
        };
    }
    if (
      rect.width > frame.width * 0.5 &&
      rect.height > 0 &&
      rect.y >= 120 &&
      frame.height - rect.y - rect.height >= 180
    ) {
      return {
        mode: "tabletop" as const,
        left: 0,
        right: 0,
        gap: 0,
        sheetLeft: frame.left,
        sheetTop: rect.y + rect.height,
        sheetWidth: frame.right - frame.left,
        sheetHeight: frame.height - rect.y - rect.height,
      };
    }
  }
  return null;
}
