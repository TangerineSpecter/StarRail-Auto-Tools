import { onMounted, onUnmounted, type Ref } from "vue";
import { relicCleanupApi } from "@/shared/api/relic-cleanup";

interface CleanupEmergencyStopFeedback {
  error: Ref<string>;
  notice: Ref<string>;
}

/** Owns the application-wide cleanup emergency shortcut independently of scanner pages. */
export function useCleanupEmergencyStop(feedback: CleanupEmergencyStopFeedback) {
  let stopping = false;

  async function emergencyStop(event: KeyboardEvent) {
    if (event.key !== "F12" || !event.ctrlKey || !event.shiftKey || stopping) return;
    event.preventDefault();
    stopping = true;
    try {
      await relicCleanupApi.cancel();
      feedback.notice.value = "已触发紧急停止";
    } catch (cause) {
      feedback.error.value = String(cause);
    } finally {
      stopping = false;
    }
  }

  onMounted(() => window.addEventListener("keydown", emergencyStop));
  onUnmounted(() => window.removeEventListener("keydown", emergencyStop));
}
