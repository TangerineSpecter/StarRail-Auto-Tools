import { onActivated, onBeforeUnmount, onDeactivated, watch, type Ref } from "vue";

/** Recognize one horizontal touch gesture while leaving native vertical scrolling intact. */
export function useHorizontalSwipe(options: {
  surface: Ref<HTMLElement | null>;
  enabled: Ref<boolean>;
  onSwipe?: (direction: "left" | "right") => void;
  onDrag?: (distance: number) => void;
  onRelease?: (distance: number, velocity: number) => void;
  onCancel?: () => void;
  dragHandle?: string;
  allowScreenEdge?: boolean;
}) {
  let active = true;
  let detach: (() => void) | undefined;
  let blockedClickUntil = 0;
  let gesture: {
    id: number;
    x: number;
    y: number;
    started: number;
    horizontal: boolean;
    lastX: number;
    lastTime: number;
    velocity: number;
  } | null = null;

  function cancel() {
    if (gesture?.horizontal) options.onCancel?.();
    gesture = null;
  }
  function eligible(target: EventTarget | null, surface: HTMLElement) {
    if (!(target instanceof Element)) return false;
    if (target.closest("[data-swipe-ignore]")) return false;
    const handle = options.dragHandle ? target.closest(options.dragHandle) : null;
    if (
      !handle &&
      target.closest(
        'input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable="false"]), [role="slider"]',
      )
    )
      return false;
    for (let node: Element | null = target; node && node !== surface; node = node.parentElement) {
      if (
        node.scrollWidth > node.clientWidth + 1 &&
        /auto|scroll/.test(getComputedStyle(node).overflowX)
      )
        return false;
    }
    return true;
  }
  function start(event: TouchEvent) {
    cancel();
    blockedClickUntil = 0;
    const surface = options.surface.value;
    if (
      !active ||
      !options.enabled.value ||
      !surface ||
      event.touches.length !== 1 ||
      !eligible(event.target, surface)
    )
      return;
    const touch = event.touches[0]!;
    // Leave system back/edge gestures to the WebView.
    if (!options.allowScreenEdge && (touch.clientX < 20 || touch.clientX > innerWidth - 20)) return;
    gesture = {
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      started: Date.now(),
      horizontal: false,
      lastX: touch.clientX,
      lastTime: Date.now(),
      velocity: 0,
    };
  }
  function move(event: TouchEvent) {
    if (!gesture) return;
    if (!options.enabled.value || event.touches.length !== 1) return cancel();
    const touch = event.touches[0]!;
    if (touch.identifier !== gesture.id) return cancel();
    const x = Math.abs(touch.clientX - gesture.x);
    const y = Math.abs(touch.clientY - gesture.y);
    if (!gesture.horizontal) {
      if (y >= 10 && y >= x) return cancel();
      if (x < 10 || x < y * 1.35) return;
      gesture.horizontal = true;
    }
    blockedClickUntil = Date.now() + 500;
    if (event.cancelable) event.preventDefault();
    const now = Date.now();
    gesture.velocity = (touch.clientX - gesture.lastX) / Math.max(1, now - gesture.lastTime);
    gesture.lastX = touch.clientX;
    gesture.lastTime = now;
    options.onDrag?.(touch.clientX - gesture.x);
  }
  function end(event: TouchEvent) {
    const current = gesture;
    gesture = null;
    if (!current || !options.enabled.value || event.touches.length || !current.horizontal) {
      if (current?.horizontal) options.onCancel?.();
      return;
    }
    blockedClickUntil = Date.now() + 500;
    const touch = Array.from(event.changedTouches).find((item) => item.identifier === current.id);
    if (!touch) {
      options.onCancel?.();
      return;
    }
    const x = touch.clientX - current.x;
    if (options.onRelease) {
      options.onRelease(x, Date.now() - current.lastTime < 100 ? current.velocity : 0);
      return;
    }
    if (Date.now() - current.started > 1200) return;
    const y = Math.abs(touch.clientY - current.y);
    const threshold = Math.max(
      48,
      Math.min(88, (options.surface.value?.clientWidth ?? 360) * 0.18),
    );
    if (Math.abs(x) < threshold || Math.abs(x) < y * 1.35) return;
    options.onSwipe?.(x < 0 ? "left" : "right");
  }
  function click(event: MouseEvent) {
    if (event.detail === 0 || Date.now() >= blockedClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function bind() {
    detach?.();
    detach = undefined;
    cancel();
    blockedClickUntil = 0;
    const surface = options.surface.value;
    if (!active || !surface) return;
    surface.addEventListener("touchstart", start, { passive: true });
    surface.addEventListener("touchmove", move, { passive: false });
    surface.addEventListener("touchend", end, { passive: true });
    surface.addEventListener("touchcancel", cancel, { passive: true });
    surface.addEventListener("contextmenu", cancel);
    surface.addEventListener("click", click, true);
    detach = () => {
      surface.removeEventListener("touchstart", start);
      surface.removeEventListener("touchmove", move);
      surface.removeEventListener("touchend", end);
      surface.removeEventListener("touchcancel", cancel);
      surface.removeEventListener("contextmenu", cancel);
      surface.removeEventListener("click", click, true);
    };
  }
  function stop() {
    active = false;
    cancel();
    detach?.();
    detach = undefined;
    blockedClickUntil = 0;
  }
  watch(options.surface, bind, { flush: "post", immediate: true });
  watch(options.enabled, (enabled) => {
    if (!enabled) cancel();
  });
  onActivated(() => {
    active = true;
    bind();
  });
  onDeactivated(stop);
  onBeforeUnmount(stop);
  return {
    resetTracking: () => {
      gesture = null;
    },
  };
}
