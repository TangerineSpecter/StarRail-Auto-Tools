import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch, type Ref } from "vue";

/**
 * Enable reliable horizontal swipe navigation on compact floating capsules across touch and mouse
 * while preserving normal tap clicks and isolating gestures from parent containers.
 */
export function useCapsuleSwipe(options: {
  element: Ref<HTMLElement | null>;
  enabled: Ref<boolean>;
  onNext: () => void;
  onPrev: () => void;
  canStart?: (target: EventTarget | null) => boolean;
  thresholdPx?: number;
  stopPropagation?: boolean;
}) {
  const dragOffset = ref(0);
  const dragging = ref(false);
  const threshold = options.thresholdPx ?? 20;
  const isolate = options.stopPropagation ?? true;

  let active = false;
  let componentActive = true;
  let source: "touch" | "mouse" | null = null;
  let touchId: number | null = null;
  let startX = 0;
  let startY = 0;
  let lockedHorizontal = false;
  let blockedClickUntil = 0;
  let lastTouchTime = 0;
  let detachElement: (() => void) | undefined;
  let detachWindowMouse: (() => void) | undefined;

  function resetDrag() {
    active = false;
    source = null;
    touchId = null;
    lockedHorizontal = false;
    dragging.value = false;
    dragOffset.value = 0;
    detachWindowMouse?.();
    detachWindowMouse = undefined;
  }

  function beginDrag(x: number, y: number, src: "touch" | "mouse", id: number | null) {
    resetDrag();
    active = true;
    source = src;
    touchId = id;
    startX = x;
    startY = y;
  }

  function moveDrag(x: number, y: number): boolean {
    const deltaX = x - startX;
    const deltaY = y - startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!lockedHorizontal) {
      if (absX < 8 && absY < 8) return false;
      if (absY > absX * 1.1) {
        resetDrag();
        return false;
      }
      lockedHorizontal = true;
      dragging.value = true;
    }

    blockedClickUntil = Date.now() + 500;
    dragOffset.value = Math.max(-18, Math.min(18, deltaX * 0.28));
    return true;
  }

  function endDrag(x: number, y: number) {
    const deltaX = x - startX;
    const deltaY = y - startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const triggered = absX >= threshold && absX > absY;
    if (lockedHorizontal || triggered) {
      blockedClickUntil = Date.now() + 500;
    }
    resetDrag();
    if (triggered) {
      if (deltaX < 0) {
        options.onNext();
      } else {
        options.onPrev();
      }
    }
  }

  function onTouchStart(event: TouchEvent) {
    if (isolate) event.stopPropagation();
    lastTouchTime = Date.now();
    if (
      !componentActive ||
      !options.enabled.value ||
      event.touches.length !== 1 ||
      options.canStart?.(event.target) === false
    ) {
      resetDrag();
      return;
    }
    const touch = event.touches[0]!;
    beginDrag(touch.clientX, touch.clientY, "touch", touch.identifier);
  }

  function onTouchMove(event: TouchEvent) {
    if (isolate) event.stopPropagation();
    lastTouchTime = Date.now();
    if (!active || source !== "touch" || !componentActive || !options.enabled.value) return;
    if (event.touches.length !== 1) {
      resetDrag();
      return;
    }
    const touch = Array.from(event.touches).find((item) => item.identifier === touchId);
    if (!touch) return;
    if (moveDrag(touch.clientX, touch.clientY) && event.cancelable) {
      event.preventDefault();
    }
  }

  function onTouchEnd(event: TouchEvent) {
    if (isolate) event.stopPropagation();
    lastTouchTime = Date.now();
    if (!active || source !== "touch" || !componentActive) return;
    const touch = Array.from(event.changedTouches).find((item) => item.identifier === touchId);
    if (!touch) {
      resetDrag();
      return;
    }
    endDrag(touch.clientX, touch.clientY);
  }

  function onTouchCancel(event: TouchEvent) {
    if (isolate) event.stopPropagation();
    resetDrag();
  }

  function onMouseDown(event: MouseEvent) {
    if (isolate) event.stopPropagation();
    if (Date.now() - lastTouchTime < 800) return;
    if (
      !componentActive ||
      !options.enabled.value ||
      event.button !== 0 ||
      options.canStart?.(event.target) === false
    ) {
      return;
    }
    beginDrag(event.clientX, event.clientY, "mouse", null);

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!active || source !== "mouse") return;
      moveDrag(moveEvent.clientX, moveEvent.clientY);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      if (!active || source !== "mouse") {
        resetDrag();
        return;
      }
      endDrag(upEvent.clientX, upEvent.clientY);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", resetDrag);
    detachWindowMouse = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", resetDrag);
    };
  }

  function onClickCapture(event: MouseEvent) {
    if (Date.now() < blockedClickUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function bind() {
    detachElement?.();
    detachElement = undefined;
    resetDrag();
    blockedClickUntil = 0;
    const el = options.element.value;
    if (!el) return;

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("click", onClickCapture, true);

    detachElement = () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("click", onClickCapture, true);
    };
  }

  watch(options.element, bind, { flush: "post", immediate: true });
  watch(options.enabled, (enabled) => {
    if (!enabled) resetDrag();
  });

  onActivated(() => {
    componentActive = true;
  });
  onDeactivated(() => {
    componentActive = false;
    resetDrag();
  });
  onBeforeUnmount(() => {
    componentActive = false;
    resetDrag();
    detachElement?.();
    detachElement = undefined;
  });

  const dragStyle = computed(() =>
    dragOffset.value !== 0 || dragging.value
      ? {
          transform: `translate3d(${dragOffset.value}px, 0, 0)`,
          transition: dragging.value ? "none" : "transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }
      : undefined,
  );

  return {
    dragOffset,
    dragging,
    dragStyle,
  };
}
