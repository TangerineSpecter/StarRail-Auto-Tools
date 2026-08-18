import { onMounted, onUnmounted } from "vue";

/** Close the open catalogue card with Escape, matching inventory detail drawers. */
export function useCloseOnEscape(close: () => void) {
  function onEscape(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.isComposing) return;
    close();
  }
  onMounted(() => window.addEventListener("keydown", onEscape));
  onUnmounted(() => window.removeEventListener("keydown", onEscape));
}
