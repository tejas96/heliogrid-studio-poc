// TEMPORARY adversarial verification probes for the azimuth-lattice flat-fill
// change. DELETE BEFORE FINISHING. Ugly asymmetric numbers on purpose.
import { describe, expect, it } from 'vitest';
import type { PanelSpec, PlacedPanel, Project, Roof, XY } from '../../types';
import {
  autoFillRoof,
  defaultPanelPose,
  fillRoofAsSegment,
  panelFitsAt,
} from '../layout';
import {
  duplicateSegment,
  growSegment,
  reindexSegment,
  respaceSegment,
  setSegmentAzimuth,
  setSegmentTilt,
} from '../segment-ops';
import { layoutIssues } from '../drc';
import { shadowFreePitchM } from '../spacing';
import { rotate } from '../geo';

const SPEC: PanelSpec = {
  id: 'p610',
  brand: 'T',
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
} as PanelSpec;
const W = 1.134;
const H = 2.278;
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
  } as Roof;
}

function project(roofs: Roof[], extra: Partial<Project> = {}): Project {
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
    ...extra,
  } as unknown as Project;
}

const hardIssues = (p: Project) =>
  layoutIssues(p, SPEC).filter(
    (i) =>
      i.code === 'panel_overlap' ||
      i.code === 'setback_breach' ||
      i.code === 'panel_in_keepout',
  );

// ── 1. FINE rotation sweep of the roof outline ──────────────────────────────
describe('P1 fine roof-rotation sweep (rcc tilted fill)', () => {
  for (const deg of [5, 15, 22.5, 37, 44, 46, 52, 75, 89, 90]) {
    for (const orientation of ['portrait', 'landscape'] as const) {
      it(`rot ${deg} ${orientation}: fill >0, DRC clean`, () => {
        const poly = rect(0.37, -0.61, 11.3, 7.1).map((v) => rotate(v, deg));
        const r = roof(`r${deg}${orientation}`, poly);
        const base = project([r]);
        const panels = autoFillRoof(base, r, SPEC, {
          orientation,
          gapM: GAP,
          grouped: true,
        });
        expect(panels.length, `no panels at ${deg}/${orientation}`).toBeGreaterThan(0);
        expect(hardIssues({ ...base, panels } as Project)).toEqual([]);
      });
    }
  }
});

// ── 1b. tilt sweep via segment ops (5 / 20 deg), incl. respace at solved pitch
describe('P1b tilt sweep on rotated roofs', () => {
  for (const deg of [5, 37, 89]) {
    for (const tilt of [5, 20]) {
      it(`roof rot ${deg}, tilt→${tilt}: tilt-only then respace, DRC clean`, () => {
        const poly = rect(-0.83, 0.29, 11.3, 7.1).map((v) => rotate(v, deg));
        const r = roof(`t${deg}_${tilt}`, poly);
        const base = project([r]);
        const filled = fillRoofAsSegment(base, r, SPEC)!;
        expect(filled).not.toBeNull();
        const t = setSegmentTilt(SPEC, filled.segment, filled.panels, tilt);
        // tilt change alone (positions unchanged) must stay DRC-clean
        const projT = { ...base, panels: t.panels, segments: [t.segment] } as Project;
        expect(hardIssues(projT)).toEqual([]);
        // then respace at the solved shadow-free pitch for the new tilt
        const pitch = Math.max(
          H + GAP + 0.01,
          shadowFreePitchM(18.52, 73.86, tilt, H, 180),
        );
        const res = respaceSegment(projT, r, SPEC, t.segment, pitch);
        expect(res).not.toBeNull();
        expect(res!.panels.length).toBeGreaterThan(0);
        expect(
          hardIssues({ ...base, panels: res!.panels, segments: [res!.segment] } as Project),
        ).toEqual([]);
      });
    }
  }
});

// ── 1c. azimuth sweep via setSegmentAzimuth + respace/grow/duplicate ────────
describe('P1c segment azimuth sweep on a big flat roof', () => {
  for (const az of [5, 23, 37, 44, 52, 89, 133, 178, 271]) {
    it(`az ${az}: respace + grow + duplicate all DRC clean`, () => {
      const big = roof(`az${az}`, rect(0.7, -1.3, 27.9, 23.1));
      const base = project([big]);
      // small table with lots of head-room around it
      const filled = fillRoofAsSegment(base, big, SPEC, undefined, rect(-4.3, -3.1, 5.1, 7.3))!;
      expect(filled).not.toBeNull();
      const rot = setSegmentAzimuth(filled.segment, filled.panels, az);
      const pitch = Math.max(
        H + GAP + 0.01,
        shadowFreePitchM(18.52, 73.86, 10, H, az),
      );
      const projR = { ...base, panels: rot.panels, segments: [rot.segment] } as Project;
      const res = respaceSegment(projR, big, SPEC, rot.segment, pitch)!;
      expect(res).not.toBeNull();
      expect(res.panels.length).toBeGreaterThan(0);
      const projRes = { ...base, panels: res.panels, segments: [res.segment] } as Project;
      expect(hardIssues(projRes), `respace az ${az}`).toEqual([]);

      const grown = growSegment(projRes, big, SPEC, res.segment, 'row', 'top', 1);
      expect(
        hardIssues({ ...base, panels: grown.panels, segments: [grown.segment] } as Project),
        `grow az ${az}`,
      ).toEqual([]);

      const dup = duplicateSegment(projRes, big, SPEC, res.segment);
      if (dup) {
        expect(
          hardIssues({
            ...base,
            panels: [...res.panels, ...dup.panels],
            segments: [res.segment, dup.segment],
          } as Project),
          `dup az ${az}`,
        ).toEqual([]);
      }
    });
  }
});

// ── 2. degenerates ──────────────────────────────────────────────────────────
describe('P2 degenerate roofs', () => {
  it('tiny roof fits exactly 1 panel, DRC clean', () => {
    const r = roof('tiny', rect(0.13, -0.07, W + 1.02, H + 1.02));
    const base = project([r]);
    const panels = autoFillRoof(base, r, SPEC);
    expect(panels.length).toBe(1);
    expect(hardIssues({ ...base, panels } as Project)).toEqual([]);
  });

  it('long thin E-W roof: one row, DRC clean', () => {
    const r = roof('thinEW', rect(0.3, 0.1, 20.7, H + 1.02));
    const base = project([r]);
    const panels = autoFillRoof(base, r, SPEC);
    expect(panels.length).toBeGreaterThan(5);
    const ys = new Set(panels.map((p) => p.center.y.toFixed(6)));
    expect(ys.size).toBe(1);
    expect(hardIssues({ ...base, panels } as Project)).toEqual([]);
  });

  it('long thin N-S roof: one column, rows at >= pitch, DRC clean', () => {
    const r = roof('thinNS', rect(-0.2, 0.4, W + 1.02, 23.9));
    const base = project([r]);
    const panels = autoFillRoof(base, r, SPEC);
    expect(panels.length).toBeGreaterThan(3);
    const xs = new Set(panels.map((p) => p.center.x.toFixed(6)));
    expect(xs.size).toBe(1);
    const pitch = shadowFreePitchM(18.52, 73.86, 10, H, 180);
    const yy = panels.map((p) => p.center.y).sort((a, b) => a - b);
    for (let i = 1; i < yy.length; i++)
      expect(yy[i] - yy[i - 1]).toBeGreaterThanOrEqual(Math.max(pitch, H + GAP) - 1e-6);
    expect(hardIssues({ ...base, panels } as Project)).toEqual([]);
  });

  it('concave L roof, DRC clean', () => {
    const L: XY[] = [
      { x: 0, y: 0 },
      { x: 10.3, y: 0 },
      { x: 10.3, y: 4.7 },
      { x: 4.1, y: 4.7 },
      { x: 4.1, y: 9.9 },
      { x: 0, y: 9.9 },
    ];
    const r = roof('L', L);
    const base = project([r]);
    const panels = autoFillRoof(base, r, SPEC);
    expect(panels.length).toBeGreaterThan(0);
    expect(hardIssues({ ...base, panels } as Project)).toEqual([]);
  });

  it('keepout mid-field: no panel in keepout, DRC clean', () => {
    const r = roof('ko', rect(0, 0, 12.7, 9.3));
    const base = project([r], {
      keepouts: [
        {
          id: 'k1',
          roofId: 'ko',
          shape: rect(0.6, -0.4, 2.1, 1.7),
          heightM: 0,
          kind: 'fire_setback',
        },
      ],
    } as Partial<Project>);
    const panels = autoFillRoof(base, r, SPEC);
    expect(panels.length).toBeGreaterThan(0);
    expect(hardIssues({ ...base, panels } as Project)).toEqual([]);
  });

  it('existing hand-rotated panel (az 37) mid-roof: default fill avoids it', () => {
    const r = roof('exist', rect(0.2, -0.3, 11.9, 8.6));
    const hand: PlacedPanel = {
      id: 'hand',
      roofId: 'exist',
      center: { x: 0.37, y: 0.22 },
      orientation: 'portrait',
      azimuthDeg: 37,
      tiltDeg: 10,
      solarAccess: 1,
      enabled: true,
    };
    const base = project([r], { panels: [hand] } as Partial<Project>);
    const fill = autoFillRoof(base, r, SPEC); // default opts: avoid project.panels
    expect(fill.length).toBeGreaterThan(0);
    expect(hardIssues({ ...base, panels: [hand, ...fill] } as Project)).toEqual([]);
  });

  it('double fill: second fill never overlaps first', () => {
    const r = roof('dbl', rect(-0.4, 0.9, 11.9, 8.6));
    const base = project([r]);
    const first = autoFillRoof(base, r, SPEC);
    const withFirst = { ...base, panels: first } as Project;
    const second = autoFillRoof(withFirst, r, SPEC);
    expect(hardIssues({ ...base, panels: [...first, ...second] } as Project)).toEqual([]);
  });
});

// ── 3. consistency triangle at 3 odd rotations ──────────────────────────────
describe('P3 consistency triangle', () => {
  for (const deg of [17, 43, 71]) {
    it(`rot ${deg}: every filled panel passes panelFitsAt against layout-minus-itself; reindex unique`, () => {
      const poly = rect(0.51, -0.23, 11.3, 7.1).map((v) => rotate(v, deg));
      const r = roof(`c${deg}`, poly);
      const base = project([r]);
      const filled = fillRoofAsSegment(base, r, SPEC)!;
      expect(filled).not.toBeNull();
      for (const p of filled.panels) {
        const minus = {
          ...base,
          panels: filled.panels.filter((q) => q.id !== p.id),
        } as Project;
        expect(
          panelFitsAt(minus, r, SPEC, p.center, p.orientation, undefined, {
            tiltDeg: p.tiltDeg,
            azimuthDeg: p.azimuthDeg,
          }),
          `panel at ${p.center.x},${p.center.y} fails fitsAt`,
        ).toBe(true);
      }
      const re = reindexSegment(r, SPEC, filled.segment, filled.panels);
      const idx = re.panels.map((p) => p.cellIndex!);
      expect(new Set(idx).size).toBe(idx.length);
      expect(re.segment.rows * re.segment.cols).toBe(
        re.panels.length + re.segment.removed.length,
      );
    });
  }
});

// ── 4. capacity + row direction on THE fixture roof ─────────────────────────
describe('P4 fixture roof capacity + E-W rows', () => {
  it('5.5 x 15.2 N-S roof: 15 panels, rows run E-W', () => {
    const r = roof('fx', rect(0, 0, 5.5, 15.2));
    const base = project([r]);
    const panels = autoFillRoof(base, r, SPEC);
    expect(panels.length).toBe(15);
    const rows = new Map<string, PlacedPanel[]>();
    for (const p of panels) {
      const k = p.center.y.toFixed(6);
      rows.set(k, [...(rows.get(k) ?? []), p]);
    }
    expect(rows.size).toBe(5);
    for (const row of rows.values()) {
      expect(row.length).toBe(3);
      const xs = row.map((p) => p.center.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i] - xs[i - 1]).toBeCloseTo(W + GAP, 6); // E-W step
      }
    }
    expect(hardIssues({ ...base, panels } as Project)).toEqual([]);
  });
});

// ── 5. ATTACK: tilt→0 flips the grid frame under an az-lattice table ────────
describe('P5 frame-flip attack: setSegmentTilt(0) on an azimuth-lattice table', () => {
  it('reindex after tilt→0 keeps cellIndex unique and grid consistent', () => {
    const r = roof('flip', rect(0, 0, 5.5, 15.2)); // long edge N-S
    const base = project([r]);
    const filled = fillRoofAsSegment(base, r, SPEC)!;
    expect(filled.panels.length).toBe(15);
    const t0 = setSegmentTilt(SPEC, filled.segment, filled.panels, 0);
    const re = reindexSegment(r, SPEC, t0.segment, t0.panels);
    const idx = re.panels.map((p) => p.cellIndex!);
    expect(new Set(idx).size, `duplicate cellIndex after tilt->0: ${idx.sort((a,b)=>a-b).join(',')}`).toBe(idx.length);
    expect(re.segment.rows * re.segment.cols).toBe(
      re.panels.length + re.segment.removed.length,
    );
  });

  it('respaceSegment does not floor the pitch at the module footprint (overlap probe)', () => {
    const r = roof('floor', rect(0, 0, 5.5, 15.2));
    const base = project([r]);
    const filled = fillRoofAsSegment(base, r, SPEC)!;
    const proj = { ...base, panels: filled.panels, segments: [filled.segment] } as Project;
    const res = respaceSegment(proj, r, SPEC, filled.segment, 1.0); // < h*cos(10) = 2.243
    expect(res).not.toBeNull();
    expect(
      hardIssues({ ...base, panels: res!.panels, segments: [res!.segment] } as Project),
      'respace at 1.0 m pitch produced overlapping rows',
    ).toEqual([]);
  });
});
