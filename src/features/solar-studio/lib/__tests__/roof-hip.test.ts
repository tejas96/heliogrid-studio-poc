// ─── Hip roof factory + downstream pipeline (Phase 21b) ─────────────────────
// Proves the four-adjacent-Roof hip model is geometrically correct (four faces
// meet at ONE level ridge) AND flows through the existing per-roof engines with
// no special-casing — exactly like the gable (roof-gable.test.ts).
import { describe, expect, it } from 'vitest';
import { hipFaces } from '../roof-hip';
import { surfaceHeightAt, computeEaveRefs, isSloped } from '../roof-plane';
import { polygonArea } from '../geo';
import { autoFillRoof, DEFAULT_FILL } from '../layout';
import { buildShadowCasters, disposeGroup } from '../scene-model';
import { computeSolarAccess } from '../shading';
import { fixtureProject } from './fixtures/project';
import type { Project, Roof, XY } from '../../types';

// 12 m (E-W, long) × 8 m (N-S, short) footprint
const RECT: XY[] = [
  { x: -6, y: -4 },
  { x: 6, y: -4 },
  { x: 6, y: 4 },
  { x: -6, y: 4 },
];
// 10 m square → pyramidal hip (ridge collapses to an apex)
const SQUARE: XY[] = [
  { x: -5, y: -5 },
  { x: 5, y: -5 },
  { x: 5, y: 5 },
  { x: -5, y: 5 },
];

function located(roofs: Project['roofs']): Project {
  return {
    ...fixtureProject(0),
    roofs,
    location: {
      address: 'Pune', latLng: { lat: 18.52, lng: 73.86 }, confirmed: true,
      irradiance: 5.4, peakSunHours: 5.4, dataSource: 'estimate',
    },
  };
}

const azGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};
// a ridge is an undirected LINE, so 180° ≡ 0°
const lineGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
};

describe('hipFaces — geometry', () => {
  it('produces four sloped faces meeting at ONE level ridge', () => {
    const g = hipFaces({ footprint: RECT, existing: [], pitchDeg: 22, eaveHeightM: 3 });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.faces.every(isSloped)).toBe(true);
    const refs = computeEaveRefs(g.faces);
    const h = (f: Roof, p: XY) => surfaceHeightAt(f, p, refs.get(f.id));
    const [A, B, C, D] = g.faces; // A:+v(N)  B:−v(S)  C:+u(E)  D:−u(W)
    const ridge = 3 + Math.tan((22 * Math.PI) / 180) * 4; // eave + grad·(short half)

    // interior of the ridge (u∈[−2,2], v=0): the two long faces agree
    for (const x of [-1, 0, 1]) {
      const ha = h(A, { x, y: 0 });
      const hb = h(B, { x, y: 0 });
      expect(ha).toBeCloseTo(hb, 2);
      expect(ha).toBeCloseTo(ridge, 2);
      expect(ha).toBeGreaterThan(3);
    }
    // ridge ENDS (±2,0): a long face and its neighbouring hip triangle agree
    expect(h(A, { x: 2, y: 0 })).toBeCloseTo(h(C, { x: 2, y: 0 }), 2);
    expect(h(B, { x: -2, y: 0 })).toBeCloseTo(h(D, { x: -2, y: 0 }), 2);
    // eaves stay at the wall height on the outer corners
    expect(h(A, { x: 0, y: 4 })).toBeCloseTo(3, 1); // +v eave wall
    expect(h(C, { x: 6, y: 0 })).toBeCloseTo(3, 1); // +u eave wall
  });

  it('opposite faces slope ~180° apart; long vs short faces ~90° apart', () => {
    const g = hipFaces({ footprint: RECT, existing: [] });
    if (!g.ok) throw new Error('hip failed');
    const [A, B, C, D] = g.faces.map((f) => f.slopeAzimuthDeg);
    expect(azGap(A, B)).toBeCloseTo(180, 0); // the two long (trapezoid) faces
    expect(azGap(C, D)).toBeCloseTo(180, 0); // the two short (triangle) faces
    expect(azGap(A, C)).toBeCloseTo(90, 0); // long ⟂ short
  });

  it('conserves area — the four faces sum to the footprint', () => {
    const g = hipFaces({ footprint: RECT, existing: [] });
    if (!g.ok) throw new Error('hip failed');
    const sum = g.faces.reduce((s, f) => s + polygonArea(f.polygon), 0);
    expect(sum).toBeCloseTo(polygonArea(RECT), 1);
  });

  it('ridge parallels the LONG wall; two faces are trapezoids, two triangles', () => {
    const g = hipFaces({ footprint: RECT, existing: [] });
    if (!g.ok) throw new Error('hip failed');
    // ridge runs E-W (dominant edge of a 12×8 rect is the 12 m E-W run)
    expect(azGap(g.ridgeAngleDeg, 0)).toBeLessThan(1);
    const corners = g.faces.map((f) => f.polygon.length).sort();
    expect(corners).toEqual([3, 3, 4, 4]); // 2 hips (triangles) + 2 trapezoids
  });

  it('a SQUARE footprint gives a pyramid — four triangles to one apex', () => {
    const g = hipFaces({ footprint: SQUARE, existing: [], pitchDeg: 20, eaveHeightM: 3 });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.faces.every((f) => f.polygon.length === 3)).toBe(true); // all triangles
    const refs = computeEaveRefs(g.faces);
    const apexH = 3 + Math.tan((20 * Math.PI) / 180) * 5;
    for (const f of g.faces) {
      // every face reaches the same apex height at the centre
      expect(surfaceHeightAt(f, { x: 0, y: 0 }, refs.get(f.id))).toBeCloseTo(apexH, 2);
    }
  });

  it('auto-orients to the long axis — a short-axis ridge request still hips', () => {
    // RECT long axis is E-W (0°); asking for a 90° (short-axis) ridge is
    // geometrically impossible for a hip, so the factory swings to the long axis
    const g = hipFaces({ footprint: RECT, existing: [], ridgeAngleDeg: 90 });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(lineGap(g.ridgeAngleDeg, 0)).toBeLessThan(1); // ridge ended up E-W anyway
    const corners = g.faces.map((f) => f.polygon.length).sort();
    expect(corners).toEqual([3, 3, 4, 4]);
  });

  it('carries NO parapet on any face', () => {
    const g = hipFaces({ footprint: RECT, existing: [] });
    if (!g.ok) throw new Error('hip failed');
    expect(g.faces.every((f) => !f.parapet.enabled)).toBe(true);
  });

  it('refuses non-rectangular, tiny, narrow and steep footprints', () => {
    // L-shape — fills far less than its bounding box
    const lshape = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 },
      { x: 3, y: 3 }, { x: 3, y: 10 }, { x: 0, y: 10 },
    ];
    expect(hipFaces({ footprint: lshape, existing: [] }).ok).toBe(false);
    const tiny = [{ x: 0, y: 0 }, { x: 0.4, y: 0 }, { x: 0.4, y: 0.4 }, { x: 0, y: 0.4 }];
    expect(hipFaces({ footprint: tiny, existing: [] }).ok).toBe(false);
    const narrow = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 0.5 }, { x: 0, y: 0.5 }];
    expect(hipFaces({ footprint: narrow, existing: [] }).ok).toBe(false);
    expect(hipFaces({ footprint: RECT, existing: [], pitchDeg: 75 }).ok).toBe(false);
  });
});

describe('hip → the existing per-roof pipeline (nothing special-cased)', () => {
  const BIG: XY[] = [
    { x: -10, y: -7 },
    { x: 10, y: -7 },
    { x: 10, y: 7 },
    { x: -10, y: 7 },
  ];

  it('ALL four faces fill with panels, each facing its own azimuth', () => {
    const g = hipFaces({ footprint: BIG, existing: [], pitchDeg: 18 });
    if (!g.ok) throw new Error('hip failed');
    const p = located(g.faces);
    for (const f of g.faces) {
      const panels = autoFillRoof(p, f, p.components.panel!, DEFAULT_FILL);
      expect(panels.length).toBeGreaterThan(0);
      expect(panels[0].azimuthDeg).toBe(f.slopeAzimuthDeg);
    }
  });

  it('builds shadow casters and computes access without special handling', () => {
    const g = hipFaces({ footprint: BIG, existing: [], pitchDeg: 18 });
    if (!g.ok) throw new Error('hip failed');
    let p = located(g.faces);
    const panels = g.faces.flatMap((f) => autoFillRoof(p, f, p.components.panel!, DEFAULT_FILL));
    p = { ...p, panels };
    const { group, meshes } = buildShadowCasters(p);
    expect(meshes.length).toBeGreaterThanOrEqual(4); // one solid per face
    disposeGroup(group);
    const access = computeSolarAccess(p);
    expect(access.size).toBe(panels.length);
    for (const val of access.values()) expect(val).toBeGreaterThan(0); // sane, no NaN
  });
});
