// ─── Broad phase: find the pairs worth testing, without testing every pair ──
// The design-rule check asks one question of a layout: does any module overlap
// another? It answered it by comparing every module with every other module on
// the same roof:
//
//     for (let i = 0; i < corners.length; i++)
//       for (let j = i + 1; j < corners.length; j++)
//         if (rectsOverlap(shrink(corners[i]), shrink(corners[j]))) ...
//
// That is n(n−1)/2 separating-axis tests. On a rooftop it is nothing — 300
// modules is 45,000 tests. On a 23 ha ground field it is 41,322 modules and
// 853,741,281 tests, and it was measured at 67,229 ms of blocked main thread,
// inside the health snapshot that runs after every design. The app did not
// look slow; it looked dead.
//
// Nothing about the ANSWER was wrong, only the search. Modules are all about
// the same size and lie on a lattice, so a module can only overlap one of its
// immediate neighbours — a few candidates, never forty thousand. A uniform
// grid finds exactly those.
//
// ── Why a uniform grid and not a tree ───────────────────────────────────────
// Quadtrees and BVHs earn their complexity on scenes with wildly different
// object sizes. This one has the opposite property: every rectangle is one
// module, so a grid sized to the largest of them puts a bounded number of
// items in each cell by construction. It builds in one pass, has no rebalancing
// and no recursion, and the whole thing is forty lines.
//
// ── What this is NOT ────────────────────────────────────────────────────────
// It is not an approximation, and it is not a cap. Every pair whose bounding
// boxes touch is still handed to the caller, which still runs the same exact
// overlap test it always did. A pair this skips is a pair whose bounding boxes
// are disjoint, which cannot overlap. Same findings, every time — the gate test
// in lib/__tests__/spatial-index.test.ts pins that against a brute-force run.
import type { XY } from '../types';

/**
 * A neighbourhood lookup over POINTS — the same idea as the pair sweep below,
 * for the other shape this problem takes: "which modules are near this one?"
 *
 * The module-replacement analyzer asked that of every module by scanning every
 * module, which is the same n² in a different coat: measured at 35,293 ms for
 * 41,322 modules, second only to the overlap sweep in the blocked-thread
 * budget. A module can only be boxed in by its immediate neighbours, so the
 * search is a neighbourhood search and nothing more.
 */
export interface PointIndex {
  /**
   * Indices whose point lies within `radius` of `p` — plus, possibly, a few
   * just outside it, because whole cells are returned. Callers must apply
   * their own exact distance test, exactly as they did when scanning
   * everything; this only decides who is worth asking about.
   */
  near(p: XY, radius: number): number[];
}

/**
 * Bucket points into square cells of `cellM` metres.
 *
 * Choose `cellM` near the radius the caller will query with: much smaller and
 * a query walks many cells, much larger and each cell holds more than the
 * caller needs. Anything in the right order of magnitude is fine — this is a
 * constant factor, not a correctness knob.
 */
export function indexPoints(points: readonly XY[], cellM: number): PointIndex {
  const cell = cellM > 0 && Number.isFinite(cellM) ? cellM : 1;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  }
  return {
    near(p, radius) {
      const out: number[] = [];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return out;
      const r = Number.isFinite(radius) && radius > 0 ? radius : 0;
      const x0 = Math.floor((p.x - r) / cell);
      const x1 = Math.floor((p.x + r) / cell);
      const y0 = Math.floor((p.y - r) / cell);
      const y1 = Math.floor((p.y + r) / cell);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const bucket = grid.get(`${cx},${cy}`);
          if (bucket) for (const i of bucket) out.push(i);
        }
      }
      return out;
    },
  };
}

/** Axis-aligned bounds of one polygon, in one pass. */
function aabb(poly: readonly XY[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

/**
 * Call `onPair(i, j)` for every pair of polygons whose bounding boxes touch,
 * with `i < j`, each pair exactly once.
 *
 * The caller still applies its own exact test — this only decides which pairs
 * are worth asking about. A polygon with no finite coordinates is skipped: it
 * has no position, so it cannot be shown to overlap anything, and feeding NaN
 * into the grid arithmetic would silently drop real pairs instead.
 */
export function forEachCandidatePair(
  polys: readonly (readonly XY[])[],
  onPair: (i: number, j: number) => void,
): void {
  const n = polys.length;
  if (n < 2) return;

  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = new Array(n);
  let cell = 0;
  let minX = Infinity;
  let minY = Infinity;
  let live = 0;
  for (let i = 0; i < n; i++) {
    const b = aabb(polys[i]);
    boxes[i] = b;
    if (!Number.isFinite(b.x0) || !Number.isFinite(b.y0)) continue;
    live++;
    if (b.x0 < minX) minX = b.x0;
    if (b.y0 < minY) minY = b.y0;
    // Cell size = the LARGEST box. That is what bounds occupancy: no box can
    // then span more than two cells on an axis, so each one lands in at most
    // four cells and each cell holds only its own neighbourhood.
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    if (w > cell) cell = w;
    if (h > cell) cell = h;
  }
  if (live < 2) return;
  // Degenerate input — every box is a point. Any positive size works; this
  // keeps the arithmetic finite and the grid meaningful.
  if (!(cell > 0)) cell = 1;

  /**
   * cell key -> item indices. A string key (rather than packing two integers
   * into one number) keeps this correct for any coordinate range: a site can
   * sit kilometres from the frame origin, and a packed key would silently
   * collide once the column index outgrew its bit field.
   */
  const grid = new Map<string, number[]>();
  const cellOf = (v: number, min: number) => Math.floor((v - min) / cell);

  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    if (!Number.isFinite(b.x0) || !Number.isFinite(b.y0)) continue;
    const cx0 = cellOf(b.x0, minX);
    const cx1 = cellOf(b.x1, minX);
    const cy0 = cellOf(b.y0, minY);
    const cy1 = cellOf(b.y1, minY);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = `${cx},${cy}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(i);
        else grid.set(key, [i]);
      }
    }
  }

  // Walk each item once, gather the neighbours sharing any of its cells, and
  // report each pair a single time. `seen` is per item and holds only that
  // item's handful of neighbours, so it never grows with the design.
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    if (!Number.isFinite(b.x0) || !Number.isFinite(b.y0)) continue;
    seen.clear();
    const cx0 = cellOf(b.x0, minX);
    const cx1 = cellOf(b.x1, minX);
    const cy0 = cellOf(b.y0, minY);
    const cy1 = cellOf(b.y1, minY);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const bucket = grid.get(`${cx},${cy}`);
        if (!bucket) continue;
        for (const j of bucket) {
          if (j <= i || seen.has(j)) continue;
          seen.add(j);
          const o = boxes[j];
          // bounding boxes disjoint ⇒ the shapes cannot overlap
          if (o.x0 > b.x1 || o.x1 < b.x0 || o.y0 > b.y1 || o.y1 < b.y0) continue;
          onPair(i, j);
        }
      }
    }
  }
}
