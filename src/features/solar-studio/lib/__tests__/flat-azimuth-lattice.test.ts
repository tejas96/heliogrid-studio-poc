// ─── Azimuth-derived lattice for TILTED fills on FLAT roofs ─────────────────
// Field bug (2026-07-18, live user project): a flat RCC roof whose LONG edge
// runs N-S filled 12 panels az 180 / tilt 10 / portrait with centres stepping
// w+gap = 1.184 m ALONG N-S — the very axis each south-facing plate occupies
// h·cos(10°) = 2.243 m of — so every consecutive pair overlapped ~1.06 m:
// exactly 11 overlapping DRC pairs and a shingled cascade in 3D.
//
// Root cause: autoFillRoof laid its lattice along dominantEdgeAngle(polygon)
// while defaultPanelPose fixes the facing at azimuth 180, and fillRowPitchM /
// shadowFreePitchM already assume rows run PERPENDICULAR to the facing. Fix:
// gridAngleFor derives the flat-tilted lattice from the pose's azimuth
// (angle = 180 − azimuthDeg, ≡ −azimuthDeg mod 180 — the frame
// panelCornersOnRoof rotates the plate's w × h·cos(tilt) footprint into), and
// fill / snap / fits / segment-ops all consume it.
import { describe, expect, it } from 'vitest';
import type { PanelSpec, PlacedPanel, Project, Roof, XY } from '../../types';
import {
  autoFillRoof,
  defaultPanelPose,
  fillRoofAsSegment,
  gridAngleFor,
  panelCornersOnRoof,
  panelFitsAt,
} from '../layout';
import {
  duplicateSegment,
  growSegment,
  reindexSegment,
  respaceSegment,
  setSegmentAzimuth,
  setSegmentRacking,
} from '../segment-ops';
import { layoutIssues } from '../drc';
import { shadowFreePitchM } from '../spacing';
import { pointInPolygon, rectCorners, rotate } from '../geo';

/** The live-bug module: 610 W, 2278 × 1134 mm. */
const SPEC610: PanelSpec = {
  id: 'p610',
  brand: 'Test',
  model: 'T-610',
  watt: 610,
  tech: 'TOPCon',
  lengthMm: 2278,
  widthMm: 1134,
  vocV: 52,
  vmpV: 44,
  iscA: 14,
  impA: 13.5,
  tempCoeffVocPct: -0.25,
  almm: true,
  dcr: true,
  priceInr: 12000,
};
const W = SPEC610.widthMm / 1000; // 1.134 across the facing (portrait)
const H = SPEC610.lengthMm / 1000; // 2.278 along it
const GAP = 0.05;

const rect = (cx: number, cy: number, w: number, h: number): XY[] => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

function roof(id: string, poly: XY[], over: Partial<Roof> = {}): Roof {
  return {
    id,
    name: id,
    polygon: poly,
    roofType: 'rcc_flat',
    heightM: 3,
    pitchDeg: 0,
    slopeAzimuthDeg: 180,
    setbackM: 0.5,
    perEdgeSetbacksM: null,
    parapet: {
      enabled: false,
      direction: 'inward',
      heightM: 1,
      widthM: 0.3,
      perEdge: null,
      suppressSharedEdges: true,
    },
    ...over,
  };
}

/** Pune project — the pitch solver needs a location like the live project had. */
function project(roofs: Roof[]): Project {
  return {
    roofs,
    obstructions: [],
    walkways: [],
    keepouts: [],
    panels: [],
    segments: [],
    location: {
      address: 'Pune',
      latLng: { lat: 18.52, lng: 73.86 },
      confirmed: true,
      irradiance: 5.5,
      peakSunHours: 5.5,
      dataSource: 'test',
    },
  } as unknown as Project;
}

/** THE fixture: long edge N-S (5.5 m E-W × 15.2 m N-S), flat RCC, 0.5 m setback.
 *  Pre-fix this reproduced the live project verbatim: 12 panels in one N-S run,
 *  11 overlapping DRC pairs + 2 setback breaches. */
const fixtureRoofNS = () => roof('fx', rect(0, 0, 5.5, 15.2));

const errorsOf = (p: Project) =>
  layoutIssues(p, SPEC610).filter(
    (i) => i.code === 'panel_overlap' || i.code === 'setback_breach',
  );

describe('THE fixture roof (long edge N-S): tilted flat fill is clean', () => {
  const r = fixtureRoofNS();
  const base = project([r]);
  const panels = autoFillRoof(base, r, SPEC610);
  const designed = { ...base, panels } as Project;

  it('zero DRC overlap findings and zero setback breaches', () => {
    expect(errorsOf(designed)).toEqual([]);
  });

  it('capacity did not regress: >= 12 (the broken layout), actually more', () => {
    // pre-fix: exactly 12 (one shingled N-S run). Post-fix: 15 — 3 per E-W
    // row × 5 shadow-free rows. A VALID layout with MORE modules.
    expect(panels.length).toBeGreaterThanOrEqual(12);
    expect(panels.length).toBe(15);
  });

  it('every panel keeps the south-facing default pose', () => {
    for (const p of panels) {
      expect(p.azimuthDeg).toBe(180);
      expect(p.tiltDeg).toBe(10);
      expect(p.orientation).toBe('portrait');
    }
  });

  it('rows advance N-S at >= the shadow-free pitch; in-row step is E-W by w+gap', () => {
    // group by row (shared y), sorted south → north
    const rows = new Map<string, PlacedPanel[]>();
    for (const p of panels) {
      const k = p.center.y.toFixed(6);
      rows.set(k, [...(rows.get(k) ?? []), p]);
    }
    const ys = [...rows.keys()].map(Number).sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(1);
    const pitch = shadowFreePitchM(18.52, 73.86, 10, H, 180);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(pitch - 1e-6);
    }
    // panels within a row step ACROSS the facing: E-W, by exactly w+gap
    for (const row of rows.values()) {
      const xs = row.map((p) => p.center.x).sort((a, b) => a - b);
      expect(xs.length).toBeGreaterThan(1);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i] - xs[i - 1]).toBeCloseTo(W + GAP, 6);
      }
    }
  });

  it('each filled panel\'s azimuth-rotated footprint is contained in its own lattice cell', () => {
    // the sign/convention proof by construction: panelCornersOnRoof rotates
    // the plate's w × h·cos(tilt) rectangle by −azimuthDeg; the lattice cell
    // is w × h at gridAngleFor. Containment holds ONLY when the two frames
    // agree mod 180 — the invariant gridAngleFor exists to guarantee.
    const pose = defaultPanelPose(r);
    const angle = gridAngleFor(r, pose);
    for (const p of panels) {
      const cell = rectCorners(p.center, W + 1e-9, H + 1e-9, angle).map((c) => ({
        // inflate a hair so the exact-width w axis is not a knife edge
        x: p.center.x + (c.x - p.center.x) * 1.001,
        y: p.center.y + (c.y - p.center.y) * 1.001,
      }));
      for (const c of panelCornersOnRoof(p, SPEC610, r)) {
        expect(pointInPolygon(c, cell), `corner ${JSON.stringify(c)} escapes its cell`).toBe(true);
      }
    }
  });

  it('reindexSegment round-trip: unique cellIndex, no collisions', () => {
    const filled = fillRoofAsSegment(project([r]), r, SPEC610)!;
    expect(filled.panels.length).toBe(15);
    const re = reindexSegment(r, SPEC610, filled.segment, filled.panels);
    expect(re.panels.length).toBe(filled.panels.length);
    const idx = re.panels.map((p) => p.cellIndex!);
    expect(new Set(idx).size).toBe(idx.length);
    expect(re.segment.rows * re.segment.cols).toBe(
      re.panels.length + re.segment.removed.length,
    );
  });

  it('panelFitsAt agrees with fill + DRC: an accepted centre yields a clean panel', () => {
    // probe a coarse grid of centres; every ACCEPTED one, placed with the
    // pose the fill would assign, must produce zero DRC findings — the
    // candidate now carries the real pose instead of a tilt-0/az-0 stand-in.
    let accepted = 0;
    for (let x = -2.5; x <= 2.5; x += 0.7) {
      for (let y = -7; y <= 7; y += 1.1) {
        const c = { x, y };
        if (!panelFitsAt(base, r, SPEC610, c, 'portrait')) continue;
        accepted++;
        const placed: PlacedPanel = {
          id: 'probe',
          roofId: r.id,
          center: c,
          orientation: 'portrait',
          ...defaultPanelPose(r),
          solarAccess: 1,
          enabled: true,
        };
        expect(errorsOf({ ...base, panels: [placed] } as Project)).toEqual([]);
      }
    }
    expect(accepted).toBeGreaterThan(0);
  });

  it('drag-area monotonicity holds on the azimuth lattice too', () => {
    const key = (p: PlacedPanel) => `${p.center.x.toFixed(6)},${p.center.y.toFixed(6)}`;
    const opts = { orientation: 'portrait' as const, gapM: GAP, grouped: true };
    const small = autoFillRoof(base, r, SPEC610, opts, rect(0, -3, 4, 7));
    const large = autoFillRoof(base, r, SPEC610, opts, rect(0, -1.5, 4.6, 11));
    expect(small.length).toBeGreaterThan(0);
    expect(large.length).toBeGreaterThan(small.length);
    const largeKeys = new Set(large.map(key));
    for (const p of small) expect(largeKeys.has(key(p))).toBe(true);
  });
});

describe('property sweep: rotated roof rectangles, both orientations', () => {
  for (const deg of [0, 10, 30, 45, 60, 87]) {
    for (const orientation of ['portrait', 'landscape'] as const) {
      it(`tilted RCC fill on a ${deg}°-rotated rect (${orientation}) has zero DRC findings`, () => {
        const poly = rect(0, 0, 12, 8).map((v) => rotate(v, deg));
        const r = roof(`r${deg}`, poly);
        const base = project([r]);
        const panels = autoFillRoof(base, r, SPEC610, {
          orientation,
          gapM: GAP,
          grouped: true,
        });
        expect(panels.length).toBeGreaterThan(0);
        expect(errorsOf({ ...base, panels } as Project)).toEqual([]);
      });

      it(`flush metal-shed fill on a ${deg}°-rotated rect (${orientation}) has zero DRC findings`, () => {
        const poly = rect(0, 0, 12, 8).map((v) => rotate(v, deg));
        const r = roof(`f${deg}`, poly, { roofType: 'metal_shed' });
        const base = project([r]);
        const panels = autoFillRoof(base, r, SPEC610, {
          orientation,
          gapM: GAP,
          grouped: true,
        });
        expect(panels.length).toBeGreaterThan(0);
        expect(errorsOf({ ...base, panels } as Project)).toEqual([]);
      });
    }
  }

  it('FLUSH fills are untouched by the azimuth-lattice fix (pre-fix snapshot, 30° rotation)', () => {
    // centres captured on the PRE-fix tree (flush keeps dominantEdgeAngle —
    // there is no facing to violate at tilt 0, alignment is aesthetic)
    const poly = rect(0, 0, 12, 8).map((v) => rotate(v, 30));
    const r = roof('fl', poly, { roofType: 'metal_shed' });
    const panels = autoFillRoof(project([r]), r, SPEC610);
    const got = panels
      .map((x) => `${x.center.x.toFixed(6)},${x.center.y.toFixed(6)}`)
      .join(';');
    expect(got).toBe(
      '-4.255558,-2.495088;-3.230184,-1.903088;-2.204810,-1.311088;-1.179436,-0.719088;-0.154062,-0.127088;0.871312,0.464912;1.896686,1.056912;2.922060,1.648912;3.947435,2.240912;-5.419558,-0.478981;-4.394184,0.113019;-3.368810,0.705019;-2.343436,1.297019;-1.318062,1.889019;-0.292688,2.481019;0.732686,3.073019;1.758060,3.665019;2.783435,4.257019',
    );
  });

  it('SLOPED fills are byte-identical to the pre-fix tree', () => {
    const r = roof('sl', rect(0, 0, 12, 8), {
      roofType: 'metal_shed',
      pitchDeg: 20,
      slopeAzimuthDeg: 180,
    });
    const p = project([r]);
    const panels = autoFillRoof(p, r, SPEC610);
    const got = panels
      .map((x) => `${x.center.x.toFixed(6)},${x.center.y.toFixed(6)}`)
      .join(';');
    expect(got).toBe(
      '-4.932999,2.429689;-4.932999,0.239069;-4.932999,-1.951550;-3.748999,2.429689;-3.748999,0.239069;-3.748999,-1.951550;-2.564999,2.429689;-2.564999,0.239069;-2.564999,-1.951550;-1.380999,2.429689;-1.380999,0.239069;-1.380999,-1.951550;-0.196999,2.429689;-0.196999,0.239069;-0.196999,-1.951550;0.987001,2.429689;0.987001,0.239069;0.987001,-1.951550;2.171001,2.429689;2.171001,0.239069;2.171001,-1.951550;3.355001,2.429689;3.355001,0.239069;3.355001,-1.951550;4.539001,2.429689;4.539001,0.239069;4.539001,-1.951550',
    );
    const seg = fillRoofAsSegment(p, r, SPEC610)!;
    expect(seg.segment.rows).toBe(9);
    expect(seg.segment.cols).toBe(3);
  });
});

describe('segment ops on an azimuth-lattice table', () => {
  const withPanels = (base: Project, panels: PlacedPanel[], segments: unknown[]) =>
    ({ ...base, panels, segments }) as unknown as Project;

  it('growSegment adds a shadow-free row along the FACING axis, DRC-clean', () => {
    const r = fixtureRoofNS();
    const base = project([r]);
    // a partial fill (southern half) so there is headroom to grow north
    const filled = fillRoofAsSegment(base, r, SPEC610, undefined, rect(0, -4, 5.5, 7))!;
    const proj = withPanels(base, filled.panels, [filled.segment]);
    const res = growSegment(proj, r, SPEC610, filled.segment, 'row', 'top', 1);
    expect(res.added).toBeGreaterThan(0);
    // grown panels sit one row PITCH further N (the facing axis), not w+gap
    const maxYBefore = Math.max(...filled.panels.map((p) => p.center.y));
    const grownYs = res.panels
      .filter((p) => p.center.y > maxYBefore + 1e-6)
      .map((p) => p.center.y);
    expect(grownYs.length).toBe(res.added);
    const rackPitch =
      filled.segment.racking.kind !== 'flush' ? filled.segment.racking.rowPitchM : 0;
    expect(rackPitch).toBeGreaterThan(H); // a real tilted-row pitch
    for (const y of grownYs) expect(y - maxYBefore).toBeCloseTo(rackPitch, 3);
    expect(errorsOf(withPanels(base, res.panels, [res.segment]))).toEqual([]);
  });

  it('respaceSegment applies the pitch along the FACING axis, DRC-clean', () => {
    const r = fixtureRoofNS();
    const base = project([r]);
    const filled = fillRoofAsSegment(base, r, SPEC610)!;
    const proj = withPanels(base, filled.panels, [filled.segment]);
    const wide = 3.4; // wider than the solved pitch → fewer rows
    const res = respaceSegment(proj, r, SPEC610, filled.segment, wide)!;
    expect(res).not.toBeNull();
    const ys = [...new Set(res.panels.map((p) => p.center.y.toFixed(6)))]
      .map(Number)
      .sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(1);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeCloseTo(wide, 6);
    expect(errorsOf(withPanels(base, res.panels, [res.segment]))).toEqual([]);
  });

  it('duplicateSegment clones ACROSS the facing (E-W), DRC-clean', () => {
    const r = fixtureRoofNS();
    const base = project([r]);
    // small table in the SW corner so an E-W clone has room
    const filled = fillRoofAsSegment(base, r, SPEC610, undefined, rect(-1.7, -5, 2, 5.6))!;
    const proj = withPanels(base, filled.panels, [filled.segment]);
    const dup = duplicateSegment(proj, r, SPEC610, filled.segment)!;
    expect(dup).not.toBeNull();
    expect(dup.panels.length).toBeGreaterThan(0);
    // the clone shifts in x (across the facing) and keeps each row's y
    const srcYs = new Set(filled.panels.map((p) => p.center.y.toFixed(6)));
    for (const p of dup.panels) {
      expect(srcYs.has(p.center.y.toFixed(6))).toBe(true);
      expect(p.center.x).toBeGreaterThan(Math.max(...filled.panels.map((q) => q.center.x)));
    }
    expect(
      errorsOf(withPanels(base, [...filled.panels, ...dup.panels], [filled.segment, dup.segment])),
    ).toEqual([]);
  });

  it('a table ROTATED to az 90 respaces in ITS OWN frame (rows advance E-W)', () => {
    // segmentGrid derives the pose from the segment\'s own panels, so a table
    // the user rotated after the fill keeps a coherent grid frame
    const big = roof('big', rect(0, 0, 24, 20));
    const base = project([big]);
    const filled = fillRoofAsSegment(base, big, SPEC610, undefined, rect(-6, -4, 4, 6))!;
    const tilted = setSegmentRacking(big, SPEC610, filled.segment, filled.panels, 'fixed_tilt');
    const east = setSegmentAzimuth(tilted.segment, tilted.panels, 90);
    const proj = withPanels(base, east.panels, [east.segment]);
    const res = respaceSegment(proj, big, SPEC610, east.segment, 3.2)!;
    expect(res).not.toBeNull();
    expect(res.panels.length).toBeGreaterThan(0);
    for (const p of res.panels) expect(p.azimuthDeg).toBe(90);
    // east-facing ⇒ rows are N-S lines advancing E-W; panels within a row
    // step N-S by w+gap
    const cols = new Map<string, number[]>();
    for (const p of res.panels) {
      const k = p.center.x.toFixed(6);
      cols.set(k, [...(cols.get(k) ?? []), p.center.y]);
    }
    for (const ys of cols.values()) {
      const s = ys.sort((a, b) => a - b);
      for (let i = 1; i < s.length; i++) expect(s[i] - s[i - 1]).toBeCloseTo(W + GAP, 6);
    }
    const xs = [...cols.keys()].map(Number).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(3.2, 6);
    expect(errorsOf(withPanels(base, res.panels, [res.segment]))).toEqual([]);
  });
});

// ─── THE user's real roof, not an idealised rectangle ───────────────────────
// Polygon, site and module read straight off the live project that produced
// the "11 overlapping panel pairs" banner. The rectangle fixture above is a
// clean 5.5 × 15.2 stand-in; this quad is neither axis-aligned nor square, so
// it exercises the lattice on a bearing no fixture chose deliberately. If the
// azimuth-derived lattice only worked on tidy shapes, it would fail here.
describe("the reported project's actual roof quad", () => {
  const LIVE: XY[] = [
    { x: 1.43, y: 9.78 },
    { x: 2.26, y: -6.37 },
    { x: 10.07, y: -5.73 },
    { x: 8.94, y: 10.58 },
  ];
  const r = roof('live', LIVE, { setbackM: 0.3 });
  const base = {
    ...project([r]),
    location: {
      address: 'Site',
      latLng: { lat: 16.855, lng: 74.564 },
      confirmed: true,
    },
  } as Project;
  const panels = autoFillRoof(base, r, SPEC610);
  const designed = { ...base, panels } as Project;

  it('fills with ZERO overlaps and zero setback breaches', () => {
    expect(panels.length).toBeGreaterThan(0);
    expect(errorsOf(designed)).toEqual([]);
  });

  it('every panel faces south and sits inside the roof', () => {
    for (const p of panels) {
      expect(p.azimuthDeg).toBe(180);
      expect(pointInPolygon(p.center, LIVE)).toBe(true);
    }
  });

  // The bug's signature: consecutive centres 1.184 m apart along N-S while each
  // plate is 2.243 m deep there. Rows must now advance by at least the plate
  // depth, so no two centres may sit closer than that in the facing axis.
  it('no two panels sit closer than the plate depth along the facing axis', () => {
    const depth = H * Math.cos((10 * Math.PI) / 180);
    for (let i = 0; i < panels.length; i++)
      for (let j = i + 1; j < panels.length; j++) {
        const a = panels[i].center;
        const b = panels[j].center;
        // same E-W row ⇒ they step by width; otherwise they must clear depth
        if (Math.abs(a.y - b.y) < 1e-6) continue;
        if (Math.abs(a.x - b.x) < W - 1e-6)
          expect(Math.abs(a.y - b.y)).toBeGreaterThan(depth - 1e-6);
      }
  });
});
