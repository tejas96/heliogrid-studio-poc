// ─── A roof solid must not be inside-out ─────────────────────────────────────
// `buildRoofSolidGeometry` wound its top cap with a hard-coded vertex order and
// a comment asserting it was "up-facing". It was not: triangulateShape keeps
// whatever winding the contour carries, a hand-traced polygon can be wound
// either way, and the vertices are mirrored (EN y → three −z) on the way in.
//
// Measured on the seeded project before the fix, all 69 vertices with
// normal.y > 0.8 sat at y = 0 and all 69 with normal.y < −0.8 sat at the roof
// height. DoubleSide lighting hid it; `roofPhotoMaterial`'s `vUpness =
// normal.y` did not, and its deck branch had never once run.
import { describe, expect, it } from 'vitest';
import { buildRoofSolidGeometry } from '../scene-model';
import type { Roof } from '../../types';

const square = (pts: Array<[number, number]>): Roof =>
  ({
    id: 'r1',
    name: 'Roof 1',
    polygon: pts.map(([x, y]) => ({ x, y })),
    heightM: 4,
    pitchDeg: 0,
    slopeAzimuthDeg: 180,
    roofType: 'rcc_flat',
  }) as unknown as Roof;

const CCW: Array<[number, number]> = [
  [0, 0],
  [10, 0],
  [10, 8],
  [0, 8],
];
const CW = [...CCW].reverse() as Array<[number, number]>;

/** Mean normal.y of the vertices sitting at (or near) a given height. */
function capNormalYAt(roof: Roof, height: number) {
  const g = buildRoofSolidGeometry(roof);
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const ys: number[] = [];
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getY(i) - height) < 0.01 && Math.abs(n.getY(i)) > 0.8) ys.push(n.getY(i));
  }
  return { count: ys.length, mean: ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : 0 };
}

describe('buildRoofSolidGeometry winding', () => {
  for (const [name, pts] of [
    ['traced anticlockwise', CCW],
    ['traced clockwise', CW],
  ] as const) {
    it(`points the deck at the sky when the roof is ${name}`, () => {
      const roof = square(pts as Array<[number, number]>);
      const deck = capNormalYAt(roof, 4);
      expect(deck.count, 'the top cap should have up-facing vertices').toBeGreaterThan(0);
      expect(deck.mean).toBeGreaterThan(0.9);
    });

    it(`points the underside at the ground when the roof is ${name}`, () => {
      const roof = square(pts as Array<[number, number]>);
      const base = capNormalYAt(roof, 0);
      expect(base.count).toBeGreaterThan(0);
      expect(base.mean).toBeLessThan(-0.9);
    });
  }

  it('keeps every triangle non-degenerate, so normals stay normalised', () => {
    const g = buildRoofSolidGeometry(square(CCW));
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) {
      const len = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
      expect(len).toBeCloseTo(1, 3);
    }
  });

  it('still emits the top face alone for a plot lying on the ground', () => {
    // the ground-mount case the builder guards: no walls, no bottom cap
    const flat = { ...square(CCW), heightM: 0 } as Roof;
    const g = buildRoofSolidGeometry(flat);
    const n = g.getAttribute('normal');
    let up = 0;
    for (let i = 0; i < n.count; i++) if (n.getY(i) > 0.8) up++;
    expect(up).toBe(n.count);
  });
});
