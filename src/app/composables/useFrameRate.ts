import { onBeforeUnmount, onMounted, ref } from "vue";
import { frontendDiagnostics } from "@/shared/diagnostics/frontend";

const SAMPLE_WINDOW_MS = 1000;

/** Measures the visible WebView's animation cadence with a low-frequency UI update. */
export function useFrameRate() {
  const frameRate = ref<number | null>(null);
  let frameHandle: number | undefined;
  let frameCount = 0;
  let sampleStartedAt: number | undefined;
  let samplesSinceLog = 0;

  function sample(timestamp: number) {
    sampleStartedAt ??= timestamp;
    frameCount += 1;

    const elapsed = timestamp - sampleStartedAt;
    if (elapsed >= SAMPLE_WINDOW_MS) {
      const nextFrameRate = Math.round((frameCount * 1000) / elapsed);
      frameRate.value = nextFrameRate;
      frontendDiagnostics.setFrameRate(nextFrameRate);
      samplesSinceLog += 1;
      if (samplesSinceLog >= 5) {
        frontendDiagnostics.record("debug", "render", `fps sample: ${nextFrameRate}`);
        samplesSinceLog = 0;
      }
      frameCount = 0;
      sampleStartedAt = timestamp;
    }

    frameHandle = window.requestAnimationFrame(sample);
  }

  function startLoop() {
    if (frameHandle !== undefined || typeof window.requestAnimationFrame !== "function") return;
    frameCount = 0;
    sampleStartedAt = undefined;
    frameHandle = window.requestAnimationFrame(sample);
  }

  function stopLoop() {
    if (frameHandle === undefined || typeof window.cancelAnimationFrame !== "function") return;
    window.cancelAnimationFrame(frameHandle);
    frameHandle = undefined;
  }

  function onVisibilityChange() {
    if (document.hidden) stopLoop();
    else startLoop();
  }

  onMounted(() => {
    if (!document.hidden) startLoop();
    document.addEventListener("visibilitychange", onVisibilityChange);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    stopLoop();
  });

  return { frameRate };
}
