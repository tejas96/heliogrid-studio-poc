// ─── Adversarial footprints for the pitched-roof engine ─────────────────────
// Every shape here is one that breaks naive geometry code. The contract is NOT
// "must succeed" — it is "must never produce a wrong roof". So each case must
// either tile the footprint essentially exactly, or be REFUSED with a reason.
// Silently returning faces that do not tile is the one unacceptable outcome,
// because those faces flow straight into capacity, energy and the customer's
// quote.
import { describe, expect, it } from 'vitest';
import type { XY } from '../../types';
import { skeletonFaces } from '../roof-skeleton';
import { polygonArea } from '../geo';

/** Either it tiles to <1%, or it refused. Nothing in between ships. */
function assertSafe(name: string, footprint: XY[]) {
  const r = skeletonFaces({ footprint, existing: [], pitchDeg: 20 });
  if (!r.ok) {
    expect(r.reason.length, `${name}: refusal must explain itself`).toBeGreaterThan(10);
    return { built: false as const };
  }
  const want = Math.abs(polygonArea(footprint));
  const sum = r.faces.reduce((s, f) => s + Math.abs(polygonArea(f.polygon)), 0);
  const err = Math.abs(sum - want) / want;
  expect(err, `${name}: BUILT but faces do not tile (${(err * 100).toFixed(2)}%)`).toBeLessThan(0.01);
  return { built: true as const, faces: r.faces };
}

describe('edge cases: degenerate and hostile footprints', () => {
  it('a triangle (minimum viable roof)', () => {
    assertSafe('triangle', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }]);
  });

  it('a very thin slab — near-collinear walls', () => {
    assertSafe('sliver', [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 0.8 }, { x: 0, y: 0.8 }]);
  });

  it('a long thin L — arms of wildly different width', () => {
    assertSafe('thin L', [
      { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 3 },
      { x: 3, y: 3 }, { x: 3, y: 25 }, { x: 0, y: 25 },
    ]);
  });

  it('an almost-square rectangle (near-simultaneous events)', () => {
    assertSafe('near-square', [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 9.98 }, { x: 0, y: 9.98 },
    ]);
  });

  it('a footprint with a nearly-straight vertex (0.5° bend)', () => {
    const eps = Math.tan((0.5 * Math.PI) / 180) * 10;
    assertSafe('near-collinear vertex', [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: eps }, { x: 20, y: 12 }, { x: 0, y: 12 },
    ]);
  });

  it('a regular octagon (many simultaneous events)', () => {
    const oct: XY[] = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return { x: Math.cos(a) * 10, y: Math.sin(a) * 10 };
    });
    assertSafe('octagon', oct);
  });

  it('a CLOCKWISE ring is normalised, not mangled', () => {
    const cw: XY[] = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 0 }];
    const r = assertSafe('clockwise', cw);
    if (r.built) expect(r.faces.length).toBeGreaterThanOrEqual(3);
  });

  it('a T-shape (two reflex corners feeding one valley)', () => {
    assertSafe('T', [
      { x: 0, y: 0 }, { x: 18, y: 0 }, { x: 18, y: 6 }, { x: 12, y: 6 },
      { x: 12, y: 12 }, { x: 6, y: 12 }, { x: 6, y: 6 }, { x: 0, y: 6 },
    ]);
  });

  it('a plus/cross footprint (four reflex corners)', () => {
    assertSafe('plus', [
      { x: 6, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 6 }, { x: 18, y: 6 },
      { x: 18, y: 12 }, { x: 12, y: 12 }, { x: 12, y: 18 }, { x: 6, y: 18 },
      { x: 6, y: 12 }, { x: 0, y: 12 }, { x: 0, y: 6 }, { x: 6, y: 6 },
    ]);
  });

  it('a deep narrow notch (split lands close to the far wall)', () => {
    assertSafe('deep notch', [
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 12 }, { x: 11, y: 12 },
      { x: 11, y: 2 }, { x: 9, y: 2 }, { x: 9, y: 12 }, { x: 0, y: 12 },
    ]);
  });
});

describe('edge cases: inputs that must be refused, never guessed', () => {
  it('fewer than three corners', () => {
    expect(skeletonFaces({ footprint: [{ x: 0, y: 0 }, { x: 1, y: 1 }], existing: [] }).ok).toBe(false);
  });

  it('a zero-area (fully collinear) ring', () => {
    const r = skeletonFaces({
      footprint: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }],
      existing: [],
    });
    expect(r.ok).toBe(false);
  });

  it('a pitch outside the buildable range', () => {
    const sq: XY[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(skeletonFaces({ footprint: sq, existing: [], pitchDeg: 0.5 }).ok).toBe(false);
    expect(skeletonFaces({ footprint: sq, existing: [], pitchDeg: 75 }).ok).toBe(false);
  });

  it('a footprint too small to carry a roof at all', () => {
    expect(
      skeletonFaces({
        footprint: [{ x: 0, y: 0 }, { x: 0.4, y: 0 }, { x: 0.4, y: 0.4 }, { x: 0, y: 0.4 }],
        existing: [],
      }).ok,
    ).toBe(false);
  });
});

describe('edge cases: every built face must be usable downstream', () => {
  // A face that tiles but carries NaN, a bad azimuth or a degenerate ring would
  // poison layout, shading and the BOM further down the pipeline.
  const shapes: [string, XY[]][] = [
    ['square', [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 12 }, { x: 0, y: 12 }]],
    ['rect', [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 8 }, { x: 0, y: 8 }]],
    ['symmetric L', [
      { x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 6 },
      { x: 6, y: 6 }, { x: 6, y: 12 }, { x: 0, y: 12 },
    ]],
  ];

  for (const [name, poly] of shapes) {
    it(`${name}: finite coords, sane azimuth, real area, valid ring`, () => {
      const r = skeletonFaces({ footprint: poly, existing: [], pitchDeg: 22 });
      expect(r.ok, name).toBe(true);
      if (!r.ok) return;
      for (const f of r.faces) {
        expect(f.polygon.length).toBeGreaterThanOrEqual(3);
        for (const p of f.polygon) {
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
        }
        expect(Math.abs(polygonArea(f.polygon))).toBeGreaterThan(0.1);
        expect(f.slopeAzimuthDeg).toBeGreaterThanOrEqual(0);
        expect(f.slopeAzimuthDeg).toBeLessThan(360);
        expect(f.pitchDeg).toBe(22);
        // a pitched face must not carry a parapet — that is a flat-roof feature
        expect(f.parapet.enabled).toBe(false);
      }
    });
  }

  it('faces get distinct names so the UI and BOM can tell them apart', () => {
    const r = skeletonFaces({
      footprint: [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 8 }, { x: 0, y: 8 }],
      existing: [],
      namePrefix: 'Roof 1',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new Set(r.faces.map((f) => f.name)).size).toBe(r.faces.length);
  });
});
