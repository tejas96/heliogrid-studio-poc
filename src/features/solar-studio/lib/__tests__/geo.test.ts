import { describe, expect, it } from 'vitest';
import {
  insetPolygonRobust,
  pointInPolygon,
  polygonArea,
  validateRoofPolygon,
  polygonPerimeter,
} from '../geo';
import type { XY } from '../../types';

const rect: XY[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 6 },
  { x: 0, y: 6 },
];

/** Concave L-shape: the case where the old miter inset self-intersected. */
const lShape: XY[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4 },
  { x: 4, y: 4 },
  { x: 4, y: 10 },
  { x: 0, y: 10 },
];

function uniform(poly: XY[], w: number): number[] {
  return poly.map(() => w);
}

describe('insetPolygonRobust', () => {
  it('shrinks a rectangle symmetrically', () => {
    const regions = insetPolygonRobust(rect, uniform(rect, 1));
    expect(regions).toHaveLength(1);
    const area = polygonArea(regions[0]);
    // 10×6 with 1m band → ~8×4 = 32 (vertex disks round corners slightly)
    expect(area).toBeGreaterThan(29);
    expect(area).toBeLessThan(33);
  });

  it('keeps every inset vertex strictly inside the source polygon', () => {
    for (const poly of [rect, lShape]) {
      const regions = insetPolygonRobust(poly, uniform(poly, 0.5));
      expect(regions.length).toBeGreaterThan(0);
      for (const region of regions) {
        for (const p of region) {
          expect(pointInPolygon(p, poly)).toBe(true);
        }
      }
    }
  });

  it('keeps the inset out of the reflex-corner setback band (concave case)', () => {
    const regions = insetPolygonRobust(lShape, uniform(lShape, 1));
    // the point just diagonal to the reflex corner (4,4) lies inside the band
    const inBand = { x: 4.3, y: 4.3 };
    for (const region of regions) {
      expect(pointInPolygon(inBand, region)).toBe(false);
    }
    // total inset area must be well below the outline area minus band lower bound
    const total = regions.reduce((s, r) => s + polygonArea(r), 0);
    expect(total).toBeLessThan(polygonArea(lShape) - 15);
    expect(total).toBeGreaterThan(20);
  });

  it('returns the source polygon for zero inset and [] when consumed', () => {
    expect(insetPolygonRobust(rect, uniform(rect, 0))).toHaveLength(1);
    expect(insetPolygonRobust(rect, uniform(rect, 10))).toHaveLength(0);
  });

  it('handles clockwise input the same as counter-clockwise', () => {
    const cw = [...rect].reverse();
    const a = insetPolygonRobust(rect, uniform(rect, 1));
    const b = insetPolygonRobust(cw, uniform(cw, 1));
    expect(polygonArea(b[0])).toBeCloseTo(polygonArea(a[0]), 1);
  });
});

describe('validateRoofPolygon', () => {
  it('accepts a simple counter-clockwise roof ring', () => {
    expect(validateRoofPolygon(rect)).toEqual({ valid: true });
  });

  it('rejects self-intersecting roof rings before layout or 3D extrusion', () => {
    const bowTie: XY[] = [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 4, y: 0 },
    ];
    expect(validateRoofPolygon(bowTie).valid).toBe(false);
    expect(validateRoofPolygon(bowTie).reason).toMatch(/cross|touch/i);
  });

  it('rejects duplicate or near-zero length edges', () => {
    const duplicate: XY[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ];
    expect(validateRoofPolygon(duplicate).valid).toBe(false);
    expect(validateRoofPolygon(duplicate).reason).toMatch(/edge/i);
  });

  it('rejects tiny roof areas that cannot produce a reliable design', () => {
    const tiny: XY[] = [
      { x: 0, y: 0 },
      { x: 0.3, y: 0 },
      { x: 0.3, y: 0.3 },
      { x: 0, y: 0.3 },
    ];
    expect(validateRoofPolygon(tiny).valid).toBe(false);
    expect(validateRoofPolygon(tiny).reason).toMatch(/area/i);
  });
});

describe('polygonPerimeter', () => {
  it('measures a closed rectangle including the closing edge', () => {
    const r = [
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 },
    ];
    expect(polygonPerimeter(r)).toBeCloseTo(14, 9); // 2×(4+3)
  });

  it('is zero for a degenerate ring', () => {
    expect(polygonPerimeter([])).toBe(0);
    expect(polygonPerimeter([{ x: 1, y: 1 }])).toBe(0);
  });

  it('is orientation-independent', () => {
    const cw = [{ x: 0, y: 0 }, { x: 0, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 0 }];
    expect(polygonPerimeter(cw)).toBeCloseTo(14, 9);
  });
});
