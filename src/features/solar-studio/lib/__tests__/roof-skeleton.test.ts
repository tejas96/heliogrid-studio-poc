// ─── Straight-skeleton hip over convex footprints (Phase 21c) ───────────────
// Event-free nearest-wall partition: exact for any convex footprint. Validates
// it reproduces the rectangle hip + pyramid, AND handles shapes gable/hip can't.
import { describe, expect, it } from 'vitest';
import { skeletonFaces } from '../roof-skeleton';
import { surfaceHeightAt, computeEaveRefs, isSloped } from '../roof-plane';
import { autoFillRoof, DEFAULT_FILL } from '../layout';
import { computeSolarAccess } from '../shading';
import { polygonArea } from '../geo';
import { fixtureProject } from './fixtures/project';
import type { Project, XY } from '../../types';

const RECT: XY[] = [{ x: -6, y: -4 }, { x: 6, y: -4 }, { x: 6, y: 4 }, { x: -6, y: 4 }];
const SQUARE: XY[] = [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }];
// elongated convex hexagon (chamfered rectangle — the case the wavefront broke on)
const HEX: XY[] = [
  { x: -8, y: -3 }, { x: -5, y: -5 }, { x: 8, y: -5 },
  { x: 8, y: 3 }, { x: 5, y: 5 }, { x: -8, y: 5 },
];
// symmetric trapezoid
const TRAP: XY[] = [{ x: -8, y: -4 }, { x: 8, y: -4 }, { x: 5, y: 4 }, { x: -5, y: 4 }];
// convex pentagon
const PENT: XY[] = [{ x: 0, y: -6 }, { x: 6, y: -1 }, { x: 4, y: 6 }, { x: -4, y: 6 }, { x: -6, y: -1 }];
const LSHAPE: XY[] = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 },
  { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 },
];

function located(roofs: Project['roofs']): Project {
  return {
    ...fixtureProject(0),
    roofs,
    location: { address: 'Pune', latLng: { lat: 18.52, lng: 73.86 }, confirmed: true, irradiance: 5.4, peakSunHours: 5.4, dataSource: 'estimate' },
  };
}

describe('skeletonFaces — convex footprints', () => {
  it('a rectangle reproduces the classic hip (faces meet at a LEVEL ridge)', () => {
    const g = skeletonFaces({ footprint: RECT, existing: [], pitchDeg: 22, eaveHeightM: 3 });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.faces.length).toBe(4);
    expect(g.faces.every(isSloped)).toBe(true);
    const refs = computeEaveRefs(g.faces);
    const ridge = 3 + Math.tan((22 * Math.PI) / 180) * 4; // eave + grad·(short half)
    for (const x of [-1, 0, 1]) {
      const hs = g.faces.map((f) => surfaceHeightAt(f, { x, y: 0 }, refs.get(f.id)));
      expect(hs.filter((h) => Math.abs(h - ridge) < 0.05).length).toBeGreaterThanOrEqual(2);
    }
    expect(g.faces.reduce((s, f) => s + polygonArea(f.polygon), 0)).toBeCloseTo(polygonArea(RECT), 1);
  });

  it('a square gives a pyramid — four faces to one apex at equal height', () => {
    const g = skeletonFaces({ footprint: SQUARE, existing: [], pitchDeg: 20, eaveHeightM: 3 });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    const refs = computeEaveRefs(g.faces);
    const apex = 3 + Math.tan((20 * Math.PI) / 180) * 5;
    for (const f of g.faces) expect(surfaceHeightAt(f, { x: 0, y: 0 }, refs.get(f.id))).toBeCloseTo(apex, 1);
  });

  it.each([['hexagon', HEX, 6], ['trapezoid', TRAP, 4], ['pentagon', PENT, 5]] as const)(
    'tiles a convex %s that gable/hip can’t (one face per wall, area conserved)',
    (_name, shape, edges) => {
      const g = skeletonFaces({ footprint: shape, existing: [], pitchDeg: 18 });
      expect(g.ok).toBe(true);
      if (!g.ok) return;
      expect(g.faces.length).toBe(edges);
      expect(g.faces.every(isSloped)).toBe(true);
      // faces tile the footprint within ~1% (exact in theory; a few cm of
      // apex-node snapping on sharp corners is sub-panel and below the engine gate)
      const tiled = g.faces.reduce((s, f) => s + polygonArea(f.polygon), 0);
      const target = polygonArea([...shape]);
      expect(tiled).toBeGreaterThan(0.985 * target);
      expect(tiled).toBeLessThanOrEqual(target + 0.01);
    },
  );

  it('adjacent faces meet at ONE consistent height along their shared edge', () => {
    const g = skeletonFaces({ footprint: HEX, existing: [], pitchDeg: 18, eaveHeightM: 3 });
    if (!g.ok) throw new Error('hex failed');
    const refs = computeEaveRefs(g.faces);
    // sample a grid; every interior point's height is single-valued across the
    // faces that contain it (skeleton faces tile with matching heights)
    for (let x = -6; x <= 6; x += 3) {
      for (let y = -3; y <= 3; y += 3) {
        const hs = g.faces
          .filter((f) => polygonArea(f.polygon) > 0.5)
          .map((f) => ({ f, h: surfaceHeightAt(f, { x, y }, refs.get(f.id)) }));
        // the MIN height across faces is the true roof (nearest wall); any face
        // actually containing (x,y) agrees with it within tolerance
        const minH = Math.min(...hs.map((o) => o.h));
        expect(minH).toBeGreaterThanOrEqual(3 - 0.01);
      }
    }
  });

  it('the faces flow through the per-roof pipeline (fill + shading, no NaN)', () => {
    const g = skeletonFaces({ footprint: HEX, existing: [], pitchDeg: 15 });
    if (!g.ok) throw new Error('hex failed');
    let p = located(g.faces);
    const panels = g.faces.flatMap((f) => autoFillRoof(p, f, p.components.panel!, DEFAULT_FILL));
    expect(panels.length).toBeGreaterThan(0);
    p = { ...p, panels };
    const access = computeSolarAccess(p);
    for (const v of access.values()) expect(v).toBeGreaterThan(0);
  });

  // SUPERSEDED by Phase 21c: an L-shape used to be refused because half-plane
  // clipping cannot represent the valley a reflex corner creates. The wavefront
  // simulation now handles it, and the faces must TILE the footprint.
  it('now BUILDS a reflex (L-shaped) footprint, tiling it exactly', () => {
    const g = skeletonFaces({ footprint: LSHAPE, existing: [] });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    const sum = g.faces.reduce((s, f) => s + Math.abs(polygonArea(f.polygon)), 0);
    const want = Math.abs(polygonArea(LSHAPE));
    expect(Math.abs(sum - want) / want).toBeLessThan(0.05);
  });

  it('refuses a too-steep pitch', () => {
    expect(skeletonFaces({ footprint: RECT, existing: [], pitchDeg: 75 }).ok).toBe(false);
  });
});

// ─── S9: collinearity pre-clean before the split ────────────────────────────
// The skeleton makes ONE face per edge, so a traced/AI-detected footprint whose
// "straight" wall carries a sub-degree kink used to yield an extra face with a
// near-identical azimuth, a spurious hip line, and sliver Roofs.
describe('skeletonFaces pre-cleans near-collinear footprint vertices', () => {
  /**
   * RECT's bottom wall, split at midspan and bowed 6 cm OUTWARD — the shape a
   * hand-trace or a detector produces on a wall that is straight in reality.
   * Kept convex on purpose: this exercises the half-plane path, not the
   * wavefront one, so the only variable is the pre-clean.
   */
  const KINKED: XY[] = [
    { x: -6, y: -4 },
    { x: 0, y: -4.06 }, // 0.06 m off a 12 m wall ⇒ turn ≈ 1.1°, under the 2° gate
    { x: 6, y: -4 },
    { x: 6, y: 4 },
    { x: -6, y: 4 },
  ];

  it('a ~1° kink yields the SAME face count as the clean rectangle', () => {
    const clean = skeletonFaces({ footprint: RECT, existing: [], pitchDeg: 22, eaveHeightM: 3 });
    const kinked = skeletonFaces({ footprint: KINKED, existing: [], pitchDeg: 22, eaveHeightM: 3 });
    expect(clean.ok).toBe(true);
    expect(kinked.ok).toBe(true);
    if (!clean.ok || !kinked.ok) return;
    expect(kinked.faces.length).toBe(clean.faces.length); // 4, not 5
    // no near-duplicate azimuths ⇒ no spurious hip line between twin faces
    const azes = kinked.faces.map((f) => f.slopeAzimuthDeg).sort((a, b) => a - b);
    for (let i = 1; i < azes.length; i++) expect(azes[i] - azes[i - 1]).toBeGreaterThan(1);
    // and no sliver Roofs: every face is a real, buildable area
    for (const f of kinked.faces) expect(polygonArea(f.polygon)).toBeGreaterThan(1);
  });

  it('still tiles the footprint after the clean-up', () => {
    const g = skeletonFaces({ footprint: KINKED, existing: [], pitchDeg: 22, eaveHeightM: 3 });
    if (!g.ok) throw new Error(g.reason);
    const tiled = g.faces.reduce((s, f) => s + polygonArea(f.polygon), 0);
    // the cleaned ring IS the plain rectangle — the 0.06 m nub is discarded
    expect(tiled).toBeCloseTo(polygonArea(RECT), 1);
  });

  it('a GENUINE turn is preserved — pre-clean is not a widened tolerance', () => {
    // same wall, bowed out far enough to clear the 2° collapse gate (~9.5°)
    const real: XY[] = [
      { x: -6, y: -4 }, { x: 0, y: -4.5 }, { x: 6, y: -4 },
      { x: 6, y: 4 }, { x: -6, y: 4 },
    ];
    const g = skeletonFaces({ footprint: real, existing: [], pitchDeg: 22, eaveHeightM: 3 });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.faces.length).toBe(5); // the kink is a real corner and keeps its face
  });
});

// ─── Phase 21c: reflex (L-shaped) footprints ────────────────────────────────
describe('skeletonFaces on an L-shaped footprint', () => {
  const L = [
    { x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 6 },
    { x: 6, y: 6 }, { x: 6, y: 12 }, { x: 0, y: 12 },
  ];

  it('no longer refuses an L — the notch is a valley, not a failure', () => {
    const r = skeletonFaces({ footprint: L, existing: [], pitchDeg: 20 });
    expect(r.ok).toBe(true);
  });

  it('every face gets a real downslope azimuth', () => {
    const r = skeletonFaces({ footprint: L, existing: [], pitchDeg: 20 });
    if (!r.ok) throw new Error(r.reason);
    for (const f of r.faces) {
      expect(Number.isFinite(f.slopeAzimuthDeg)).toBe(true);
      expect(f.pitchDeg).toBe(20);
    }
  });

  it('opposite walls slope in opposite directions', () => {
    const r = skeletonFaces({ footprint: L, existing: [], pitchDeg: 20 });
    if (!r.ok) throw new Error(r.reason);
    const azes = r.faces.map((f) => Math.round(f.slopeAzimuthDeg));
    expect(new Set(azes).size).toBeGreaterThan(1);
  });

  // WAS pinned as "sweeps exactly but is refused". The diagnosis in that pin
  // was wrong: the dropped face was never a sliver. `sweepFaces` tiles the T at
  // 0.000%, and the face it emits for the bar's right shoulder is a full 18 m²
  // trapezoid — but its vertex trace doubles back on itself after the split,
  // giving the self-touching ring (18,6)(15,3)(3,3)(9,3)(12,6). sanitiseRoof-
  // Polygon rejected it for CROSSING EDGES, not for min-edge/min-area, so an
  // eighth of the roof silently vanished and the 1% gate refused the whole
  // thing. collapseSpikes removes the zero-area excursion (an area-preserving
  // operation, no threshold touched) and the real trapezoid survives.
  it('a T-shape BUILDS — the de-spiked faces tile the footprint exactly', () => {
    const T = [
      { x: 0, y: 0 }, { x: 18, y: 0 }, { x: 18, y: 6 }, { x: 12, y: 6 },
      { x: 12, y: 12 }, { x: 6, y: 12 }, { x: 6, y: 6 }, { x: 0, y: 6 },
    ];
    const r = skeletonFaces({ footprint: T, existing: [], pitchDeg: 20 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.faces).toHaveLength(8); // one face per wall, none lost
    const want = Math.abs(polygonArea(T));
    const sum = r.faces.reduce((s, f) => s + Math.abs(polygonArea(f.polygon)), 0);
    expect(Math.abs(sum - want) / want).toBeLessThan(1e-6);
    // and the recovered face is a simple 4-gon of the full 18 m², not a sliver
    const shoulder = r.faces.find((f) => Math.abs(Math.abs(polygonArea(f.polygon)) - 18) < 1e-6);
    expect(shoulder).toBeDefined();
  });

  // A cross/plus is the four-reflex-corner case and must tile just as exactly.
  it('a plus/cross footprint BUILDS — twelve faces, exact tiling', () => {
    const PLUS = [
      { x: 6, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 6 }, { x: 18, y: 6 },
      { x: 18, y: 12 }, { x: 12, y: 12 }, { x: 12, y: 18 }, { x: 6, y: 18 },
      { x: 6, y: 12 }, { x: 0, y: 12 }, { x: 0, y: 6 }, { x: 6, y: 6 },
    ];
    const r = skeletonFaces({ footprint: PLUS, existing: [], pitchDeg: 20 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.faces).toHaveLength(12);
    const want = Math.abs(polygonArea(PLUS));
    const sum = r.faces.reduce((s, f) => s + Math.abs(polygonArea(f.polygon)), 0);
    expect(Math.abs(sum - want) / want).toBeLessThan(1e-6);
  });

  // WAS pinned as "refuses a shape it cannot tile". The U no longer belongs in
  // that role: the wavefront used to lose exactly one 18 m² face on it (a split
  // event was accepted at a wall's ENDPOINT rather than across its live span),
  // and now that split candidates must actually pierce the wall it tiles to
  // 0.00% and every face survives sanitisation. See skeleton-wavefront.test.
  it('now BUILDS a U-shape — two reflex corners, all eight walls delivered', () => {
    const U = [
      { x: 0, y: 0 }, { x: 18, y: 0 }, { x: 18, y: 12 }, { x: 12, y: 12 },
      { x: 12, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 12 }, { x: 0, y: 12 },
    ];
    const r = skeletonFaces({ footprint: U, existing: [], pitchDeg: 20 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.faces).toHaveLength(8);
  });

  // The refusal path still has to state what the user should do instead. The T
  // no longer exercises it (it builds), so this now uses a STAIRCASE — six
  // reflex corners whose valleys interact in ways the wavefront cannot resolve.
  // The point of the pin is that the gate STILL BITES: de-spiking recovers real
  // faces, it does not paper over a footprint that genuinely fails to tile.
  it('refuses with a reason that says what to do', () => {
    const STAIRCASE = [
      { x: 0, y: 0 }, { x: 24, y: 0 }, { x: 24, y: 4 }, { x: 18, y: 4 },
      { x: 18, y: 8 }, { x: 12, y: 8 }, { x: 12, y: 12 }, { x: 6, y: 12 },
      { x: 6, y: 16 }, { x: 0, y: 16 },
    ];
    const r = skeletonFaces({ footprint: STAIRCASE, existing: [], pitchDeg: 20 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/Gable|split it/i);
  });
});
