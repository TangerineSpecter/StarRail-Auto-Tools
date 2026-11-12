import { nextTick, onBeforeUnmount, onDeactivated, ref, type Ref } from "vue";
import type { InventoryKind } from "@/types";
import { mobileInventoryCategories } from "./mobile-inventory-categories";

export function useInventoryCategoryTransition(options: {
  kind: Ref<InventoryKind>;
  body: Ref<HTMLElement | null>;
  prepare: (kind: InventoryKind) => Promise<(() => boolean) | null>;
  onCommit: () => void;
  cancelDetail: () => void;
  cancelPrepare?: () => void;
}) {
  const selectedKind = ref(options.kind.value);
  const pending = ref(false);
  let generation = 0;
  let transition: ViewTransition | undefined;
  let animation: Animation | undefined;

  function clean() {
    document.documentElement.classList.remove(
      "inventory-category-transition",
      "inventory-category-back",
      "inventory-category-fallback",
    );
    options.body.value?.style.removeProperty("--inventory-category-height");
  }
  function stopMotion() {
    options.cancelPrepare?.();
    transition?.skipTransition();
    transition = undefined;
    animation?.cancel();
    animation = undefined;
    clean();
  }
  function cancel() {
    generation += 1;
    stopMotion();
    selectedKind.value = options.kind.value;
    pending.value = false;
  }

  async function switchTo(next: InventoryKind, motion = true) {
    if (next === selectedKind.value && pending.value) return;
    const id = ++generation;
    stopMotion();
    options.cancelDetail();
    selectedKind.value = next;
    if (next === options.kind.value) {
      pending.value = false;
      return;
    }
    pending.value = true;
    const index = (kind: InventoryKind) =>
      mobileInventoryCategories.findIndex((item) => item.id === kind);
    const direction = index(next) > index(options.kind.value) ? 1 : -1;
    let applyFallback: (() => Promise<void>) | undefined;
    try {
      const prepared = await options.prepare(next);
      if (id !== generation) return;
      if (!prepared) {
        selectedKind.value = options.kind.value;
        return;
      }
      let applied = false;
      const commit = async () => {
        if (id !== generation || applied) return;
        applied = true;
        if (!prepared()) {
          selectedKind.value = options.kind.value;
          return;
        }
        options.onCommit();
        await nextTick();
        await nextTick();
        if (id !== generation) return;
        const scroller =
          options.body.value?.closest<HTMLElement>(".mobile-inventory-master") ??
          options.body.value?.parentElement;
        if (scroller) scroller.scrollTop = 0;
        window.scrollTo(0, 0);
      };
      applyFallback = commit;
      const body = options.body.value;
      if (!motion || !body || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        await commit();
        return;
      }
      // Bound both snapshots to the visible content area instead of capturing a long list.
      body.style.setProperty(
        "--inventory-category-height",
        `${Math.max(1, innerHeight - Math.max(0, body.getBoundingClientRect().top))}px`,
      );
      const root = document.documentElement;
      root.classList.toggle("inventory-category-back", direction < 0);
      if (document.startViewTransition) {
        root.classList.add("inventory-category-transition");
        transition = document.startViewTransition(commit);
        void transition.ready.catch(() => {});
        await transition.finished.catch(() => {});
      } else if (body.animate) {
        root.classList.add("inventory-category-fallback");
        animation = body.animate(
          [{ transform: "translateX(0)" }, { transform: `translateX(${-direction * 100}%)` }],
          { duration: 120, fill: "forwards", easing: "ease-in" },
        );
        await animation.finished;
        if (id !== generation) return;
        await commit();
        if (id !== generation) return;
        animation.cancel();
        animation = body.animate(
          [{ transform: `translateX(${direction * 100}%)` }, { transform: "translateX(0)" }],
          { duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        );
        await animation.finished;
      } else {
        await commit();
      }
    } catch {
      if (id === generation) {
        await applyFallback?.();
        selectedKind.value = options.kind.value;
      }
    } finally {
      if (id === generation) {
        transition = undefined;
        animation?.cancel();
        animation = undefined;
        clean();
        pending.value = false;
      }
    }
  }
  onDeactivated(cancel);
  onBeforeUnmount(cancel);
  return { selectedKind, pending, switchTo, cancel };
}
