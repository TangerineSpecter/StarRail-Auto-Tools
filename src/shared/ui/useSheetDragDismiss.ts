import { onBeforeUnmount } from "vue";

/** Enables downward drag-to-dismiss gestures on a PrimeVue bottom sheet header. */
export function useSheetDragDismiss(onDismiss: () => void, threshold = 56) {
  let startX = 0;
  let startY = 0;
  let deltaY = 0;
  let dragging = false;
  let drawerEl: HTMLElement | null = null;
  let clearTimer: ReturnType<typeof setTimeout> | undefined;

  function clearInlineStyles(target = drawerEl) {
    clearTimeout(clearTimer);
    clearTimer = undefined;
    if (!target) return;
    target.style.transition = "";
    target.style.transform = "";
  }

  function reset() {
    dragging = false;
    deltaY = 0;
    clearInlineStyles();
    drawerEl = null;
  }

  function onTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) return;
    clearInlineStyles();
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    deltaY = 0;
    dragging = false;
    drawerEl = ((event.currentTarget as HTMLElement | null)?.closest(".p-drawer") ??
      null) as HTMLElement | null;
  }

  function onTouchMove(event: TouchEvent) {
    if (!drawerEl || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dy = touch.clientY - startY;
    const dx = Math.abs(touch.clientX - startX);
    if (!dragging) {
      if (dy > 8 && dy > dx) {
        dragging = true;
        drawerEl.style.transition = "none";
      } else {
        return;
      }
    }
    deltaY = Math.max(0, dy);
    if (event.cancelable) event.preventDefault();
    drawerEl.style.transform = `translate3d(0, ${deltaY}px, 0)`;
  }

  function finishTouch() {
    const target = drawerEl;
    if (!dragging || !target) {
      dragging = false;
      deltaY = 0;
      return;
    }
    dragging = false;
    if (deltaY >= threshold) {
      deltaY = 0;
      clearInlineStyles(target);
      drawerEl = null;
      onDismiss();
      return;
    }
    deltaY = 0;
    target.style.transition = "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
    target.style.transform = "translate3d(0, 0, 0)";
    clearTimer = setTimeout(() => {
      clearInlineStyles(target);
    }, 190);
  }

  onBeforeUnmount(reset);

  return {
    reset,
    handlers: {
      touchstart: onTouchStart,
      touchmove: onTouchMove,
      touchend: finishTouch,
      touchcancel: finishTouch,
    },
  };
}
