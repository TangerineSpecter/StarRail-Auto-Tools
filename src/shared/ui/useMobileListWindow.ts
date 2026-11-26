import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  ref,
  watch,
  type Ref,
} from "vue";

/** Mount the visible mobile viewport first, then append items ahead of scrolling. */
export function useMobileListWindow<T>(options: {
  items: Ref<readonly T[]>;
  enabled: Ref<boolean>;
  active?: Ref<boolean>;
  rowHeight?: number;
  columns?: () => number;
  step?: number;
}) {
  const sentinel = ref<HTMLElement | null>(null);
  const limit = ref(12);
  const rowHeight = options.rowHeight ?? 112;
  const step = options.step ?? 12;
  let observer: IntersectionObserver | undefined;
  let alive = true;
  let generation = 0;

  function initialLimit() {
    const cols = Math.max(1, options.columns?.() ?? (innerWidth >= 580 ? 2 : 1));
    const rows = Math.ceil(Math.max(1, innerHeight - 120) / rowHeight) + 2;
    return Math.max(8, rows * cols);
  }

  const visibleItems = computed<readonly T[]>(() =>
    options.enabled.value ? options.items.value.slice(0, limit.value) : options.items.value,
  );
  const hasMore = computed(() => options.enabled.value && limit.value < options.items.value.length);

  let observedTarget: HTMLElement | null = null;

  async function observe() {
    const id = ++generation;
    await nextTick();
    const isActive = options.active ? options.active.value : true;
    const target = sentinel.value;
    if (
      id !== generation ||
      !alive ||
      !isActive ||
      !options.enabled.value ||
      !target ||
      !hasMore.value
    ) {
      observer?.disconnect();
      observer = undefined;
      observedTarget = null;
      return;
    }
    if (!window.IntersectionObserver) {
      limit.value = options.items.value.length;
      return;
    }
    if (observer && observedTarget === target) return;
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        const stillActive = options.active ? options.active.value : true;
        if (
          id !== generation ||
          !alive ||
          !stillActive ||
          !options.enabled.value ||
          !entries.some((entry) => entry.isIntersecting)
        ) {
          return;
        }
        limit.value += step;
        if (!hasMore.value) {
          observer?.disconnect();
          observer = undefined;
          observedTarget = null;
        }
      },
      { root: null, rootMargin: "400px 0px" },
    );
    observedTarget = target;
    observer.observe(target);
  }

  watch(
    options.items,
    () => {
      limit.value = initialLimit();
      void observe();
    },
    { immediate: true, flush: "sync" },
  );
  watch([sentinel, options.enabled, ...(options.active ? [options.active] : [])], observe, {
    flush: "post",
  });

  function stop() {
    alive = false;
    generation += 1;
    observer?.disconnect();
    observer = undefined;
  }

  onActivated(() => {
    alive = true;
    void observe();
  });
  onDeactivated(stop);
  onBeforeUnmount(stop);

  return { visibleItems, sentinel, hasMore };
}
