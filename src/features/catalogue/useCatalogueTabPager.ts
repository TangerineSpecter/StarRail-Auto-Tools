import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  type Ref,
} from "vue";
import { useHorizontalSwipe } from "@/shared/ui/useHorizontalSwipe";

/** Two live catalogue panes track the finger; the active tab commits only after settling. */
export function useCatalogueTabPager<T extends string>(options: {
  order: readonly T[];
  tab: Ref<T>;
  surface: Ref<HTMLElement | null>;
  body: Ref<HTMLElement | null>;
  enabled: Ref<boolean>;
  onCommit: (next: T) => void | Promise<void>;
}) {
  const active = ref(false);
  const settling = ref(false);
  const offset = ref(0);
  const width = ref(1);
  const travel = computed(() => width.value + 16);
  const top = ref(0);
  const height = ref(1);
  const duration = ref(0);
  const target = ref<T | null>(null);
  let startIndex = 0;
  let live = true;
  let generation = 0;
  let cancelWait: (() => void) | undefined;

  const index = () => options.order.indexOf(options.tab.value);
  const switchingTo = ref<T | null>(null);
  const visualTab = computed(() => switchingTo.value ?? options.tab.value);
  const position = computed(() => {
    if (!active.value) return index();
    const progress = -offset.value / travel.value;
    const targetIdx = target.value ? options.order.indexOf(target.value) : -1;
    if (targetIdx >= 0 && Math.abs(targetIdx - startIndex) > 1) {
      return Math.max(
        0,
        Math.min(
          options.order.length - 1,
          startIndex + (targetIdx - startIndex) * Math.abs(progress),
        ),
      );
    }
    return Math.max(0, Math.min(options.order.length - 1, startIndex + progress));
  });
  const paneStyle = computed(() =>
    active.value
      ? {
          transform: `translate3d(${offset.value}px, 0, 0)`,
          transition: duration.value
            ? `transform ${duration.value}ms cubic-bezier(0.16, 1, 0.3, 1)`
            : "none",
          willChange: "transform",
        }
      : undefined,
  );
  const neighbourStyle = computed(() => {
    const targetIdx = target.value ? options.order.indexOf(target.value) : -1;
    const sign = targetIdx > startIndex ? 1 : -1;
    return {
      ...paneStyle.value,
      top: `${top.value}px`,
      minHeight: `${height.value}px`,
      transform: `translate3d(${offset.value + sign * travel.value}px, 0, 0)`,
    };
  });

  function measurePane() {
    startIndex = index();
    width.value = Math.max(
      1,
      options.body.value?.clientWidth ?? options.surface.value?.clientWidth ?? 1,
    );
    const bodyTop = options.body.value?.getBoundingClientRect().top ?? 0;
    const viewTop = Math.max(0, options.surface.value?.getBoundingClientRect().top ?? 0);
    top.value = Math.max(0, viewTop - bodyTop);
    height.value = Math.max(1, innerHeight - Math.max(viewTop, bodyTop));
  }

  function reset() {
    touch.resetTracking();
    generation += 1;
    cancelWait?.();
    cancelWait = undefined;
    active.value = false;
    settling.value = false;
    offset.value = 0;
    duration.value = 0;
    target.value = null;
    switchingTo.value = null;
  }

  function drag(distance: number) {
    if (!active.value) {
      measurePane();
      active.value = true;
    }
    const next = options.order[startIndex + (distance < 0 ? 1 : -1)] ?? null;
    target.value = next;
    duration.value = 0;
    offset.value = next
      ? Math.max(-travel.value, Math.min(travel.value, distance))
      : Math.sign(distance) * Math.min(width.value * 0.14, Math.abs(distance) * 0.22);
  }

  async function animateTo(value: number, ms = 220) {
    duration.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
    offset.value = value;
    await nextTick();
    if (!duration.value) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        cancelWait = undefined;
        resolve();
      }, duration.value + 32);
      cancelWait = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  async function goTo(next: T) {
    if (!options.enabled.value || next === visualTab.value) return;
    const targetIdx = options.order.indexOf(next);
    if (targetIdx < 0) return;
    reset();
    const id = ++generation;
    measurePane();
    if (targetIdx === startIndex) return;
    target.value = next;
    switchingTo.value = next;
    duration.value = 0;
    offset.value = 0;
    active.value = true;
    settling.value = true;
    await nextTick();
    if (id !== generation || !live) return;
    options.body.value?.getBoundingClientRect();
    await new Promise<void>((resolve) => {
      const raf = requestAnimationFrame(() => {
        cancelWait = undefined;
        resolve();
      });
      cancelWait = () => {
        cancelAnimationFrame(raf);
        resolve();
      };
    });
    if (id !== generation || !live) return;
    await animateTo(targetIdx > startIndex ? -travel.value : travel.value, 260);
    if (id !== generation || !live) return;
    await options.onCommit(next);
    if (id === generation && live) {
      await nextTick();
      reset();
    }
  }

  async function finish(distance: number, velocity: number) {
    if (!active.value || settling.value) return;
    const id = ++generation;
    settling.value = true;
    const next = target.value;
    const switchPage =
      !!next &&
      (Math.abs(distance) >= width.value * 0.28 ||
        (Math.abs(distance) >= 24 &&
          Math.abs(velocity) > 0.45 &&
          Math.sign(velocity) === Math.sign(distance)));
    if (switchPage && next) {
      switchingTo.value = next;
      await animateTo(distance < 0 ? -travel.value : travel.value);
      if (id !== generation || !live) return;
      await options.onCommit(next);
    } else {
      await animateTo(0);
    }
    if (id === generation && live) {
      await nextTick();
      reset();
    }
  }

  const touch = useHorizontalSwipe({
    surface: options.surface,
    enabled: computed(() => options.enabled.value && !settling.value),
    dragHandle:
      ".catalogue-tabs button, .catalogue-card, .lightcone-catalogue-card, .character-catalogue-card, .mobile-farming-item, .relic-target-bar-row",
    onDrag: drag,
    onRelease: (distance, velocity) => {
      if (active.value) drag(distance);
      void finish(distance, velocity);
    },
    onCancel: () => {
      void finish(0, 0);
    },
  });

  function stop() {
    live = false;
    reset();
    window.removeEventListener("resize", reset);
  }

  onMounted(() => window.addEventListener("resize", reset, { passive: true }));
  onActivated(() => {
    live = true;
    window.addEventListener("resize", reset, { passive: true });
  });
  onDeactivated(stop);
  onBeforeUnmount(stop);

  return {
    active,
    settling,
    visualTab,
    offset,
    travel,
    position,
    duration,
    target,
    top,
    height,
    paneStyle,
    neighbourStyle,
    goTo,
    cancel: reset,
  };
}
