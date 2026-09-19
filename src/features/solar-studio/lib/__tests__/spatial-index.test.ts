// ─── Gate: the fast search finds exactly what the slow one found ────────────
// Two design checks used to compare every module with every other module:
// the DRC's overlap sweep and the module-replacement analyzer's neighbour
// scan. On a rooftop that is nothing. On a 23 ha field it is 41,322 modules,
// and the two were measured at 67,229 ms and 35,293 ms of BLOCKED main thread
// — inside the health snapshot that runs after every design, so the app went
// dead for a minute and a half every time a large layout changed.
//
// `lib/spatial-index.ts` replaces the search, not the answer. That distinction
// is the whole risk of this change: a broad phase that drops a real pair turns
// a hard DRC error into silence, and a silent DRC is worse than a slow one —
// it would ship overlapping modules into a BOM.
//
// So these tests do not measure time. They run the fast path and the ORIGINAL
// brute-force path over the same layouts and demand the same answer, including
// on the cases a grid is most likely to get wrong: modules straddling cell
// boundaries, a site far from the frame origin, mixed sizes, and duplicates on
// top of each other.
import { describe, expect, it } from 'vitest';
import { forEachCandidatePair, indexPoints } from '../spatial-index';
import { rectsOverlap, rectCorners } from '../geo';
import type { XY } from '../../types';

/** Exactly what the code did before: every pair, no index. */
function bruteForcePairs(polys: XY[][]): string[] {
  const out: string[] = [];
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      if (rectsOverlap(polys[i], polys[j])) out.push(`${i}-${j}`);
    }
  }
  return out.sort();
}

/** The same question through the broad phase. */
function indexedPairs(polys: XY[][]): string[] {
  const out: string[] = [];
  forEachCandidatePair(polys, (i, j) => {
    if (rectsOverlap(polys[i], polys[j])) out.push(`${i}-${j}`);
  });
  return out.sort();
}

/** A lattice of module-sized rectangles, like a filled table. */
function lattice(cols: number, rows: number, pitchX: number, pitchY: number, origin: XY = { x: 0, y: 0 }): XY[][] {
  const out: XY[][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push(
        rectCorners({ x: origin.x + c * pitchX, y: origin.y + r * pitchY }, 1.133, 2.382, 0),
      );
  return out;
}

describe('the broad phase agrees with brute force', () => {
  it('a clean lattice has no overlaps, found by both', () => {
    const polys = lattice(20, 20, 1.2, 2.45);
    expect(indexedPairs(polys)).toEqual(bruteForcePairs(polys));
    expect(indexedPairs(polys)).toEqual([]);
  });

  it('a lattice pitched TIGHTER than the module overlaps everywhere — same pairs', () => {
    // the case that matters: a real defect, not an empty result both ways
    const polys = lattice(12, 12, 0.9, 2.0);
    const brute = bruteForcePairs(polys);
    expect(brute.length).toBeGreaterThan(100);
    expect(indexedPairs(polys)).toEqual(brute);
  });

  it('modules straddling cell boundaries are still compared', () => {
    // A grid's classic failure: two shapes that overlap but sit either side of
    // a cell line. Offsetting the lattice by a half pitch puts many of them
    // exactly there.
    const polys = [
      ...lattice(8, 8, 1.15, 2.4),
      ...lattice(8, 8, 1.15, 2.4, { x: 0.575, y: 1.2 }),
    ];
    expect(indexedPairs(polys)).toEqual(bruteForcePairs(polys));
  });

  it('a site kilometres from the frame origin behaves identically', () => {
    // the local frame puts a field wherever the pin is; cell indices go
    // negative and large, and a packed integer key would collide here
    const far = lattice(10, 10, 0.9, 2.0, { x: -4137.62, y: 2890.44 });
    expect(indexedPairs(far)).toEqual(bruteForcePairs(far));
    expect(indexedPairs(far).length).toBeGreaterThan(0);
  });

  it('mixed sizes — a big rectangle over many small ones — agrees', () => {
    // cell size follows the LARGEST box, so this is the shape that stresses
    // occupancy: one item lands in every cell the small ones use
    const polys: XY[][] = [
      ...lattice(10, 10, 1.2, 2.45),
      rectCorners({ x: 6, y: 12 }, 14, 28, 0),
    ];
    expect(indexedPairs(polys)).toEqual(bruteForcePairs(polys));
  });

  it('duplicates stacked on one another are all reported', () => {
    const one = rectCorners({ x: 3, y: 4 }, 1.133, 2.382, 0);
    const polys = [one, one, one, rectCorners({ x: 40, y: 40 }, 1.133, 2.382, 0)];
    expect(indexedPairs(polys)).toEqual(bruteForcePairs(polys));
    expect(indexedPairs(polys)).toEqual(['0-1', '0-2', '1-2']);
  });

  it('rotated modules — a turned table — agree', () => {
    const polys: XY[][] = [];
    for (let i = 0; i < 60; i++)
      polys.push(rectCorners({ x: (i % 10) * 1.0, y: Math.floor(i / 10) * 2.1 }, 1.133, 2.382, 37));
    expect(indexedPairs(polys)).toEqual(bruteForcePairs(polys));
  });

  it('degenerate inputs do not throw and report nothing', () => {
    expect(indexedPairs([])).toEqual([]);
    expect(indexedPairs([rectCorners({ x: 0, y: 0 }, 1, 1, 0)])).toEqual([]);
    // a module with no position cannot be shown to overlap anything
    const nan: XY[][] = [
      [{ x: NaN, y: NaN }, { x: NaN, y: NaN }, { x: NaN, y: NaN }, { x: NaN, y: NaN }],
      rectCorners({ x: 0, y: 0 }, 1, 1, 0),
    ];
    expect(() => indexedPairs(nan)).not.toThrow();
  });

  it('every pair it reports really is a pair, and each only once', () => {
    const polys = lattice(9, 9, 0.9, 2.0);
    const seen: string[] = [];
    forEachCandidatePair(polys, (i, j) => {
      expect(i).toBeLessThan(j);
      seen.push(`${i}-${j}`);
    });
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('the point index never hides a neighbour', () => {
  it('returns every point inside the radius', () => {
    const pts: XY[] = [];
    for (let i = 0; i < 400; i++) pts.push({ x: (i % 20) * 1.3 - 7, y: Math.floor(i / 20) * 2.6 - 11 });
    const index = indexPoints(pts, 3);
    for (const radius of [0.5, 1.4, 3, 7.5]) {
      for (const probe of [pts[0], pts[123], pts[399], { x: 0, y: 0 }, { x: -50, y: 50 }]) {
        const truth = pts
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => Math.hypot(p.x - probe.x, p.y - probe.y) <= radius)
          .map(({ i }) => i)
          .sort((a, b) => a - b);
        const got = new Set(index.near(probe, radius));
        // a superset is correct — the caller still applies the exact test —
        // but a MISSING neighbour is the bug this guards
        for (const i of truth) expect(got.has(i), `radius ${radius} lost point ${i}`).toBe(true);
      }
    }
  });

  it('survives an empty set, a bad cell size and a point with no position', () => {
    expect(indexPoints([], 2).near({ x: 0, y: 0 }, 5)).toEqual([]);
    const pts = [{ x: 1, y: 1 }];
    expect(indexPoints(pts, 0).near({ x: 1, y: 1 }, 1)).toEqual([0]);
    expect(indexPoints(pts, Number.NaN).near({ x: 1, y: 1 }, 1)).toEqual([0]);
    expect(indexPoints([{ x: NaN, y: 0 }], 2).near({ x: 0, y: 0 }, 5)).toEqual([]);
    expect(indexPoints(pts, 2).near({ x: NaN, y: 0 }, 5)).toEqual([]);
  });
});
