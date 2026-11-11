import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
  type Ref,
} from "vue";

/** Follow the mobile entry's single posture source; retain the same list and detail instances. */
export function useInventorySplitView(open: Ref<boolean>, master: Ref<HTMLElement | null>) {
  const expanded = ref(false);
  const active = ref(true);
  let observer: MutationObserver | undefined;
  let savedScroll = 0;
  let transition = 0;
  const splitView = computed(() => active.value && expanded.value && open.value);

  function update() {
    const { posture, contentFold } = document.documentElement.dataset;
    expanded.value =
      (posture === "unfolded-landscape" || posture === "unfolded-portrait") &&
      contentFold !== "tabletop";
  }
  function start() {
    active.value = true;
    observer?.disconnect();
    update();
    observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-posture", "data-content-fold"],
    });
  }
  function stop() {
    active.value = false;
    transition += 1;
    observer?.disconnect();
  }

  watch(splitView, async (split) => {
    if (!active.value) return;
    const current = ++transition;
    if (split) savedScroll = window.scrollY;
    await nextTick();
    if (!active.value || current !== transition) return;
    window.scrollTo(0, split ? 0 : savedScroll);
    if (split && master.value) {
      master.value.scrollTop = savedScroll;
      master.value.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
    }
  });

  onMounted(start);
  onActivated(start);
  onDeactivated(stop);
  onBeforeUnmount(stop);
  return splitView;
}
