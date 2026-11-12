import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  shallowRef,
  type Ref,
} from "vue";
import { useHorizontalSwipe } from "@/shared/ui/useHorizontalSwipe";
import type { InventoryKind, InventoryListItem, PagedResult } from "@/types";
import { mobileInventoryCategories } from "./mobile-inventory-categories";

/** Two live panes track the finger; the archive is committed only after settling. */
export function useInventoryCategoryPager(options: {
  surface: Ref<HTMLElement | null>;
  body: Ref<HTMLElement | null>;
  kind: Ref<InventoryKind>;
  enabled: Ref<boolean>;
  preview: (kind: InventoryKind) => Promise<PagedResult<InventoryListItem>>;
  commit: (kind: InventoryKind) => Promise<boolean>;
}) {
  const active = ref(false);
  const settling = ref(false);
  const offset = ref(0);
  const width = ref(1);
  const travel = computed(() => width.value + 16);
  const top = ref(0);
  const height = ref(1);
  const duration = ref(0);
  const target = ref<InventoryKind | null>(null);
  const preview = shallowRef<PagedResult<InventoryListItem> | null>(null);
  const error = ref("");
  let startIndex = 0;
  let live = true;
  let generation = 0;
  let previewGeneration = 0;
  let ready: Promise<boolean> = Promise.resolve(false);
  let cancelWait: (() => void) | undefined;
  const index = () => mobileInventoryCategories.findIndex((item) => item.id === options.kind.value);
  const position = computed(() =>
    active.value ? Math.max(0, Math.min(2, startIndex - offset.value / travel.value)) : index(),
  );
  const paneStyle = computed(() =>
    active.value
      ? {
          transform: `translate3d(${offset.value}px,0,0)`,
          transition: duration.value
            ? `transform ${duration.value}ms cubic-bezier(0.16,1,0.3,1)`
            : "none",
          willChange: "transform",
        }
      : undefined,
  );
  const neighbourStyle = computed(() => ({
    ...paneStyle.value,
    top: `${top.value}px`,
    minHeight: `${height.value}px`,
    transform: `translate3d(${offset.value + (mobileInventoryCategories.findIndex((item) => item.id === target.value) > startIndex ? travel.value : -travel.value)}px,0,0)`,
  }));
  function reset() {
    touch.resetTracking();
    generation += 1;
    previewGeneration += 1;
    cancelWait?.();
    cancelWait = undefined;
    active.value = false;
    settling.value = false;
    offset.value = 0;
    duration.value = 0;
    target.value = null;
    preview.value = null;
    error.value = "";
  }
  function load(next: InventoryKind | null) {
    if (next === target.value) return;
    target.value = next;
    preview.value = null;
    error.value = "";
    const id = ++previewGeneration;
    ready = next
      ? options
          .preview(next)
          .then((result) => {
            if (id !== previewGeneration || !live) return false;
            preview.value = result;
            return true;
          })
          .catch(() => {
            if (id === previewGeneration && live) error.value = "暂时无法加载，松手返回后可重试。";
            return false;
          })
      : Promise.resolve(false);
  }
  function drag(distance: number) {
    if (!active.value) {
      startIndex = index();
      width.value = Math.max(
        1,
        options.body.value?.clientWidth ?? options.surface.value?.clientWidth ?? 1,
      );
      const bodyTop = options.body.value?.getBoundingClientRect().top ?? 0;
      const viewTop = Math.max(0, options.surface.value?.getBoundingClientRect().top ?? 0);
      top.value = Math.max(0, viewTop - bodyTop);
      height.value = Math.max(1, innerHeight - Math.max(viewTop, bodyTop));
      active.value = true;
    }
    const next = mobileInventoryCategories[startIndex + (distance < 0 ? 1 : -1)]?.id ?? null;
    load(next);
    duration.value = 0;
    offset.value = next
      ? Math.max(-travel.value, Math.min(travel.value, distance))
      : Math.sign(distance) * Math.min(width.value * 0.14, Math.abs(distance) * 0.22);
  }
  async function animateTo(value: number) {
    duration.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
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
    if (switchPage && (await ready)) {
      if (id !== generation || !live) return;
      await animateTo(distance < 0 ? -travel.value : travel.value);
      if (id !== generation || !live) return;
      if (!(await options.commit(next!))) {
        if (id !== generation) return;
        await animateTo(0);
      }
    } else {
      if (id !== generation || !live) return;
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
    dragHandle: ".mobile-inventory-categories button",
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
  // onActivated also runs on initial mount in the page's KeepAlive tree.
  onDeactivated(stop);
  onBeforeUnmount(stop);
  return {
    active,
    settling,
    offset,
    position,
    duration,
    target,
    preview,
    error,
    top,
    height,
    paneStyle,
    neighbourStyle,
    cancel: reset,
  };
}
