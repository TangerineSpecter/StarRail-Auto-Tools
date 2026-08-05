<script setup lang="ts">
import { computed, ref } from "vue";
import { slotLabel } from "@/shared/catalogue/relic-options";
import {
  type RadarPieceInput,
  normalizeRadarPieces,
  pointsToPolygonAttr,
  polarPoint,
  radiusForPct,
  ringPoints,
  valuePolygonPoints,
} from "./radar-geometry";

const props = withDefaults(
  defineProps<{
    pieces: RadarPieceInput[];
    averagePotentialPct: number;
    weakSlot?: string | null;
    minPotentialPct?: number;
    size?: number;
  }>(),
  {
    weakSlot: null,
    minPotentialPct: 40,
    size: 176,
  },
);

const VIEW = 200;
const CX = 100;
const CY = 100;
const MAX_RADIUS = 68;
const GRID_PCTS = [25, 50, 75, 100] as const;
const LABEL_RADIUS = 88;

const axes = computed(() => normalizeRadarPieces(props.pieces));

const gridRings = computed(() =>
  GRID_PCTS.map((pct) => ({
    pct,
    points: pointsToPolygonAttr(ringPoints(CX, CY, radiusForPct(pct, MAX_RADIUS))),
  })),
);

const thresholdRing = computed(() => {
  const pct = props.minPotentialPct ?? 0;
  if (pct <= 0 || pct >= 100) return null;
  return pointsToPolygonAttr(ringPoints(CX, CY, radiusForPct(pct, MAX_RADIUS)));
});

const axisRays = computed(() =>
  axes.value.map((_, index) => {
    const end = polarPoint(CX, CY, MAX_RADIUS, index);
    return { x2: end.x, y2: end.y };
  }),
);

const valuePoints = computed(() => valuePolygonPoints(axes.value, CX, CY, MAX_RADIUS));
const valuePolygon = computed(() => pointsToPolygonAttr(valuePoints.value));

const vertices = computed(() =>
  axes.value.map((axis, index) => ({
    ...axis,
    point: valuePoints.value[index] ?? polarPoint(CX, CY, 0, index),
    isWeak: props.weakSlot === axis.slot,
  })),
);

const labels = computed(() =>
  axes.value.map((axis, index) => {
    const point = polarPoint(CX, CY, LABEL_RADIUS, index);
    const detail = [
      slotLabel(axis.slot),
      axis.missing ? "未装备" : null,
      axis.letterGrade ? axis.letterGrade : axis.missing ? null : "—",
      axis.missing ? null : `${Math.round(axis.potentialPct)}%`,
      props.weakSlot === axis.slot ? "短板" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      ...axis,
      x: point.x,
      y: point.y,
      isWeak: props.weakSlot === axis.slot,
      title: detail,
    };
  }),
);

const ariaLabel = computed(() => {
  const parts = axes.value.map((axis) => {
    const name = slotLabel(axis.slot);
    if (axis.missing) return `${name} 未装备`;
    const grade = axis.letterGrade ?? "—";
    return `${name} ${grade} ${Math.round(axis.potentialPct)}%`;
  });
  const weak = props.weakSlot ? `，短板 ${slotLabel(props.weakSlot)}` : "";
  return `六件词条潜力：${parts.join("，")}，平均 ${props.averagePotentialPct.toFixed(0)}%${weak}`;
});

const hasAnyPiece = computed(() => axes.value.some((axis) => !axis.missing));

const hoveredSlot = ref<string | null>(null);
</script>

<template>
  <div
    class="relic-potential-radar"
    role="img"
    :aria-label="ariaLabel"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <svg
      class="radar-svg"
      :viewBox="`0 0 ${VIEW} ${VIEW}`"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <!-- Concentric grid -->
      <polygon
        v-for="ring in gridRings"
        :key="ring.pct"
        class="radar-grid-ring"
        :points="ring.points"
      />
      <!-- Quality threshold ring -->
      <polygon
        v-if="thresholdRing"
        class="radar-threshold-ring"
        :points="thresholdRing"
      />
      <!-- Axis rays -->
      <line
        v-for="(ray, index) in axisRays"
        :key="`ray-${index}`"
        class="radar-axis-ray"
        :x1="CX"
        :y1="CY"
        :x2="ray.x2"
        :y2="ray.y2"
      />
      <!-- Value area -->
      <polygon
        v-if="hasAnyPiece"
        class="radar-value-area"
        :points="valuePolygon"
      />
      <!-- Vertices -->
      <circle
        v-for="vertex in vertices"
        :key="vertex.slot"
        class="radar-vertex"
        :class="{
          'is-weak': vertex.isWeak,
          'is-missing': vertex.missing,
          'is-ungraded': !vertex.missing && vertex.letterGrade === null,
          'is-hovered': hoveredSlot === vertex.slot
        }"
        :cx="vertex.point.x"
        :cy="vertex.point.y"
        :r="vertex.isWeak || hoveredSlot === vertex.slot ? 4 : 2.6"
      />
      <!-- Hitboxes for vertices to make hovering easier -->
      <circle
        v-for="vertex in vertices"
        :key="`hit-${vertex.slot}`"
        class="radar-vertex-hitbox"
        :cx="vertex.point.x"
        :cy="vertex.point.y"
        r="14"
        @mouseenter="hoveredSlot = vertex.slot"
        @mouseleave="hoveredSlot = null"
      />
      <!-- Axis labels -->
      <g
        v-for="label in labels"
        :key="`label-${label.slot}`"
        class="radar-axis-label"
        :class="{ 'is-weak': label.isWeak, 'is-missing': label.missing }"
        @mouseenter="hoveredSlot = label.slot"
        @mouseleave="hoveredSlot = null"
      >
        <title>{{ label.title }}</title>
        <text
          :x="label.x"
          :y="label.y"
          text-anchor="middle"
          dominant-baseline="middle"
        >
          {{ label.shortLabel }}
        </text>
      </g>
    </svg>
    <div class="radar-center" aria-hidden="true">
      <strong>{{ averagePotentialPct.toFixed(0) }}%</strong>
      <span>平均潜力</span>
    </div>

    <!-- Hover tooltips -->
    <div
      v-for="vertex in vertices"
      :key="`tooltip-${vertex.slot}`"
      class="radar-html-tooltip"
      :class="{ visible: hoveredSlot === vertex.slot }"
      :style="{ left: `${(vertex.point.x / VIEW) * 100}%`, top: `${(vertex.point.y / VIEW) * 100}%` }"
      aria-hidden="true"
    >
      <div class="tooltip-content">
        {{ labels.find((item) => item.slot === vertex.slot)?.title }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.relic-potential-radar {
  position: relative;
  flex: 0 0 auto;
  margin: 0 auto;
}
.radar-svg {
  display: block;
  overflow: visible;
}
.radar-grid-ring {
  fill: none;
  stroke: rgba(93, 143, 202, 0.18);
  stroke-width: 1;
}
.radar-threshold-ring {
  fill: none;
  stroke: rgba(199, 123, 50, 0.55);
  stroke-width: 1.2;
  stroke-dasharray: 3.5 2.5;
}
.radar-axis-ray {
  stroke: rgba(93, 143, 202, 0.16);
  stroke-width: 1;
}
.radar-value-area {
  fill: rgba(36, 86, 166, 0.16);
  stroke: #3d7ec4;
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.radar-vertex-hitbox {
  fill: transparent;
  cursor: crosshair;
}
.radar-vertex {
  fill: #3d7ec4;
  stroke: #fff;
  stroke-width: 1;
  transition: r 0.2s ease, fill 0.2s ease, stroke-width 0.2s ease;
}
.radar-vertex.is-hovered {
  fill: #2d65a3;
  stroke-width: 1.5;
}
.radar-vertex.is-weak {
  fill: #c77b32;
  stroke: #fff8ef;
}
.radar-vertex.is-missing {
  fill: #c5d3e4;
  stroke: #eef3f9;
}
.radar-vertex.is-ungraded {
  fill: #fff;
  stroke: #8aa3c0;
  stroke-width: 1.4;
}
.radar-axis-label text {
  fill: #5d7696;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  pointer-events: none;
}
.radar-axis-label.is-weak text {
  fill: #c77b32;
}
.radar-axis-label.is-missing text {
  fill: #9aabc0;
  font-weight: 600;
}
.radar-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  gap: 1px;
  transform: translateY(1px);
}
.radar-center strong {
  color: var(--ink, #172643);
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  text-shadow:
    0 0 8px rgba(255, 255, 255, 0.95),
    0 0 3px rgba(255, 255, 255, 0.9);
}
.radar-center span {
  color: #7994b4;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-shadow: 0 0 6px rgba(255, 255, 255, 0.95);
}
.radar-axis-label {
  cursor: default;
}
.radar-html-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 10;
  opacity: 0;
  transform: translate(-50%, -100%) scale(0.9);
  transition: opacity 0.2s ease, transform 0.2s ease;
  margin-top: -8px;
}
.radar-html-tooltip.visible {
  opacity: 1;
  transform: translate(-50%, -100%) scale(1);
}
.tooltip-content {
  background: rgba(23, 38, 67, 0.85);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(4px);
}
</style>
