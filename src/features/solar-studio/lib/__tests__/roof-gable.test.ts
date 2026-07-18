// ─── Gable roof factory + downstream pipeline (Phase 21) ────────────────────
// Proves the two-adjacent-Roof gable model is geometrically correct AND flows
// cleanly through the existing per-roof engines (eave grouping, layout, scene
// solid, shading).
import { describe, expect, it } from 'vitest';
import { gableFaces } from '../roof-gable';
import { surfaceHeightAt, computeEaveRefs, isSloped } from '../roof-plane';
import { polygonArea } from '../geo';
import { autoFillRoof, DEFAULT_FILL } from '../layout';
import { buildShadowCasters, disposeGroup } from '../scene-model';
import { computeSolarAccess } from '../shading';
import { fixtureProject } from './fixtures/project';
import type { Project, XY } from '../../types';

// 12 m (E-W) × 8 m (N-S) footprint
const RECT: XY[] = [
  { x: -6, y: -4 },
  { x: 6, y: -4 },
  { x: 6, y: 4 },
  { x: -6, y: 4 },
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

describe('gableFaces — geometry', () => {
  it('produces two sloped faces that share a LEVEL ridge (they meet)', () => {
    const g = gableFaces({ footprint: RECT, existing: [], pitchDeg: 22, eaveHeightM: 3 });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    const [a, b] = g.faces;
    expect(isSloped(a) && isSloped(b)).toBe(true);
    const refs = computeEaveRefs(g.faces);
    // sample several points ALONG the shared ridge line; both faces agree
    for (const p of [{ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }]) {
      const ha = surfaceHeightAt(a, p, refs.get(a.id));
      const hb = surfaceHeightAt(b, p, refs.get(b.id));
      expect(ha).toBeCloseTo(hb, 2);
      expect(ha).toBeGreaterThan(3); // above the eave wall
    }
    // eave stays at the wall height on the outer edges
    expect(surfaceHeightAt(a, { x: 0, y: -4 }, refs.get(a.id))).toBeCloseTo(3, 1);
  });

  it('the two faces slope in OPPOSITE directions (~180° apart)', () => {
    const g = gableFaces({ footprint: RECT, existing: [] });
    if (!g.ok) throw new Error('gable failed');
    const diff = Math.abs(g.faces[0].slopeAzimuthDeg - g.faces[1].slopeAzimuthDeg);
    expect(Math.min(diff, 360 - diff)).toBeCloseTo(180, 0);
  });

  it('conserves area — the two halves sum to the footprint', () => {
    const g = gableFaces({ footprint: RECT, existing: [] });
    if (!g.ok) throw new Error('gable failed');
    const sum = polygonArea(g.faces[0].polygon) + polygonArea(g.faces[1].polygon);
    expect(sum).toBeCloseTo(polygonArea(RECT), 1);
  });

  it('ridge parallels the LONG wall by default (steeper, sensible gable)', () => {
    // 12×8 rect: dominant edge is the 12 m (E-W) run, so the ridge runs E-W and
    // faces slope N/S — each face is 12 m wide × 4 m deep, not 8×6
    const g = gableFaces({ footprint: RECT, existing: [] });
    if (!g.ok) throw new Error('gable failed');
    // faces slope toward ±N (azimuth near 0 or 180), not ±E/W
    const az = g.faces.map((f) => f.slopeAzimuthDeg).sort((x, y) => x - y);
    expect(Math.min(az[0], 360 - az[0])).toBeLessThan(5); // one face ~0° (north)
    expect(Math.abs(az[1] - 180)).toBeLessThan(5); // other ~180° (south)
  });

  it('respects an explicit ridge angle — across-width slopes the faces E/W', () => {
    // RECT default ridge runs E-W (faces N/S); a +90° ridge runs N-S so the two
    // faces slope E and W instead — the "ridge across width" authoring choice
    const g = gableFaces({ footprint: RECT, existing: [], ridgeAngleDeg: 90 });
    if (!g.ok) throw new Error('gable failed');
    const az = g.faces.map((f) => f.slopeAzimuthDeg).sort((x, y) => x - y);
    expect(Math.abs(az[0] - 90)).toBeLessThan(5); // one face ~90° (east)
    expect(Math.abs(az[1] - 270)).toBeLessThan(5); // other ~270° (west)
  });

  it('carries NO parapet on either face (a ridge is not a parapet)', () => {
    const g = gableFaces({ footprint: RECT, existing: [] });
    if (!g.ok) throw new Error('gable failed');
    expect(g.faces.every((f) => !f.parapet.enabled)).toBe(true);
  });

  it('refuses a footprint too small / narrow to split', () => {
    const tiny = [{ x: 0, y: 0 }, { x: 0.3, y: 0 }, { x: 0.3, y: 0.3 }, { x: 0, y: 0.3 }];
    expect(gableFaces({ footprint: tiny, existing: [] }).ok).toBe(false);
    expect(gableFaces({ footprint: [{ x: 0, y: 0 }, { x: 1, y: 1 }], existing: [] }).ok).toBe(false);
    expect(gableFaces({ footprint: RECT, existing: [], pitchDeg: 75 }).ok).toBe(false);
  });
});

describe('gable → the existing per-roof pipeline (nothing special-cased)', () => {
  it('BOTH faces fill with panels, each facing its own azimuth', () => {
    const g = gableFaces({ footprint: RECT, existing: [], pitchDeg: 18 });
    if (!g.ok) throw new Error('gable failed');
    const p = located(g.faces);
    const a = autoFillRoof(p, g.faces[0], p.components.panel!, DEFAULT_FILL);
    const b = autoFillRoof(p, g.faces[1], p.components.panel!, DEFAULT_FILL);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a[0].azimuthDeg).toBe(g.faces[0].slopeAzimuthDeg);
    expect(b[0].azimuthDeg).toBe(g.faces[1].slopeAzimuthDeg);
  });

  it('builds shadow casters and computes access without special handling', () => {
    const g = gableFaces({ footprint: RECT, existing: [], pitchDeg: 18 });
    if (!g.ok) throw new Error('gable failed');
    let p = located(g.faces);
    const panels = g.faces.flatMap((f) => autoFillRoof(p, f, p.components.panel!, DEFAULT_FILL));
    p = { ...p, panels };
    const { group, meshes } = buildShadowCasters(p);
    expect(meshes.length).toBeGreaterThanOrEqual(2); // one solid per face
    disposeGroup(group);
    const access = computeSolarAccess(p);
    expect(access.size).toBe(panels.length);
    for (const v of access.values()) expect(v).toBeGreaterThan(0); // sane, no NaN
  });
});

// ─── S3: a gable must meet its own ridge at ONE height ──────────────────────
// Found by EPC review, confirmed by measurement: the centroid split is the
// mid-span only for a footprint symmetric about the ridge. Everything else
// produced a stepped ridge — unbuildable — and was accepted silently.
describe('gable ridge consistency', () => {
  const peak = (f: import('../../types').Roof) =>
    f.polygon.reduce((hi, p) => Math.max(hi, surfaceHeightAt(f, p)), -Infinity);

  it('a symmetric rectangle still builds, both halves meeting at one height', () => {
    const r = gableFaces({
      footprint: [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 10 }, { x: 0, y: 10 }],
      existing: [], pitchDeg: 25, eaveHeightM: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.abs(peak(r.faces[0]) - peak(r.faces[1]))).toBeLessThan(0.05);
  });

  it('refuses a triangle — the halves would step 1.55 m at the ridge', () => {
    const r = gableFaces({
      footprint: [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 8, y: 10 }],
      existing: [], pitchDeg: 25, eaveHeightM: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/ridge|symmetric/i);
  });

  it('refuses a traced trapezoid — the common hand-drawn case', () => {
    const r = gableFaces({
      footprint: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 18, y: 9 }, { x: 2, y: 9 }],
      existing: [], pitchDeg: 25, eaveHeightM: 3,
    });
    expect(r.ok).toBe(false);
  });

  it('the refusal names the alternative that does work', () => {
    const r = gableFaces({
      footprint: [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 8, y: 10 }],
      existing: [], pitchDeg: 25, eaveHeightM: 3,
    });
    if (r.ok) return;
    expect(r.reason).toMatch(/Hip/);
  });
});
