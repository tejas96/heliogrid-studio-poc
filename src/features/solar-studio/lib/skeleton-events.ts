// ─── Straight-skeleton event solver (Phase 21c foundation) ──────────────────
// The wavefront of an equal-pitch roof is the polygon offset inward at unit
// speed. Every topological change happens when THREE offset edge-lines become
// concurrent, so one linear system answers both event types:
//
//   edge event    three CONSECUTIVE edges meet — the middle edge collapses
//   split event   a reflex vertex's two edges meet a THIRD, non-adjacent edge,
//                 and the shrinking polygon splits in two
//
// Modelling it this way is deliberate. The previous attempt tracked per-vertex
// bisector VELOCITIES, which diverge as two walls approach anti-parallel — the
// exact configuration an L-shaped roof creates. Solving for the meeting point
// directly has no such singularity: near-parallel lines simply produce a large
// t (or none), which the caller filters.
//
// Edge i is the segment poly[i] → poly[i+1]. Its inward-offset line at time t
// is { p : p·n_i = d_i + t }.
import type { XY } from '../types';

export interface EdgeLine {
  /** unit inward normal */
  n: XY;
  /** support: any point on the edge, dotted with n */
  d: number;
}

export interface SkeletonEvent {
  /** time = inward offset distance = roof height / tan(pitch) */
  t: number;
  /** where the three wavefronts meet */
  p: XY;
}

/** Unit inward normal of edge a→b for a CCW ring. */
export function inwardNormalOf(a: XY, b: XY): XY {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return { x: 0, y: 0 };
  return { x: -dy / len, y: dx / len };
}

/** Per-edge offset lines for a CCW ring. */
export function edgeLines(poly: XY[]): EdgeLine[] {
  const n = poly.length;
  const out: EdgeLine[] = [];
  for (let i = 0; i < n; i++) {
    const nn = inwardNormalOf(poly[i], poly[(i + 1) % n]);
    out.push({ n: nn, d: poly[i].x * nn.x + poly[i].y * nn.y });
  }
  return out;
}

/**
 * When (and where) do the inward offsets of edges a, b and c become concurrent?
 * Returns null when the three lines never meet at a single point — parallel or
 * degenerate configurations, which are precisely the cases the old
 * velocity-based solver blew up on.
 */
export function concurrencyEvent(
  a: EdgeLine,
  b: EdgeLine,
  c: EdgeLine,
): SkeletonEvent | null {
  // Solve, for unknowns (x, y, t):
  //   x·a.n.x + y·a.n.y − t = a.d
  //   x·b.n.x + y·b.n.y − t = b.d
  //   x·c.n.x + y·c.n.y − t = c.d
  // Subtracting pairs eliminates t and leaves a 2×2 system.
  const r1x = a.n.x - b.n.x;
  const r1y = a.n.y - b.n.y;
  const r1c = a.d - b.d;
  const r2x = a.n.x - c.n.x;
  const r2y = a.n.y - c.n.y;
  const r2c = a.d - c.d;

  const det = r1x * r2y - r1y * r2x;
  if (Math.abs(det) < 1e-9) return null; // no unique meeting point

  const x = (r1c * r2y - r1y * r2c) / det;
  const y = (r1x * r2c - r1c * r2x) / det;
  const t = x * a.n.x + y * a.n.y - a.d;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(t)) return null;
  return { t, p: { x, y } };
}

/**
 * Is `p` inside the ring? Used to discard algebraic solutions that sit outside
 * the footprint — a meeting point of three lines is only a real roof event if
 * it happens over the building.
 */
export function pointInRing(p: XY, poly: XY[], eps = 1e-9): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a.y > p.y + eps !== b.y > p.y + eps &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

/** Reflex (concave) corner indices of a CCW ring — the vertices that split. */
export function reflexVertices(poly: XY[]): number[] {
  const n = poly.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n];
    const b = poly[i];
    const c = poly[(i + 1) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross < -1e-9) out.push(i);
  }
  return out;
}

/**
 * Every candidate event for the INITIAL wavefront, in time order. This is the
 * first tick of the simulation: edge events for each consecutive triple, and
 * split events for each reflex vertex against every non-adjacent edge.
 * Candidates outside the footprint or at t ≤ 0 are dropped.
 */
export function initialEvents(poly: XY[]): (SkeletonEvent & {
  kind: 'edge' | 'split';
  edges: [number, number, number];
})[] {
  const n = poly.length;
  const lines = edgeLines(poly);
  const out: (SkeletonEvent & { kind: 'edge' | 'split'; edges: [number, number, number] })[] = [];

  for (let i = 0; i < n; i++) {
    // edge event: edges (i-1, i, i+1) — edge i collapses
    const ev = concurrencyEvent(lines[(i - 1 + n) % n], lines[i], lines[(i + 1) % n]);
    if (ev && ev.t > 1e-9 && pointInRing(ev.p, poly))
      out.push({ ...ev, kind: 'edge', edges: [(i - 1 + n) % n, i, (i + 1) % n] });
  }

  for (const v of reflexVertices(poly)) {
    const left = (v - 1 + n) % n; // edge arriving at v
    const right = v; // edge leaving v
    for (let c = 0; c < n; c++) {
      if (c === left || c === right) continue;
      const ev = concurrencyEvent(lines[left], lines[right], lines[c]);
      if (ev && ev.t > 1e-9 && pointInRing(ev.p, poly))
        out.push({ ...ev, kind: 'split', edges: [left, right, c] });
    }
  }

  return out.sort((p, q) => p.t - q.t);
}
