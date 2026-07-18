import { describe, expect, it } from 'vitest';
import { insetPolygonRobust, polygonArea, validateRoofPolygon } from '../geo';
import type { XY } from '../../types';

/**
 * Fuzz guard for the "no usable area after the 0.3 m edge setback" bug:
 * a hand-traced roof (many vertices, float coords, near-collinear runs) must
 * NEVER yield an empty inset when its outline is large and passes validation.
 * The clipper (polygon-clipping) can throw on nearly-degenerate intersections;
 * a silent catch used to convert that into "no usable area" and block the user.
 */

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Star polygon (simple by construction) with jittered radii/angles. */
function tracedRoof(rand: () => number): XY[] {
  const n = 8 + Math.floor(rand() * 20); // 8..27 vertices, like a hand trace
  const cx = (rand() - 0.5) * 40;
  const cy = (rand() - 0.5) * 40;
  const base = 5 + rand() * 12; // 5..17 m radius
  const pts: XY[] = [];
  let ang = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    ang += ((Math.PI * 2) / n) * (0.4 + rand() * 1.2);
    const r = base * (0.55 + rand() * 0.9);
    // full float precision, exactly like screen→meter conversion produces
    pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
  }
  return pts;
}

/** Rectangle whose edges are chopped into near-collinear stair-step runs. */
function stairStepRoof(rand: () => number): XY[] {
  const w = 10 + rand() * 10;
  const h = 8 + rand() * 10;
  const pts: XY[] = [];
  const chop = (a: XY, b: XY) => {
    const steps = 1 + Math.floor(rand() * 5);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      // tiny lateral jitter → nearly-collinear vertices, a clipper stressor
      const jx = (rand() - 0.5) * 0.02;
      const jy = (rand() - 0.5) * 0.02;
      pts.push({ x: a.x + (b.x - a.x) * t + jx, y: a.y + (b.y - a.y) * t + jy });
    }
  };
  const c: XY[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  for (let i = 0; i < 4; i++) chop(c[i], c[(i + 1) % 4]);
  return pts;
}

describe('insetPolygonRobust never blocks a valid large roof', () => {
  // deterministic (seeded) but heavy: 3000 boolean-clipper runs need ~5-8s
  // when vitest workers share cores — the 5s default was the '1-in-5 flake'
  it('fuzz: 3000 hand-trace-like polygons all keep usable area at 0.3 m setback', { timeout: 30_000 }, () => {
    const rand = mulberry32(0xc0ffee);
    let tested = 0;
    for (let i = 0; i < 3000; i++) {
      const poly = i % 2 === 0 ? tracedRoof(rand) : stairStepRoof(rand);
      // only shapes the editor itself would accept
      if (!validateRoofPolygon(poly).valid) continue;
      if (polygonArea(poly) < 30) continue; // clearly viable roof
      tested++;
      const regions = insetPolygonRobust(
        poly,
        poly.map(() => 0.3),
      );
      if (regions.length === 0) {
        throw new Error(
          `empty inset for valid roof (iteration ${i}, area ${polygonArea(poly).toFixed(1)} m²): ` +
            JSON.stringify(poly),
        );
      }
    }
    // the generators must actually exercise the clipper
    expect(tested).toBeGreaterThan(1500);
  });
});
