/**
 * Pure geometry helpers for the six-slot relic potential radar chart.
 * Axis order matches relic equipment convention.
 */

export const RADAR_SLOT_ORDER = [
  "Head",
  "Hands",
  "Body",
  "Feet",
  "PlanarSphere",
  "LinkRope",
] as const;

export type RadarSlot = (typeof RADAR_SLOT_ORDER)[number];

/** Short axis labels for dense radar UI (full name via title / aria). */
export const RADAR_SLOT_SHORT_LABELS: Record<RadarSlot, string> = {
  Head: "头",
  Hands: "手",
  Body: "躯",
  Feet: "脚",
  PlanarSphere: "球",
  LinkRope: "绳",
};

export type RadarPieceInput = {
  slot: string;
  potentialPct: number;
  letterGrade?: string | null;
};

export type NormalizedRadarAxis = {
  slot: RadarSlot;
  shortLabel: string;
  potentialPct: number;
  /** Clamped to 0–100 for drawing. */
  drawPct: number;
  letterGrade: string | null;
  missing: boolean;
};

export type Point = { x: number; y: number };

/** Clamp a potential % into the drawable 0–100 range. */
export function clampDrawPct(potentialPct: number): number {
  if (!Number.isFinite(potentialPct)) return 0;
  return Math.min(100, Math.max(0, potentialPct));
}

/**
 * Normalize arbitrary pieces into a fixed 6-axis series.
 * Missing slots become 0% (missing=true) so the polygon always has 6 vertices.
 */
export function normalizeRadarPieces(pieces: RadarPieceInput[]): NormalizedRadarAxis[] {
  const bySlot = new Map(pieces.map((piece) => [piece.slot, piece]));
  return RADAR_SLOT_ORDER.map((slot) => {
    const piece = bySlot.get(slot);
    const potentialPct = piece?.potentialPct ?? 0;
    const missing = !piece;
    return {
      slot,
      shortLabel: RADAR_SLOT_SHORT_LABELS[slot],
      potentialPct: Number.isFinite(potentialPct) ? potentialPct : 0,
      drawPct: missing ? 0 : clampDrawPct(potentialPct),
      letterGrade: piece?.letterGrade ?? null,
      missing,
    };
  });
}

/**
 * Regular polygon vertices for a radar chart.
 * index 0 is straight up (-90°), then clockwise.
 */
export function polarPoint(
  cx: number,
  cy: number,
  radius: number,
  index: number,
  axisCount: number = RADAR_SLOT_ORDER.length,
): Point {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / axisCount;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export function ringPoints(
  cx: number,
  cy: number,
  radius: number,
  axisCount: number = RADAR_SLOT_ORDER.length,
): Point[] {
  return Array.from({ length: axisCount }, (_, index) => polarPoint(cx, cy, radius, index, axisCount));
}

/** Closed SVG polygon points string: "x,y x,y …". */
export function pointsToPolygonAttr(points: Point[]): string {
  return points.map((point) => `${roundCoord(point.x)},${roundCoord(point.y)}`).join(" ");
}

/** Value polygon from drawPct (0–100) relative to maxRadius. */
export function valuePolygonPoints(
  axes: Pick<NormalizedRadarAxis, "drawPct">[],
  cx: number,
  cy: number,
  maxRadius: number,
): Point[] {
  return axes.map((axis, index) =>
    polarPoint(cx, cy, (axis.drawPct / 100) * maxRadius, index, axes.length),
  );
}

/** Radius for a reference ring given a percent (e.g. minPotentialPct). */
export function radiusForPct(pct: number, maxRadius: number): number {
  return (clampDrawPct(pct) / 100) * maxRadius;
}

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}
