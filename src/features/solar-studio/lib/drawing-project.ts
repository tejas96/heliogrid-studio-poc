// ─── Drawing projections (Phase 22o part 3) ─────────────────────────────────
// Turning the 3D member graph into the two views a drawing set needs:
// an isometric, and a side elevation with the foundation in section.
//
// Pure, because a projection is arithmetic and arithmetic should be tested. The
// sheet components below only place the results.
//
// EN convention throughout: x east, y north, z up.
import type { XYZ } from './structure';

export interface Pt2 {
  x: number;
  y: number;
}

/**
 * ISOMETRIC. The standard 30° construction: x and y each rake 30° from the
 * horizontal, z stays vertical. Screen y grows DOWNWARD, so height subtracts.
 *
 * Chosen over a perspective view deliberately — on an isometric, equal lengths
 * draw equal, so a fabricator can measure the drawing. Perspective looks better
 * and lies about dimensions.
 */
export function isoProject(p: XYZ): Pt2 {
  const c = Math.cos(Math.PI / 6); // √3/2
  const s = Math.sin(Math.PI / 6); // 1/2
  return {
    x: (p.x - p.y) * c,
    y: (p.x + p.y) * s - p.z,
  };
}

/**
 * SIDE ELEVATION looking along the row axis, with the low (south, down-tilt)
 * edge on the LEFT — the ordinary drafting convention for a tilted array.
 *
 * ⚠️ `components/StructurePreview` draws this MIRRORED. Its comment claims
 * "draw front on the left", but it maps depth as `-y` and then increases X with
 * depth, which puts the south edge on the right. I nearly copied the comment
 * instead of the arithmetic. The thumbnail is not corrected here — that is a
 * separate change with its own visual review — but the two are inconsistent
 * and the printed sheet follows the convention.
 */
export function elevationProject(p: XYZ): Pt2 {
  return { x: p.y, y: -p.z };
}

export interface FitTransform {
  /** world → sheet units */
  k: number;
  toX: (v: number) => number;
  toY: (v: number) => number;
  /** sheet units per METRE — what a scale bar needs */
  unitsPerMetre: number;
}

/**
 * Fit projected points into a box, preserving aspect.
 *
 * Aspect is preserved on purpose: a drawing stretched to fill its frame is a
 * drawing you cannot measure, which defeats the point of an isometric.
 */
export function fitToBox(
  pts: Pt2[],
  box: { x: number; y: number; w: number; h: number },
  pad = 12,
): FitTransform {
  if (pts.length === 0) {
    const k = 1;
    return { k, toX: (v) => box.x + v, toY: (v) => box.y + v, unitsPerMetre: k };
  }
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const k = Math.min(
    (box.w - pad * 2) / Math.max(0.001, maxX - minX),
    (box.h - pad * 2) / Math.max(0.001, maxY - minY),
  );
  // centre the drawing in its frame rather than jamming it into a corner
  const ox = box.x + pad + ((box.w - pad * 2) - (maxX - minX) * k) / 2;
  const oy = box.y + pad + ((box.h - pad * 2) - (maxY - minY) * k) / 2;
  return {
    k,
    toX: (v) => ox + (v - minX) * k,
    toY: (v) => oy + (v - minY) * k,
    // the projections are unit-preserving in the horizontal, so one world metre
    // is k sheet units — that is exactly what the scale bar must draw
    unitsPerMetre: k,
  };
}

/** A drawn segment of a member, already projected. */
export interface Seg2 {
  a: Pt2;
  b: Pt2;
  kind: string;
}

/** Project a member list through `f`, keeping the kind for styling. */
export function projectMembers(
  members: { a: XYZ; b: XYZ; kind: string }[],
  f: (p: XYZ) => Pt2,
): Seg2[] {
  return members.map((m) => ({ a: f(m.a), b: f(m.b), kind: m.kind }));
}
