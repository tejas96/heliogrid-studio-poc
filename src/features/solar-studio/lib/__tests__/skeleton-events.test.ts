import { describe, expect, it } from 'vitest';
import type { XY } from '../../types';
import {
  concurrencyEvent,
  edgeLines,
  initialEvents,
  inwardNormalOf,
  pointInRing,
  reflexVertices,
} from '../skeleton-events';

const SQUARE: XY[] = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
];

// 12×6 bottom arm, 6×12 left arm — one reflex corner at (6,6)
const L: XY[] = [
  { x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 6 },
  { x: 6, y: 6 }, { x: 6, y: 12 }, { x: 0, y: 12 },
];

describe('inward normals of a CCW ring point INTO the polygon', () => {
  it('the bottom edge of a square pushes upward', () => {
    const n = inwardNormalOf(SQUARE[0], SQUARE[1]);
    expect(n.x).toBeCloseTo(0, 12); // may be -0; direction is what matters
    expect(n.y).toBeCloseTo(1, 12);
  });

  it('the right edge pushes left', () => {
    const n = inwardNormalOf(SQUARE[1], SQUARE[2]);
    expect(n.x).toBeCloseTo(-1, 12);
    expect(n.y).toBeCloseTo(0, 12);
  });

  it('a zero-length edge degrades to a zero normal rather than NaN', () => {
    expect(inwardNormalOf({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual({ x: 0, y: 0 });
  });
});

describe('concurrencyEvent — one solver, hand-checked', () => {
  it('a square’s corner collapses at the centre, at half its width', () => {
    const e = edgeLines(SQUARE);
    const ev = concurrencyEvent(e[0], e[1], e[2])!;
    expect(ev.t).toBeCloseTo(5, 9);
    expect(ev.p.x).toBeCloseTo(5, 9);
    expect(ev.p.y).toBeCloseTo(5, 9);
  });

  it('returns null for PARALLEL walls instead of exploding', () => {
    // THE case the old velocity-based solver diverged on: two opposite walls
    // of the L share a normal, so no unique meeting point exists.
    const e = edgeLines(L);
    expect(concurrencyEvent(e[1], e[2], e[3])).toBeNull();
  });

  it('is symmetric in its inputs — the same three walls meet at one place', () => {
    const e = edgeLines(SQUARE);
    const a = concurrencyEvent(e[0], e[1], e[2])!;
    const b = concurrencyEvent(e[2], e[1], e[0])!;
    expect(b.t).toBeCloseTo(a.t, 9);
    expect(b.p.x).toBeCloseTo(a.p.x, 9);
  });

  it('a 12×6 rectangle meets at half its SHORT side', () => {
    const rect: XY[] = [
      { x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 6 }, { x: 0, y: 6 },
    ];
    const e = edgeLines(rect);
    const ev = concurrencyEvent(e[0], e[1], e[2])!;
    expect(ev.t).toBeCloseTo(3, 9); // ridge height driven by the 6 m span
  });
});

describe('reflexVertices', () => {
  it('finds none on a convex footprint', () => {
    expect(reflexVertices(SQUARE)).toEqual([]);
  });

  it('finds the single inside corner of an L', () => {
    expect(reflexVertices(L)).toEqual([3]); // the (6,6) corner
  });
});

describe('pointInRing', () => {
  it('accepts a point in each arm of the L and rejects the notch', () => {
    expect(pointInRing({ x: 2, y: 2 }, L)).toBe(true);
    expect(pointInRing({ x: 10, y: 2 }, L)).toBe(true);
    expect(pointInRing({ x: 2, y: 10 }, L)).toBe(true);
    expect(pointInRing({ x: 10, y: 10 }, L)).toBe(false); // the bite-out
  });
});

describe('initialEvents on an L — the split the old engine could not see', () => {
  const events = initialEvents(L);

  it('produces a split event', () => {
    expect(events.some((e) => e.kind === 'split')).toBe(true);
  });

  it('splits at the valley point, at half the arm width', () => {
    // hand-computed: the reflex vertex tracks (6−t, 6−t) and meets the
    // bottom/left walls (y=t, x=t) at t=3 ⇒ (3,3)
    const split = events.find((e) => e.kind === 'split')!;
    expect(split.t).toBeCloseTo(3, 9);
    expect(split.p.x).toBeCloseTo(3, 9);
    expect(split.p.y).toBeCloseTo(3, 9);
  });

  it('every event lands inside the footprint', () => {
    for (const e of events) expect(pointInRing(e.p, L)).toBe(true);
  });

  it('events come out in time order', () => {
    const ts = events.map((e) => e.t);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });

  it('a convex footprint yields edge events only — nothing to split', () => {
    const ev = initialEvents(SQUARE);
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every((e) => e.kind === 'edge')).toBe(true);
  });
});
