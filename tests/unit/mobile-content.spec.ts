import { describe, expect, it } from "vitest";
import { foldLayout } from "@/mobile/layout-regions";
import type { MobileLayoutRegions } from "@/shared/api/mobile-layout";

const frame = { left: 24, right: 859, width: 951, height: 669 };
const regions: MobileLayoutRegions = { width: 951, height: 669, division: [], occlusion: [] };

describe("mobile content adaptation", () => {
  it("uses real division geometry without changing navigation posture", () => {
    const layout = foldLayout(
      { ...regions, division: [{ x: 455, y: 0, width: 35, height: 669 }] },
      frame,
    );
    expect(layout).toMatchObject({
      mode: "book",
      left: 431,
      right: 369,
      gap: 35,
      sheetLeft: 490,
      sheetWidth: 369,
    });
    expect(layout!.left + layout!.right + layout!.gap).toBe(frame.right - frame.left);
  });
  it("scales native points into the CSS viewport and ignores inactive or invalid folds", () => {
    const native = {
      ...regions,
      width: 1902,
      height: 1338,
      division: [{ x: 910, y: 0, width: 70, height: 1338 }],
    };
    expect(foldLayout(native, frame)?.gap).toBe(35);
    expect(
      foldLayout({ ...regions, division: [{ x: 455, y: 0, width: 0, height: 669 }] }, frame),
    ).toBeNull();
    expect(
      foldLayout({ ...regions, division: [{ x: NaN, y: 0, width: 20, height: 669 }] }, frame),
    ).toBeNull();
    expect(foldLayout(null, frame)).toBeNull();
  });
  it("keeps tabletop interaction sheets in the lower usable region", () => {
    expect(
      foldLayout({ ...regions, division: [{ x: 0, y: 310, width: 951, height: 30 }] }, frame),
    ).toMatchObject({ mode: "tabletop", sheetTop: 340, sheetHeight: 329 });
  });
  it("does not create unusably narrow lanes", () => {
    expect(
      foldLayout({ ...regions, division: [{ x: 100, y: 0, width: 30, height: 669 }] }, frame),
    ).toBeNull();
  });
});
