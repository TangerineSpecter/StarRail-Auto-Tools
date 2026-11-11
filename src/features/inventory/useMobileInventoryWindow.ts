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
import type { InventoryKind, InventoryListItem } from "@/types";

/** Mount the first screen before the slide animation, then grow ahead of native scrolling. */
export function useMobileInventoryWindow(options: {
  items: Ref<InventoryListItem[]>;
  kind: Ref<InventoryKind>;
  pending: Ref<boolean>;
  master: Ref<HTMLElement | null>;
}) {
  const sentinel = ref<HTMLElement | null>(null);
  const limit = ref(8);
  let observer: IntersectionObserver | undefined;
  let active = true;
  let generation = 0;
  function initialLimit() {
    const columns = (options.master.value?.clientWidth ?? innerWidth) >= 580 ? 2 : 1;
    const height =
      options.kind.value === "relic" ? 200 : options.kind.value === "character" ? 88 : 112;
    return Math.max(6, (Math.ceil(Math.max(1, innerHeight - 120) / height) + 1) * columns);
  }
  const visibleItems = computed(() => options.items.value.slice(0, limit.value));
  const hasMore = computed(() => limit.value < options.items.value.length);
  async function observe() {
    const id = ++generation;
    observer?.disconnect();
    observer = undefined;
    await nextTick();
    if (id !== generation || !active || options.pending.value || !sentinel.value || !hasMore.value)
      return;
    if (!window.IntersectionObserver) {
      limit.value = options.items.value.length;
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        if (
          id !== generation ||
          options.pending.value ||
          !active ||
          !entries.some((entry) => entry.isIntersecting)
        )
          return;
        limit.value += 8;
        void observe();
      },
      { root: null, rootMargin: "400px 0px" },
    );
    observer.observe(sentinel.value);
  }
  watch(
    [options.items, options.kind],
    () => {
      limit.value = initialLimit();
      void observe();
    },
    { immediate: true, flush: "sync" },
  );
  watch([sentinel, options.pending], observe, { flush: "post" });
  function stop() {
    active = false;
    generation += 1;
    observer?.disconnect();
    observer = undefined;
  }
  onActivated(() => {
    active = true;
    void observe();
  });
  onDeactivated(stop);
  onBeforeUnmount(stop);
  return { visibleItems, sentinel, hasMore };
}
