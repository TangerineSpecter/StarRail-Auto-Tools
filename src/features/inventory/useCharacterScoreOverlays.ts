import { onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from "vue";
import { scoreRelic, type RelicScoreResult } from "@/shared/utils/relic-score";
import type { CharacterBuildPlan, RelicListItem } from "@/types";
import type { RelicDetailData } from "./detail-types";
import {
  candidateToDetail,
  listItemToDetail,
  type RelicScoreCandidateInput,
} from "./score-panel-helpers";

export interface EquippedRelicPeekState {
  slot: string;
  relic: RelicDetailData;
  letterGrade: string | null;
  potentialPct: number;
  weightedRolls: number;
}

export interface RelicReplaceCompareState {
  itemId: number;
  current: RelicDetailData;
  currentScore: RelicScoreResult;
  candidate: RelicDetailData;
  candidateScore: RelicScoreResult;
  deltaWeightedRolls: number;
}

export function useCharacterScoreOverlays(options: {
  equippedBySlot: ComputedRef<Map<string, RelicDetailData>>;
  weakSlot: ComputedRef<string | null>;
  weights: ComputedRef<Record<string, number>>;
  plan: ComputedRef<CharacterBuildPlan | null | undefined>;
  inventoryRelics: Ref<RelicListItem[]>;
}) {
  const peek = ref<EquippedRelicPeekState | null>(null);
  const peekPopoverEl = ref<HTMLElement | null>(null);
  const replaceCompare = ref<RelicReplaceCompareState | null>(null);

  function closePeek() {
    peek.value = null;
  }

  function closeReplaceCompare() {
    replaceCompare.value = null;
  }

  function closeAllOverlays() {
    closePeek();
    closeReplaceCompare();
  }

  function openPeek(
    _event: MouseEvent,
    piece: {
      slot: string;
      letterGrade: string | null;
      potentialPct: number;
      weightedRolls: number;
    },
  ) {
    const relic = options.equippedBySlot.value.get(piece.slot);
    if (!relic) return;
    if (peek.value?.slot === piece.slot) {
      closePeek();
      return;
    }

    closeReplaceCompare();
    peek.value = {
      slot: piece.slot,
      relic,
      letterGrade: piece.letterGrade,
      potentialPct: piece.potentialPct,
      weightedRolls: piece.weightedRolls,
    };
  }

  function openReplaceCompare(item: {
    relic: RelicScoreCandidateInput;
    score: RelicScoreResult;
    deltaWeightedRolls: number;
  }) {
    const itemId = item.relic.itemId;
    if (itemId == null) return;
    if (replaceCompare.value?.itemId === itemId) {
      closeReplaceCompare();
      return;
    }

    const weakSlot = options.weakSlot.value;
    if (!weakSlot) return;
    const current = options.equippedBySlot.value.get(weakSlot);
    if (!current) return;

    closePeek();
    const currentScore = scoreRelic(
      {
        slot: current.slot,
        mainStat: current.mainStat,
        rarity: current.rarity,
        level: current.level,
        setId: current.setId,
        substats: current.substats,
      },
      options.weights.value,
      { allowedMainStats: options.plan.value?.mainStats },
    );

    const listRow = options.inventoryRelics.value.find((row) => row.itemId === itemId);
    const candidate = listRow ? listItemToDetail(listRow) : candidateToDetail(item.relic);

    replaceCompare.value = {
      itemId,
      current,
      currentScore,
      candidate,
      candidateScore: item.score,
      deltaWeightedRolls: item.deltaWeightedRolls,
    };
  }

  function onDocumentPointerDown(event: PointerEvent) {
    if (!peek.value && !replaceCompare.value) return;
    const target = event.target as Element | null;
    if (
      target?.closest(
        ".score-piece, .score-replace-item, .equipped-relic-peek-popover, .relic-replace-compare-popover",
      )
    ) {
      return;
    }
    if (target?.closest(".relic-replace-compare-root")) {
      closeReplaceCompare();
      return;
    }
    closeAllOverlays();
  }

  function onDocumentKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && !event.isComposing) {
      if (peek.value || replaceCompare.value) {
        event.stopPropagation();
        closeAllOverlays();
      }
    }
  }

  function onWindowScrollOrResize(event: Event) {
    if (!peek.value) return;
    if (event.type === "scroll") {
      const target = event.target;
      if (target instanceof Element && target.closest(".equipped-relic-peek-popover")) {
        return;
      }
      if (target instanceof Node && peekPopoverEl.value?.contains(target)) {
        return;
      }
    }
    closePeek();
  }

  onMounted(() => {
    document.addEventListener("pointerdown", onDocumentPointerDown);
    document.addEventListener("keydown", onDocumentKeydown);
    window.addEventListener("scroll", onWindowScrollOrResize, true);
    window.addEventListener("resize", onWindowScrollOrResize);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", onDocumentPointerDown);
    document.removeEventListener("keydown", onDocumentKeydown);
    window.removeEventListener("scroll", onWindowScrollOrResize, true);
    window.removeEventListener("resize", onWindowScrollOrResize);
  });

  return {
    peek,
    peekPopoverEl,
    replaceCompare,
    closePeek,
    closeReplaceCompare,
    closeAllOverlays,
    openPeek,
    openReplaceCompare,
  };
}
