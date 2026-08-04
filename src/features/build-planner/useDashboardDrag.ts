import { onBeforeUnmount, ref, type Ref } from "vue";

export type DashboardDragItem = {
  characterId: number;
  pinned: boolean;
};

type DashboardDrop = {
  sourceId: number;
  targetId: number;
  visibleOrderIds: number[];
};

type DashboardDragOptions = {
  dashboardElement: Ref<HTMLElement | null>;
  canDrag: () => boolean;
  items: () => DashboardDragItem[];
  onDrop: (drop: DashboardDrop) => void | Promise<void>;
};

export function useDashboardDrag(options: DashboardDragOptions) {
  const draggedCharacterId = ref<number | null>(null);
  const dragOverCharacterId = ref<number | null>(null);
  let stopPointerDrag: (() => void) | null = null;
  let dragPreview: HTMLElement | null = null;
  let autoScrollFrame: number | null = null;
  let dragScrollTarget: HTMLElement | Window | null = null;
  let lastPointer = { x: 0, y: 0 };
  let dragPreviewOffset = { x: 0, y: 0 };

  function removeDragPreview() {
    dragPreview?.remove();
    dragPreview = null;
  }

  function stopAutoScroll() {
    if (autoScrollFrame !== null) cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = null;
    dragScrollTarget = null;
  }

  function findDragScrollTarget(): HTMLElement | Window {
    let parent = options.dashboardElement.value;
    while (parent && parent !== document.body) {
      const style = getComputedStyle(parent);
      const canScrollVertically = /(auto|scroll|overlay)/.test(style.overflowY);
      const canScrollHorizontally = /(auto|scroll|overlay)/.test(style.overflowX);
      if (
        (canScrollVertically && parent.scrollHeight > parent.clientHeight) ||
        (canScrollHorizontally && parent.scrollWidth > parent.clientWidth)
      ) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return window;
  }

  function isWindowScrollTarget(target: HTMLElement | Window): target is Window {
    return target === window;
  }

  function getDragScrollRect(target: HTMLElement | Window) {
    if (isWindowScrollTarget(target)) {
      return { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
    }
    return target.getBoundingClientRect();
  }

  function updateDragTarget(clientX: number, clientY: number) {
    const row = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>(".build-progress-row");
    const targetId = Number(row?.dataset.characterId);
    const target = options.items().find((item) => item.characterId === targetId);
    const source = options.items().find((item) => item.characterId === draggedCharacterId.value);
    dragOverCharacterId.value =
      target && source && target.pinned === source.pinned ? targetId : null;
  }

  function autoScroll() {
    if (draggedCharacterId.value === null || !options.dashboardElement.value) return;
    const scrollTarget = dragScrollTarget ?? (dragScrollTarget = findDragScrollTarget());
    const rect = getDragScrollRect(scrollTarget);
    const edge = 76;
    const maxStep = 16;
    const verticalStep =
      lastPointer.y < rect.top + edge
        ? -Math.min(maxStep, Math.ceil((rect.top + edge - lastPointer.y) / 4))
        : lastPointer.y > rect.bottom - edge
          ? Math.min(maxStep, Math.ceil((lastPointer.y - (rect.bottom - edge)) / 4))
          : 0;
    const horizontalStep =
      lastPointer.x < rect.left + edge
        ? -Math.min(maxStep, Math.ceil((rect.left + edge - lastPointer.x) / 4))
        : lastPointer.x > rect.right - edge
          ? Math.min(maxStep, Math.ceil((lastPointer.x - (rect.right - edge)) / 4))
          : 0;
    if (verticalStep || horizontalStep) {
      if (isWindowScrollTarget(scrollTarget)) {
        window.scrollBy(horizontalStep, verticalStep);
      } else {
        scrollTarget.scrollTop += verticalStep;
        scrollTarget.scrollLeft += horizontalStep;
      }
      updateDragTarget(lastPointer.x, lastPointer.y);
    }
    autoScrollFrame = requestAnimationFrame(autoScroll);
  }

  function startAutoScroll() {
    stopAutoScroll();
    dragScrollTarget = findDragScrollTarget();
    autoScrollFrame = requestAnimationFrame(autoScroll);
  }

  function endDrag() {
    stopPointerDrag?.();
    stopPointerDrag = null;
    stopAutoScroll();
    removeDragPreview();
    draggedCharacterId.value = null;
    dragOverCharacterId.value = null;
  }

  function pointerDragStart(item: DashboardDragItem, event: PointerEvent) {
    if (!options.canDrag() || event.button !== 0) return;
    event.preventDefault();
    endDrag();
    draggedCharacterId.value = item.characterId;
    const visibleOrderIds = options.items().map((card) => card.characterId);
    lastPointer = { x: event.clientX, y: event.clientY };
    const row = (event.currentTarget as HTMLElement).closest<HTMLElement>(".build-progress-row");
    if (row) {
      const rect = row.getBoundingClientRect();
      dragPreviewOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      dragPreview = row.cloneNode(true) as HTMLElement;
      dragPreview.classList.add("build-drag-preview");
      dragPreview.style.width = `${rect.width}px`;
      dragPreview.style.height = `${rect.height}px`;
      dragPreview.style.left = `${rect.left}px`;
      dragPreview.style.top = `${rect.top}px`;
      document.body.appendChild(dragPreview);
    }
    startAutoScroll();
    const pointerId = event.pointerId;
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId || draggedCharacterId.value === null) return;
      moveEvent.preventDefault();
      lastPointer = { x: moveEvent.clientX, y: moveEvent.clientY };
      if (dragPreview) {
        dragPreview.style.left = `${moveEvent.clientX - dragPreviewOffset.x}px`;
        dragPreview.style.top = `${moveEvent.clientY - dragPreviewOffset.y}px`;
      }
      updateDragTarget(moveEvent.clientX, moveEvent.clientY);
    };
    const onPointerUp = () => {
      const sourceId = draggedCharacterId.value;
      const targetId = dragOverCharacterId.value;
      endDrag();
      if (sourceId !== null && targetId !== null && sourceId !== targetId) {
        void options.onDrop({ sourceId, targetId, visibleOrderIds });
      }
    };
    const onPointerCancel = endDrag;
    stopPointerDrag = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerCancel, { once: true });
  }

  onBeforeUnmount(endDrag);

  return { draggedCharacterId, dragOverCharacterId, pointerDragStart };
}
