import { describe, expect, it } from 'vitest';
import type { XY } from '../../types';
import { sweepFaces } from '../skeleton-wavefront';
import { polygonArea } from '../geo';

const SQUARE: XY[] = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
];
const RECT: XY[] = [
  { x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 6 }, { x: 0, y: 6 },
];
// one reflex corner at (6,6): 12×6 bottom arm + 6×12 left arm, area 108
const L: XY[] = [
  { x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 6 },
  { x: 6, y: 6 }, { x: 6, y: 12 }, { x: 0, y: 12 },
];
// T-shape: 18×6 bar with a 6×6 stem, area 108+36 = 144
const T: XY[] = [
  { x: 0, y: 0 }, { x: 18, y: 0 }, { x: 18, y: 6 }, { x: 12, y: 6 },
  { x: 12, y: 12 }, { x: 6, y: 12 }, { x: 6, y: 6 }, { x: 0, y: 6 },
];
// U-shape: 18×12 block less a 6×6 notch in the top edge, area 180
const U: XY[] = [
  { x: 0, y: 0 }, { x: 18, y: 0 }, { x: 18, y: 12 }, { x: 12, y: 12 },
  { x: 12, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 12 }, { x: 0, y: 12 },
];
// hand-traced from the browser: one reflex corner, widely asymmetric arms
const TRACED_L: XY[] = [
  { x: -17.4, y: -22.5 }, { x: -7.9, y: -22.5 }, { x: -7.9, y: -16.9 },
  { x: 1.6, y: -16.9 }, { x: 1.6, y: -10.6 }, { x: -17.4, y: -10.6 },
];

/** THE gate: the faces must cover the footprint and nothing else. */
function tilingError(poly: XY[]): number {
  const r = sweepFaces(poly);
  if (!r.ok) return Number.POSITIVE_INFINITY;
  const sum = r.faces.reduce((s, f) => s + Math.abs(polygonArea(f.polygon)), 0);
  const want = Math.abs(polygonArea(poly));
  return Math.abs(sum - want) / want;
}

describe('sweepFaces on convex footprints (must match the proven behaviour)', () => {
  it('a square tiles exactly', () => {
    expect(tilingError(SQUARE)).toBeLessThan(0.03);
  });

  it('a square yields one face per wall', () => {
    const r = sweepFaces(SQUARE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new Set(r.faces.map((f) => f.orig)).size).toBe(4);
  });

  it('a 12×6 rectangle tiles exactly', () => {
    expect(tilingError(RECT)).toBeLessThan(0.03);
  });

  it('produces no NaN coordinates', () => {
    const r = sweepFaces(RECT);
    if (!r.ok) return;
    for (const f of r.faces)
      for (const p of f.polygon) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
  });
});

describe('sweepFaces on REFLEX footprints — the Phase 21c goal', () => {
  it('an L-shape tiles its 108 m² footprint', () => {
    expect(tilingError(L)).toBeLessThan(0.03);
  });

  it('an L-shape covers every wall', () => {
    const r = sweepFaces(L);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new Set(r.faces.map((f) => f.orig)).size).toBe(6);
  });

  // The T used to lose 6.25% (a wall dropped, another double-counted). Fixed
  // by closing surviving rings at the front they actually reached instead of
  // truncating their faces — it now tiles exactly.
  it('a T-shape tiles its 144 m² footprint exactly', () => {
    expect(tilingError(T)).toBeLessThan(0.001);
  });

  // The U used to lose exactly 10% (one 18 m² face). Its two notch walls become
  // anti-parallel and annihilate, so a corner of the notch floor was reported as
  // a "split" of that floor even though the point sat on the floor's ENDPOINT.
  // Cutting a wall at its own endpoint yields an inverted sliver and drops the
  // rest. Split candidates are now required to pierce the wall's live span.
  it('a U-shape tiles its 180 m² footprint exactly', () => {
    expect(tilingError(U)).toBeLessThan(0.001);
  });

  it('a U-shape covers every wall', () => {
    const r = sweepFaces(U);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new Set(r.faces.map((f) => f.orig)).size).toBe(8);
  });

  // REAL hand-traced L from the browser (Step 2, 173 m², arms 11.9 m vs 6.3 m).
  // History: OVER-counted 17.3% when both halves of a split wall inherited the
  // pre-split trace, then UNDER-counted 2.9% when only one half did. Both are
  // the same mistake — the swept region has to be PARTITIONED. It is now cut
  // along the perpendicular from the split point back to the wall, so each half
  // takes its own side. Verified against the hand-computed skeleton: the split
  // wall's face is 52.4875 m², which is what the simulation now returns.
  it('an ASYMMETRIC traced L tiles its 172.9 m² footprint exactly', () => {
    expect(tilingError(TRACED_L)).toBeLessThan(0.001);
  });

  it('the split wall of the traced L keeps its whole face, cut in two', () => {
    const r = sweepFaces(TRACED_L);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const wall4 = r.faces
      .filter((f) => f.orig === 4)
      .reduce((s, f) => s + Math.abs(polygonArea(f.polygon)), 0);
    expect(wall4).toBeCloseTo(52.4875, 3);
  });

  it('every supported shape tiles exactly, not just within tolerance', () => {
    for (const poly of [SQUARE, RECT, L, T, U, TRACED_L])
      expect(tilingError(poly)).toBeLessThan(0.001);
  });

  // The two split-handling fixes are structural, not tuned to the six shapes
  // above, so they must hold on footprints with many more reflex corners.
  it.each([
    ['plus/cross (4 reflex)', [[4, 0], [8, 0], [8, 4], [12, 4], [12, 8], [8, 8],
      [8, 12], [4, 12], [4, 8], [0, 8], [0, 4], [4, 4]]],
    ['Z-shape', [[0, 0], [12, 0], [12, 6], [18, 6], [18, 12], [6, 12], [6, 6], [0, 6]]],
    ['staircase', [[0, 0], [15, 0], [15, 5], [10, 5], [10, 10], [5, 10], [5, 15], [0, 15]]],
    ['E-shape (5 reflex)', [[0, 0], [14, 0], [14, 4], [5, 4], [5, 7], [14, 7],
      [14, 11], [5, 11], [5, 14], [14, 14], [14, 18], [0, 18]]],
    ['deep narrow U', [[0, 0], [12, 0], [12, 20], [8, 20], [8, 4], [4, 4], [4, 20], [0, 20]]],
  ])('tiles a %s exactly', (_name, pts) => {
    const poly: XY[] = (pts as number[][]).map(([x, y]) => ({ x, y }));
    expect(tilingError(poly)).toBeLessThan(0.001);
  });

  it('terminates — no runaway wavefront', () => {
    const started = Date.now();
    sweepFaces(L);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
