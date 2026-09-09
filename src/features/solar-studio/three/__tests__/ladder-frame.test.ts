// ─── The drawn ladder must fill the box the surveyor drew ───────────────────
// A ladder used to render as one flat grey box (gap report item 15). It is now
// built from its own parts — but the parts are derived from the SAME numbers
// the shading engine reads, so the picture and the model cannot drift. That is
// the claim worth pinning: `lib/scene-model.ts` approximates the obstruction by
// its full-height bounding solid, so if the drawn ladder were shorter, longer
// or narrower than lengthM × widthM × heightM, the render would disagree with
// the kWh.
import { describe, expect, it } from 'vitest';
import { ladderFrame } from '../ObstructionMesh';
import type { Obstruction } from '../../types';

/** only the fields ladderFrame reads — the rest of Obstruction is irrelevant */
const ladder = (o: Partial<Obstruction>) =>
  ({ shape: 'rect', lengthM: 1.6, widthM: 0.5, diameterM: 0.5, heightM: 4, ...o }) as Obstruction;

describe('ladderFrame', () => {
  it('spans exactly the surveyed box', () => {
    const f = ladderFrame(ladder({ lengthM: 1.6, widthM: 0.5, heightM: 4 }));
    expect(f.run).toBe(1.6); // foot to wall
    expect(f.spacing).toBe(0.5); // rail to rail
    expect(f.rise).toBe(4); // the climb
  });

  it('derives the lean from the box rather than assuming one', () => {
    // a 4 m climb reaching 1.6 m out is ~21.8° off vertical — a real ladder angle
    const f = ladderFrame(ladder({ lengthM: 1.6, heightM: 4 }));
    expect((f.lean * 180) / Math.PI).toBeCloseTo(21.8, 1);
    // and the rail is the hypotenuse of exactly that triangle
    expect(f.railLen).toBeCloseTo(Math.hypot(1.6, 4), 6);
  });

  it('stands a short ladder steeper than a tall one at the same reach', () => {
    const shortLadder = ladderFrame(ladder({ lengthM: 1, heightM: 2.4 }));
    const tallLadder = ladderFrame(ladder({ lengthM: 1, heightM: 6 }));
    expect(tallLadder.lean).toBeLessThan(shortLadder.lean);
  });

  it('adds rungs as the ladder grows, at a climbable pitch', () => {
    const f = ladderFrame(ladder({ lengthM: 1.6, heightM: 4 }));
    expect(f.rungs).toBe(14);
    // every rung within 300 mm of the next, which is what makes it a ladder
    expect(f.railLen / f.rungs).toBeLessThanOrEqual(0.31);
    expect(ladderFrame(ladder({ heightM: 8 })).rungs).toBeGreaterThan(f.rungs);
  });

  it('never collapses to nothing on a degenerate box', () => {
    // a hand-drawn obstruction can be a sliver; it still has to render as a
    // ladder rather than as a zero-size mesh or a NaN
    const f = ladderFrame(ladder({ lengthM: 0, widthM: 0, heightM: 0 }));
    expect(f.run).toBeGreaterThan(0);
    expect(f.spacing).toBeGreaterThan(0);
    expect(f.rise).toBeGreaterThan(0);
    expect(f.rungs).toBeGreaterThanOrEqual(2);
    expect(Number.isFinite(f.lean)).toBe(true);
  });

  it('reads a circular obstruction as a square footprint', () => {
    const f = ladderFrame(ladder({ shape: 'circle', diameterM: 0.9 }));
    expect(f.run).toBe(0.9);
    expect(f.spacing).toBe(0.9);
  });
});
