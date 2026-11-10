export type DevicePosture =
  | "portrait"
  | "landscape-hinge-top"
  | "landscape-hinge-bottom"
  | "unfolded-portrait"
  | "unfolded-landscape";

export function detectDevicePosture(): DevicePosture {
  if (typeof window === "undefined") return "portrait";

  const w = window.innerWidth;
  const h = window.innerHeight;
  const isLandscape = w > h || Boolean(window.matchMedia?.("(orientation: landscape)").matches);

  // Layout-size heuristic, not a hardware fold-state API. CSS consumes only data-posture.
  const isUnfolded = (w >= 800 && h >= 560) || (w >= 580 && h >= 800);
  if (isUnfolded) {
    return isLandscape ? "unfolded-landscape" : "unfolded-portrait";
  }

  // 2. Outer Screen: Portrait
  if (!isLandscape) return "portrait";

  // 3. Outer Screen: Landscape orientation checks

  // 1. WebKit window.orientation
  // -90deg / 270deg (clockwise rotation) -> camera at bottom-right -> hinge at top
  // 90deg (counter-clockwise rotation) -> camera at top-left -> hinge at bottom
  const winOrient = typeof window.orientation === "number" ? window.orientation : null;
  if (winOrient === -90 || winOrient === 270) {
    return "landscape-hinge-top";
  }
  if (winOrient === 90) {
    return "landscape-hinge-bottom";
  }

  // 2. Screen Orientation API
  const screenAngle = window.screen?.orientation?.angle;
  if (screenAngle === 270) {
    return "landscape-hinge-top";
  }
  if (screenAngle === 90) {
    return "landscape-hinge-bottom";
  }
  const screenType = window.screen?.orientation?.type;
  if (screenType === "landscape-secondary") {
    return "landscape-hinge-top";
  }
  if (screenType === "landscape-primary") {
    return "landscape-hinge-bottom";
  }

  // 3. Hardware safe area insets probe (detached from content CSS)
  if (typeof document !== "undefined") {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:0;left:0;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);visibility:hidden;pointer-events:none;";
    document.documentElement.appendChild(probe);
    const style = window.getComputedStyle(probe);
    const leftVal = parseFloat(style.paddingLeft) || 0;
    const rightVal = parseFloat(style.paddingRight) || 0;
    document.documentElement.removeChild(probe);

    if (rightVal > leftVal + 10) {
      return "landscape-hinge-top";
    }
    if (leftVal > rightVal + 10) {
      return "landscape-hinge-bottom";
    }
  }

  // 4. Default fallback for landscape
  return "landscape-hinge-bottom";
}

export function initDevicePostureWatcher(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  function update() {
    const posture = detectDevicePosture();
    document.documentElement.dataset.posture = posture;
  }

  update();

  const frame = window.requestAnimationFrame?.(update);
  const timers = [window.setTimeout(update, 50), window.setTimeout(update, 200)];

  window.addEventListener("resize", update, { passive: true });
  window.addEventListener("orientationchange", update, { passive: true });
  window.screen?.orientation?.addEventListener("change", update);

  return () => {
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    timers.forEach((timer) => window.clearTimeout(timer));
    window.removeEventListener("resize", update);
    window.removeEventListener("orientationchange", update);
    window.screen?.orientation?.removeEventListener("change", update);
  };
}
