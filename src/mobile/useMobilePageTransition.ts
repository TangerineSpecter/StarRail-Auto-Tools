import { nextTick, onBeforeUnmount, ref, shallowRef, type Ref } from "vue";

/** Animate the live content while KeepAlive retains each page's state. */
export function useMobilePageTransition<T extends string>(options: {
  page: Ref<T>;
  content: Ref<HTMLElement | null>;
  order: readonly T[];
  prepare: (page: T) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const selected = shallowRef(options.page.value);
  const pending = ref(false);
  const scrollPositions = new Map<T, number>();
  let generation = 0;
  let animation: Animation | undefined;
  let transition: ViewTransition | undefined;

  function stopMotion() {
    transition?.skipTransition();
    transition = undefined;
    animation?.cancel();
    animation = undefined;
    document.documentElement.classList.remove("mobile-page-transition", "mobile-page-back");
  }
  async function play(frames: Keyframe[], duration: number) {
    let motion: Animation;
    try {
      motion = options.content.value!.animate(frames, {
        duration,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      });
    } catch {
      return;
    }
    animation = motion;
    await motion.finished.catch(() => {});
    if (animation === motion) animation = undefined;
    motion.cancel();
  }
  async function go(next: T) {
    if (next === selected.value && pending.value) return;
    const id = ++generation;
    stopMotion();
    selected.value = next;
    if (next === options.page.value) {
      pending.value = false;
      return;
    }
    pending.value = true;
    try {
      await options.prepare(next);
    } catch (error) {
      if (id === generation) {
        selected.value = options.page.value;
        pending.value = false;
        options.onError(error);
      }
      return;
    }
    if (id !== generation) return;
    const direction =
      options.order.indexOf(next) > options.order.indexOf(options.page.value) ? 1 : -1;
    const animate =
      !!options.content.value?.animate &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let committed = false;
    const commit = async () => {
      if (id !== generation || committed) return;
      committed = true;
      scrollPositions.set(options.page.value, window.scrollY);
      options.page.value = next;
      await nextTick();
      await nextTick();
      if (id === generation) window.scrollTo(0, scrollPositions.get(next) ?? 0);
    };
    try {
      if (animate && document.startViewTransition) {
        // The root snapshot is viewport-sized even when the live page is a long list.
        // Naming the fixed menu separately keeps it stationary above both page images.
        const root = document.documentElement;
        root.classList.add("mobile-page-transition");
        root.classList.toggle("mobile-page-back", direction < 0);
        try {
          transition = document.startViewTransition(commit);
          void transition.ready.catch(() => {});
          await transition.finished.catch(() => {});
        } catch {
          // The page still switches if capture is unavailable.
        }
        await commit();
        return;
      }
      if (animate) {
        await play(
          [
            { opacity: 1, transform: "translateX(0)" },
            { opacity: 0, transform: `translateX(${-direction * 20}px)` },
          ],
          100,
        );
      }
      if (id !== generation) return;
      await commit();
      if (id !== generation) return;
      if (animate) {
        await play(
          [
            { opacity: 0, transform: `translateX(${direction * 24}px)` },
            { opacity: 1, transform: "translateX(0)" },
          ],
          220,
        );
      }
    } finally {
      if (id === generation) {
        stopMotion();
        pending.value = false;
      }
    }
  }
  onBeforeUnmount(() => {
    generation += 1;
    stopMotion();
    pending.value = false;
  });
  return { selected, pending, go };
}
