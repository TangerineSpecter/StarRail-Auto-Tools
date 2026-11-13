import { nextTick, onBeforeUnmount, ref, shallowRef, type Ref } from "vue";

/** Animate the live content with lightweight GPU transforms while KeepAlive retains state. */
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

  function stopMotion() {
    animation?.cancel();
    animation = undefined;
  }
  async function play(frames: Keyframe[], config: KeyframeAnimationOptions) {
    const element = options.content.value;
    if (!element?.animate) return undefined;
    let motion: Animation;
    try {
      motion = element.animate(frames, {
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
        ...config,
      });
    } catch {
      return undefined;
    }
    animation = motion;
    await motion.finished.catch(() => {});
    return motion;
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
    const direction =
      options.order.indexOf(next) > options.order.indexOf(options.page.value) ? 1 : -1;
    const animate =
      !!options.content.value?.animate &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const commit = async () => {
      if (id !== generation) return;
      scrollPositions.set(options.page.value, window.scrollY);
      options.page.value = next;
      await nextTick();
      if (id === generation) window.scrollTo(0, scrollPositions.get(next) ?? 0);
    };
    try {
      const outPromise = animate
        ? play(
            [
              { opacity: 1, transform: "translate3d(0, 0, 0)" },
              { opacity: 0, transform: `translate3d(${-direction * 24}px, 0, 0)` },
            ],
            { duration: 100, easing: "cubic-bezier(0.4, 0, 1, 1)" },
          )
        : Promise.resolve(undefined);
      try {
        const [, outMotion] = await Promise.all([options.prepare(next), outPromise]);
        if (id !== generation) {
          outMotion?.cancel();
          return;
        }
      } catch (error) {
        if (id === generation) {
          stopMotion();
          selected.value = options.page.value;
          pending.value = false;
          options.onError(error);
        }
        return;
      }
      await commit();
      if (id !== generation) return;
      if (animate) {
        animation?.cancel();
        const inMotion = await play(
          [
            { opacity: 0, transform: `translate3d(${direction * 28}px, 0, 0)` },
            { opacity: 1, transform: "translate3d(0, 0, 0)" },
          ],
          { duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        );
        inMotion?.cancel();
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
