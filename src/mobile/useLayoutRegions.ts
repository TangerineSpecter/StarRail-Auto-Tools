import { mobileLayoutApi, type MobileLayoutRegions } from "@/shared/api/mobile-layout";
import { foldLayout } from "./layout-regions";

/** Native reserved regions are independent of the established navigation posture. */
export function initContentRegionWatcher() {
  let stopped = false;
  let pending = false;
  let regions: MobileLayoutRegions | null = null;
  const root = document.documentElement;
  function apply() {
    const content = document.querySelector(".mobile-content");
    if (!content) return;
    const r = content.getBoundingClientRect();
    const fold = foldLayout(regions, {
      left: r.left,
      right: r.right,
      width: innerWidth,
      height: innerHeight,
    });
    root.dataset.contentFold = fold?.mode ?? "flat";
    const values = {
      "--content-fold-left": fold?.left ?? 0,
      "--content-fold-right": fold?.right ?? 0,
      "--content-fold-gap": fold?.gap ?? 0,
      "--content-sheet-left": fold?.sheetLeft ?? 0,
      "--content-sheet-top": fold?.sheetTop ?? 0,
      "--content-sheet-width": fold?.sheetWidth ?? innerWidth,
      "--content-sheet-height": fold?.sheetHeight ?? innerHeight,
    };
    for (const [name, value] of Object.entries(values)) root.style.setProperty(name, `${value}px`);
  }
  async function refresh() {
    if (pending || stopped || document.hidden) return;
    pending = true;
    try {
      regions = await mobileLayoutApi.regions();
    } catch {
      regions = null;
    } finally {
      pending = false;
      if (!stopped) apply();
    }
  }
  // Fold angle changes do not necessarily resize a WKWebView. One non-overlapping
  // query while visible also detects those changes without remounting any page.
  const timer = window.setInterval(refresh, 500);
  window.addEventListener("resize", refresh, { passive: true });
  document.addEventListener("visibilitychange", refresh);
  void refresh();
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener("resize", refresh);
    document.removeEventListener("visibilitychange", refresh);
    delete root.dataset.contentFold;
    for (const name of [
      "--content-fold-left",
      "--content-fold-right",
      "--content-fold-gap",
      "--content-sheet-left",
      "--content-sheet-top",
      "--content-sheet-width",
      "--content-sheet-height",
    ])
      root.style.removeProperty(name);
  };
}
