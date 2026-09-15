export const loadRelicCleanupPanel = () => import("@/features/relic-cleanup/RelicCleanupPanel.vue");

export const loadRelicMainStatScanner = () =>
  import("@/features/relic-scanner/RelicMainStatScanner.vue");

/** Preloads the default mode without mounting its expensive workspace. */
export const preloadScannerDefaultMode = () => loadRelicCleanupPanel();
