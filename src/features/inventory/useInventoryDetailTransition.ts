import { nextTick, onBeforeUnmount, onDeactivated, type Ref } from "vue";

/** Animate the visible cards across the two-column/split layout without cloning the list. */
export function useInventoryDetailTransition(master: Ref<HTMLElement | null>) {
  let current: ViewTransition | undefined;
  let generation = 0;
  const named = new Map<HTMLElement, string>();

  function clean() {
    for (const [element, previous] of named) element.style.viewTransitionName = previous;
    named.clear();
    document.documentElement.classList.remove(
      "inventory-detail-transition",
      "inventory-detail-closing",
      "inventory-detail-fallback",
    );
  }
  function nameVisibleCards() {
    if (!master.value) return;
    const frame = master.value.getBoundingClientRect();
    const cards = master.value.querySelectorAll<HTMLElement>(
      ".inventory-relic-row, .inventory-lightcone-row, .character-card",
    );
    for (const card of cards) {
      if (named.size >= 12) break;
      if (named.has(card)) continue;
      const rect = card.getBoundingClientRect();
      if (rect.bottom <= Math.max(0, frame.top) || rect.top >= Math.min(innerHeight, frame.bottom))
        continue;
      const name = `inventory-card-${named.size}`;
      named.set(card, card.style.viewTransitionName);
      card.style.viewTransitionName = name;
    }
  }

  function run(change: () => void, closing = false) {
    const id = ++generation;
    current?.skipTransition();
    current = undefined;
    clean();
    const root = document.documentElement;
    const expanded =
      root.dataset.posture?.startsWith("unfolded-") && root.dataset.contentFold !== "tabletop";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!expanded || !document.startViewTransition || reducedMotion) {
      if (expanded && !reducedMotion) root.classList.add("inventory-detail-fallback");
      change();
      return;
    }
    root.classList.add("inventory-detail-transition");
    root.classList.toggle("inventory-detail-closing", closing);
    nameVisibleCards();
    let applied = false;
    const update = async () => {
      if (id !== generation || applied) return;
      applied = true;
      change();
      await nextTick();
      // The split-view watcher restores scroll after its own nextTick.
      await nextTick();
      if (id === generation) nameVisibleCards();
    };
    try {
      const transition = document.startViewTransition(update);
      current = transition;
      void transition.ready.catch(() => {});
      void transition.finished
        .catch(() => {})
        .finally(() => {
          if (current !== transition) return;
          current = undefined;
          clean();
        });
    } catch {
      clean();
      void update();
    }
  }

  function stop() {
    generation += 1;
    current?.skipTransition();
    current = undefined;
    clean();
  }
  onDeactivated(stop);
  onBeforeUnmount(stop);
  return Object.assign(run, { cancel: stop });
}
