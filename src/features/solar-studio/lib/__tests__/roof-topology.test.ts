import { describe, expect, it } from 'vitest';
import {
  collinearOverlap,
  intersectPolygons,
  outsetPolygonRobust,
  polygonArea,
  polygonsUnionArea,
  rectIntersectsPolygon,
} from '../geo';
import {
  effectiveParapetEdges,
  higherOverlapFootprints,
  pickRoofAt,
  roofsUnionAreaM2,
  sharedEdges,
} from '../roof-topology';
import { buildParapetGeometries } from '../scene-model';
import { autoFillRoof } from '../layout';
import { shadingFingerprint } from '../fingerprints';
import type { PanelSpec, ParapetWall, Project, Roof, XY } from '../../types';

const rect = (cx: number, cy: number, w: number, h: number): XY[] => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

const parapet = (over: Partial<ParapetWall> = {}): ParapetWall => ({
  enabled: true,
  direction: 'inward',
  heightM: 1,
  widthM: 0.3,
  perEdge: null,
  suppressSharedEdges: true,
  ...over,
});

const roof = (id: string, polygon: XY[], heightM: number, over: Partial<Roof> = {}): Roof => ({
  id,
  name: id,
  polygon,
  roofType: 'rcc_flat',
  heightM,
  pitchDeg: 0,
  slopeAzimuthDeg: 180,
  setbackM: 0.3,
  perEdgeSetbacksM: null,
  parapet: parapet(),
  ...over,
});

describe('outsetPolygonRobust', () => {
  it('dilates a rectangle symmetrically', () => {
    const r = rect(0, 0, 10, 6);
    const out = outsetPolygonRobust(r, r.map(() => 1));
    expect(out.length).toBeGreaterThan(0);
    const area = Math.max(...out.map(polygonArea));
    // 12×8 = 96 minus rounded corners (disk approximation)
    expect(area).toBeGreaterThan(90);
    expect(area).toBeLessThan(97);
  });

  it('handles clockwise input the same as counter-clockwise', () => {
    const r = rect(0, 0, 10, 6);
    const cw = [...r].reverse();
    const a = Math.max(...outsetPolygonRobust(r, r.map(() => 1)).map(polygonArea));
    const b = Math.max(...outsetPolygonRobust(cw, cw.map(() => 1)).map(polygonArea));
    expect(b).toBeCloseTo(a, 1);
  });

  it('only dilates edges with non-zero width', () => {
    const r = rect(0, 0, 10, 6);
    const out = outsetPolygonRobust(r, [1, 0, 0, 0]); // bottom edge only
    const area = Math.max(...out.map(polygonArea));
    // 10×6=60 + strip 10×1 + corner disks ≈ 71-73
    expect(area).toBeGreaterThan(68);
    expect(area).toBeLessThan(75);
  });
});

describe('collinearOverlap', () => {
  const a1 = { x: 0, y: 0 };
  const a2 = { x: 10, y: 0 };
  it('detects full overlap', () => {
    const ov = collinearOverlap(a1, a2, { x: 0, y: 0.01 }, { x: 10, y: 0.01 });
    expect(ov).not.toBeNull();
    expect(ov!.lenM).toBeCloseTo(10, 1);
  });
  it('detects partial overlap with the covered interval', () => {
    const ov = collinearOverlap(a1, a2, { x: 6, y: 0 }, { x: 14, y: 0 });
    expect(ov).not.toBeNull();
    expect(ov!.lenM).toBeCloseTo(4, 5);
    expect(ov!.tA0).toBeCloseTo(0.6, 5);
    expect(ov!.tA1).toBeCloseTo(1, 5);
  });
  it('rejects perpendicular (T-junction) segments', () => {
    expect(collinearOverlap(a1, a2, { x: 5, y: 0 }, { x: 5, y: 8 })).toBeNull();
  });
  it('rejects parallel segments that are too far apart', () => {
    expect(collinearOverlap(a1, a2, { x: 0, y: 0.5 }, { x: 10, y: 0.5 })).toBeNull();
  });
});

describe('union/intersection helpers', () => {
  it('polygonsUnionArea does not double-count overlaps', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(5, 0, 10, 10); // overlaps half of a
    expect(polygonsUnionArea([a, b])).toBeCloseTo(150, 1);
  });
  it('intersectPolygons returns the shared footprint', () => {
    const inter = intersectPolygons(rect(0, 0, 10, 10), rect(5, 0, 10, 10));
    expect(inter.reduce((s, r) => s + polygonArea(r), 0)).toBeCloseTo(50, 1);
  });
  it('rectIntersectsPolygon: containment, crossing, disjoint', () => {
    const poly = rect(0, 0, 10, 10);
    expect(rectIntersectsPolygon(rect(0, 0, 2, 2), poly)).toBe(true); // inside
    expect(rectIntersectsPolygon(rect(0, 0, 40, 40), poly)).toBe(true); // engulfs
    // pure edge crossing: no rect corner inside poly, no poly vertex inside rect
    expect(rectIntersectsPolygon(rect(0, 0, 14, 2), poly)).toBe(true);
    expect(rectIntersectsPolygon(rect(20, 20, 2, 2), poly)).toBe(false); // disjoint
  });
});

describe('shared-wall detection + parapet suppression', () => {
  // terrace A (12×16 at x=-6) and B (12×16 at x=+6) share the x=0 wall
  const A = roof('A', rect(-6, 0, 12, 16), 3);
  const B = roof('B', rect(6, 0, 12, 16), 6);

  it('finds the shared edge with full coverage', () => {
    const shared = sharedEdges(A, [A, B]);
    expect(shared.length).toBeGreaterThan(0);
    const best = shared.find((s) => s.coverage > 0.89);
    expect(best?.otherRoofId).toBe('B');
  });

  it('suppresses the LOWER roof’s parapet on the shared edge only', () => {
    const effA = effectiveParapetEdges(A, [A, B]);
    const effB = effectiveParapetEdges(B, [A, B]);
    expect(effA.filter((e) => e.suppressed)).toHaveLength(1);
    expect(effA.find((e) => e.suppressed)?.sharedWith).toBe('B');
    expect(effB.every((e) => !e.suppressed)).toBe(true); // taller roof keeps all walls
  });

  it('equal heights: exactly one of the two roofs keeps the shared wall', () => {
    const B3 = { ...B, heightM: 3 };
    const suppA = effectiveParapetEdges(A, [A, B3]).filter((e) => e.suppressed).length;
    const suppB = effectiveParapetEdges(B3, [A, B3]).filter((e) => e.suppressed).length;
    expect(suppA + suppB).toBe(1);
  });

  it('does not suppress below 90% coverage', () => {
    // C only covers half of A's right edge
    const C = roof('C', rect(6, 4, 12, 8), 6);
    const effA = effectiveParapetEdges(A, [A, C]);
    expect(effA.every((e) => !e.suppressed)).toBe(true);
  });

  it('respects suppressSharedEdges=false and per-edge disables', () => {
    const A2 = { ...A, parapet: parapet({ suppressSharedEdges: false }) };
    expect(effectiveParapetEdges(A2, [A2, B]).every((e) => !e.suppressed)).toBe(true);
    const A3 = {
      ...A,
      parapet: parapet({
        perEdge: A.polygon.map((_, i) => i !== 0),
      }),
    };
    expect(effectiveParapetEdges(A3, [A3])[0].enabled).toBe(false);
  });
});

describe('buildParapetGeometries', () => {
  const shapeArea = (shape: { getPoints: (n?: number) => { x: number; y: number }[]; holes: { getPoints: (n?: number) => { x: number; y: number }[] }[] }) => {
    const outer = polygonArea(shape.getPoints(4) as XY[]);
    const holes = shape.holes.reduce((s, h) => s + polygonArea(h.getPoints(4) as XY[]), 0);
    return outer - holes;
  };

  it('disabling one edge removes that edge’s band area', () => {
    const full = roof('r', rect(0, 0, 10, 6), 3);
    const partial = {
      ...full,
      parapet: parapet({
        perEdge: full.polygon.map((_, i) => i !== 0),
      }),
    };
    const bandFull = buildParapetGeometries(full, [full]).reduce((s, b) => s + shapeArea(b.shape), 0);
    const bandPartial = buildParapetGeometries(partial, [partial]).reduce(
      (s, b) => s + shapeArea(b.shape),
      0,
    );
    // edge 0 is 10 m long × 0.3 m wide ≈ 3 m² of band gone
    expect(bandFull - bandPartial).toBeGreaterThan(2);
    expect(bandFull - bandPartial).toBeLessThan(4);
  });

  it('outward bands lie outside the roof outline', () => {
    const r = roof('r', rect(0, 0, 10, 6), 3, { parapet: parapet({ direction: 'outward' }) });
    const bands = buildParapetGeometries(r, [r]);
    expect(bands.length).toBeGreaterThan(0);
    const outer = polygonArea(bands[0].shape.getPoints(4) as XY[]);
    expect(outer).toBeGreaterThan(polygonArea(r.polygon)); // dilated ring
  });

  it('suppressed shared edge produces no wall there', () => {
    const A = roof('A', rect(-6, 0, 12, 16), 3);
    const B = roof('B', rect(6, 0, 12, 16), 6);
    const alone = buildParapetGeometries(A, [A]).reduce((s, b) => s + shapeArea(b.shape), 0);
    const shared = buildParapetGeometries(A, [A, B]).reduce((s, b) => s + shapeArea(b.shape), 0);
    // A's shared edge is 16 m × 0.3 ≈ 4.8 m² less band
    expect(alone - shared).toBeGreaterThan(3.5);
  });
});

describe('mumty behaviour', () => {
  const spec: PanelSpec = {
    id: 'p',
    brand: 'T',
    model: 'T',
    watt: 540,
    tech: 'Mono PERC',
    lengthMm: 2279,
    widthMm: 1134,
    vocV: 49.5,
    vmpV: 41.6,
    iscA: 13.9,
    impA: 13,
    tempCoeffVocPct: -0.27,
    almm: true,
    dcr: true,
    priceInr: 12000,
  };
  const terrace = roof('T', rect(0, 0, 16, 12), 3, { parapet: parapet({ enabled: false }) });
  // 6×6 so the bbox-anchored fill grid can land at least one panel row on it
  const mumty = roof('M', rect(3, 2, 6, 6), 5.2, { parapet: parapet({ enabled: false }) });
  const project = {
    roofs: [terrace, mumty],
    obstructions: [],
    walkways: [],
  } as unknown as Project;

  it('autoFillRoof leaves no panel under the mumty footprint', () => {
    const panels = autoFillRoof(project, terrace, spec);
    expect(panels.length).toBeGreaterThan(10);
    const under = panels.filter((p) =>
      rectIntersectsPolygon(
        rect(p.center.x, p.center.y, 1.134, 2.279),
        mumty.polygon,
      ),
    );
    expect(under).toHaveLength(0);
    // the mumty itself still fills
    expect(autoFillRoof(project, mumty, spec).length).toBeGreaterThan(0);
  });

  it('higherOverlapFootprints/union area treat stacking correctly', () => {
    expect(higherOverlapFootprints(terrace, [terrace, mumty])).toHaveLength(1);
    expect(higherOverlapFootprints(mumty, [terrace, mumty])).toHaveLength(0);
    expect(roofsUnionAreaM2([terrace, mumty])).toBeCloseTo(16 * 12, 1);
  });

  it('pickRoofAt prefers the higher (mumty) roof at a stacked point', () => {
    expect(pickRoofAt({ x: 3, y: 2 }, [terrace, mumty])?.id).toBe('M');
    expect(pickRoofAt({ x: -5, y: -3 }, [terrace, mumty])?.id).toBe('T');
  });
});

describe('shading fingerprint regression', () => {
  it('changes when a per-edge parapet toggle changes', () => {
    const base = roof('A', rect(0, 0, 10, 6), 3);
    const project = {
      location: { latLng: { lat: 18.52, lng: 73.85 } },
      roofs: [base],
      obstructions: [],
      panels: [],
    } as unknown as Project;
    const f1 = shadingFingerprint(project);
    const toggled = {
      ...project,
      roofs: [
        {
          ...base,
          parapet: parapet({
            perEdge: base.polygon.map((_, i) => i !== 0),
          }),
        },
      ],
    } as Project;
    expect(shadingFingerprint(toggled)).not.toBe(f1);
  });
});
