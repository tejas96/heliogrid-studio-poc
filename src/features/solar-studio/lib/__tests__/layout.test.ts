import { describe, expect, it } from 'vitest';
import type { Keepout, PanelSpec, PlacedPanel, Project, Roof, XY } from '../../types';
import {
  COL_STRIDE,
  autoFillRoof,
  defaultPanelPose,
  estimateMaxCapacityKwp,
  fillRoofAsSegment,
  nextSegmentLabel,
  panelCornersOnRoof,
  panelFitsAt,
  placedPanelCorners,
  snapPanelCenter,
} from '../layout';
import { rectsOverlap } from '../geo';

const rect = (cx: number, cy: number, w: number, h: number): XY[] => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

function roof(id: string, poly: XY[]): Roof {
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
  };
}

const SPEC: PanelSpec = {
  id: 'p1',
  brand: 'Test',
  model: 'T-500',
  watt: 500,
  tech: 'Mono PERC',
  lengthMm: 2000,
  widthMm: 1000,
  vocV: 50,
  vmpV: 42,
  iscA: 13,
  impA: 12,
  tempCoeffVocPct: -0.27,
  almm: true,
  dcr: true,
  priceInr: 10000,
};

function project(roofs: Roof[], keepouts: Keepout[] = []): Project {
  return {
    roofs,
    obstructions: [],
    walkways: [],
    keepouts,
    panels: [],
    segments: [],
  } as unknown as Project;
}

describe('fillRoofAsSegment', () => {
  const p = project([roof('a', rect(0, 0, 12, 8))]);
  const filled = fillRoofAsSegment(p, p.roofs[0], SPEC)!;

  it('wraps the fill in a segment and links every panel', () => {
    expect(filled).not.toBeNull();
    expect(filled.panels.length).toBeGreaterThan(4);
    for (const pan of filled.panels) {
      expect(pan.segmentId).toBe(filled.segment.id);
      expect(typeof pan.cellIndex).toBe('number');
    }
    expect(filled.segment.removed).toEqual([]);
  });

  it('cellIndex decodes to a rectangular grid matching rows×cols', () => {
    const { rows, cols } = filled.segment;
    // a clean rectangular roof fills a full grid → rows*cols == panel count
    expect(rows * cols).toBe(filled.panels.length);
    for (const pan of filled.panels) {
      const r = Math.floor(pan.cellIndex! / COL_STRIDE);
      const c = pan.cellIndex! % COL_STRIDE;
      expect(r).toBeLessThan(rows);
      expect(c).toBeLessThan(cols);
    }
    // cellIndex values are unique
    const idx = filled.panels.map((x) => x.cellIndex!);
    expect(new Set(idx).size).toBe(idx.length);
  });

  it('picks fixed_tilt racking on a flat RCC roof', () => {
    expect(filled.segment.racking.kind).toBe('fixed_tilt');
  });

  it('picks flush racking on a metal shed', () => {
    const shed = { ...roof('s', rect(0, 0, 12, 8)), roofType: 'metal_shed' as const };
    const f = fillRoofAsSegment(project([shed]), shed, SPEC)!;
    expect(f.segment.racking.kind).toBe('flush');
  });

  it('returns null when nothing fits', () => {
    const tiny = project([roof('t', rect(0, 0, 1.2, 1.2))]);
    expect(fillRoofAsSegment(tiny, tiny.roofs[0], SPEC)).toBeNull();
  });
});

describe('collision-aware fill (no overlap with existing panels)', () => {
  it('a second fill over the same area avoids the first fill (no overlaps)', () => {
    const r = roof('a', rect(0, 0, 12, 8));
    const first = autoFillRoof(project([r]), r, SPEC);
    expect(first.length).toBeGreaterThan(4);
    // fill the SAME roof again, this time avoiding the first batch
    const second = autoFillRoof(project([r]), r, SPEC, {
      orientation: 'portrait',
      gapM: 0.05,
      grouped: true,
      avoidPanels: first,
    });
    // any panel that lands must not overlap any existing panel
    const angle = 0; // axis-aligned rect → dominant edge angle 0
    const firstCorners = first.map((p) => placedPanelCorners(p, SPEC, angle));
    for (const p of second) {
      const c = placedPanelCorners(p, SPEC, angle);
      for (const fc of firstCorners) expect(rectsOverlap(c, fc)).toBe(false);
    }
  });

  it('a project with NO panels refills the identical grid (the blockers are the panels)', () => {
    const r = roof('a', rect(0, 0, 12, 8));
    const first = autoFillRoof(project([r]), r, SPEC);
    // the fixture project has panels: [] — so even the DEFAULT (avoid
    // project.panels) has nothing to avoid and reproduces the same grid
    const again = autoFillRoof(project([r]), r, SPEC);
    const fc = placedPanelCorners(first[0], SPEC, 0);
    const overlaps = again.some((p) => rectsOverlap(placedPanelCorners(p, SPEC, 0), fc));
    expect(overlaps).toBe(true);
  });

  /** DRC shrink idiom: pull corners ~10% toward centre so edge-adjacency ≠ overlap. */
  const shrink = (c: { x: number; y: number }[]) => {
    const cx = (c[0].x + c[2].x) / 2;
    const cy = (c[0].y + c[2].y) / 2;
    return c.map((p) => ({ x: cx + (p.x - cx) * 0.9, y: cy + (p.y - cy) * 0.9 }));
  };

  it('the DEFAULT fill avoids the project\'s own panels — never an overlapping pair', () => {
    const r = roof('a', rect(0, 0, 12, 8));
    const empty = project([r]);
    const first = autoFillRoof(empty, r, SPEC);
    expect(first.length).toBeGreaterThan(4);
    const withPanels = { ...empty, panels: first } as Project;
    // NO avoidPanels passed — the old default ([]) ignored every existing
    // panel and re-filled straight on top of them (user-reported field bug)
    const second = autoFillRoof(withPanels, r, SPEC);
    const firstCorners = first.map((p) => shrink(panelCornersOnRoof(p, SPEC, r)));
    for (const p of second) {
      const c = shrink(panelCornersOnRoof(p, SPEC, r));
      for (const fc of firstCorners) expect(rectsOverlap(c, fc)).toBe(false);
    }
  });

  it('estimateMaxCapacityKwp measures RAW capacity — existing panels do not shrink it', () => {
    const r = roof('a', rect(0, 0, 12, 8));
    const empty = project([r]);
    const rawMax = estimateMaxCapacityKwp(empty, SPEC);
    expect(rawMax.panels).toBeGreaterThan(4);
    const withPanels = { ...empty, panels: autoFillRoof(empty, r, SPEC) } as Project;
    expect(estimateMaxCapacityKwp(withPanels, SPEC)).toEqual(rawMax);
  });
});

describe('area-limited fill (drag-box) — lattice anchored to the ROOF, not the box', () => {
  const key = (p: PlacedPanel) => `${p.center.x.toFixed(6)},${p.center.y.toFixed(6)}`;
  const opts = { orientation: 'portrait' as const, gapM: 0.05, grouped: true };

  it('is MONOTONIC: enlarging the drag box only ADDS panels, never moves one', () => {
    const r = roof('a', rect(0, 0, 12, 8));
    const p = project([r]);
    const small = autoFillRoof(p, r, SPEC, opts, rect(-0.5, -0.5, 5, 4.5));
    const large = autoFillRoof(p, r, SPEC, opts, rect(-0.5, -0.5, 9, 6.5)); // ⊃ small
    expect(small.length).toBeGreaterThan(0);
    expect(large.length).toBeGreaterThan(small.length);
    const largeKeys = new Set(large.map(key));
    for (const pan of small) expect(largeKeys.has(key(pan))).toBe(true);
  });

  it('area-filled panels land on the SAME lattice as the full-roof fill', () => {
    const r = roof('a', rect(0, 0, 12, 8));
    const p = project([r]);
    const full = new Set(autoFillRoof(p, r, SPEC, opts).map(key));
    const area = autoFillRoof(p, r, SPEC, opts, rect(1, 1, 6, 5));
    expect(area.length).toBeGreaterThan(0);
    for (const pan of area) expect(full.has(key(pan))).toBe(true);
  });

  it('cellIndex of an area fill decodes to unique grid cells (reindex/snap-safe)', () => {
    const r = roof('a', rect(0, 0, 12, 8));
    const area = autoFillRoof(project([r]), r, SPEC, opts, rect(0, 0, 8, 6));
    const idx = area.map((x) => x.cellIndex!);
    expect(new Set(idx).size).toBe(idx.length);
    for (const i of idx) expect(i % COL_STRIDE).toBeLessThan(COL_STRIDE);
  });
});

describe('flat TILE deck mounts FLUSH (no ballasted tilt legs on tile)', () => {
  it('defaultPanelPose treats flat tile like metal shed: tilt 0, south', () => {
    const tile = { ...roof('t', rect(0, 0, 12, 8)), roofType: 'tile' as const };
    expect(defaultPanelPose(tile)).toEqual({ tiltDeg: 0, azimuthDeg: 180 });
  });

  it('fillRoofAsSegment picks flush racking on a flat tile roof', () => {
    const tile = { ...roof('t', rect(0, 0, 12, 8)), roofType: 'tile' as const };
    const f = fillRoofAsSegment(project([tile]), tile, SPEC)!;
    expect(f.segment.racking.kind).toBe('flush');
    for (const pan of f.panels) expect(pan.tiltDeg).toBe(0);
  });
});

describe('panelFitsAt (smart single-panel placement)', () => {
  it('rejects a spot already covered by a panel, accepts a clear spot', () => {
    const r = roof('a', rect(0, 0, 12, 8));
    const p = project([r]);
    const existing = autoFillRoof(p, r, SPEC);
    const withPanels = { ...p, panels: existing } as unknown as Project;
    // on top of the first panel → rejected
    expect(panelFitsAt(withPanels, r, SPEC, existing[0].center, 'portrait')).toBe(false);
    // far corner outside any panel but inside the roof → accepted
    expect(panelFitsAt(project([r]), r, SPEC, { x: 0, y: 0 }, 'portrait')).toBe(true);
  });

  it('rejects a spot outside the setback inset', () => {
    const r = roof('a', rect(0, 0, 12, 8));
    // right at the roof edge → outside the 0.5 m setback
    expect(panelFitsAt(project([r]), r, SPEC, { x: 5.9, y: 0 }, 'portrait')).toBe(false);
  });
});

describe('snapPanelCenter (grid alignment)', () => {
  it('snaps a slightly-off cursor back onto the existing-panel grid', () => {
    const r = roof('a', rect(0, 0, 12, 8));
    const existing = autoFillRoof(project([r]), r, SPEC);
    const withPanels = { ...project([r]), panels: existing } as unknown as Project;
    const anchor = existing[0].center;
    const snapped = snapPanelCenter(withPanels, r, SPEC, { x: anchor.x + 0.12, y: anchor.y - 0.1 }, 'portrait');
    expect(Math.hypot(snapped.x - anchor.x, snapped.y - anchor.y)).toBeLessThan(0.05);
  });

  it('is idempotent — snapping an already-snapped point returns it', () => {
    const r = roof('a', rect(0, 0, 12, 8));
    const p = project([r]);
    const once = snapPanelCenter(p, r, SPEC, { x: 1.3, y: -0.7 }, 'portrait');
    const twice = snapPanelCenter(p, r, SPEC, once, 'portrait');
    expect(Math.hypot(twice.x - once.x, twice.y - once.y)).toBeLessThan(1e-6);
  });
});

describe('keepout-aware fill', () => {
  it('a placement keepout removes the panels it overlaps', () => {
    const r = roof('a', rect(0, 0, 12, 8));
    const open = autoFillRoof(project([r]), r, SPEC).length;
    const keepout: Keepout = {
      id: 'k1',
      roofId: 'a',
      shape: rect(0, 0, 6, 6), // big block in the middle
      heightM: 0,
      kind: 'obstruction',
    };
    const withKo = autoFillRoof(project([r], [keepout]), r, SPEC).length;
    expect(withKo).toBeLessThan(open);
    expect(withKo).toBeGreaterThan(0);
  });

  it('a shade-only keepout does NOT block placement', () => {
    const r = roof('a', rect(0, 0, 12, 8));
    const open = autoFillRoof(project([r]), r, SPEC).length;
    const shade: Keepout = {
      id: 'k2',
      roofId: 'a',
      shape: rect(0, 0, 6, 6),
      heightM: 3,
      kind: 'shade',
    };
    expect(autoFillRoof(project([r], [shade]), r, SPEC).length).toBe(open);
  });
});

describe('nextSegmentLabel', () => {
  const seg = {
    id: 'seg1',
    roofId: 'a',
    label: 'A1',
    polygon: rect(0, 0, 12, 8),
    rows: 2,
    cols: 4,
    orientation: 'portrait' as const,
    azimuthDeg: 180,
    racking: { kind: 'flush' as const },
    moduleGapM: 0.05,
    removed: [] as number[],
  };
  it('labels segments sequentially', () => {
    expect(nextSegmentLabel([])).toBe('A1');
    expect(nextSegmentLabel([seg])).toBe('A2');
  });
});
