import { describe, expect, it } from 'vitest';
import type { PanelSpec, PlacedPanel, Project, Roof, XY } from '../../types';
import { fillRoofAsSegment, placedPanelCorners, COL_STRIDE } from '../layout';
import { rectsOverlap } from '../geo';
import {
  classifySelection,
  groupIntoTable,
  growSegment,
  reindexSegment,
  setSegmentAzimuth,
  setSegmentProfile,
  setSegmentRacking,
  setSegmentTilt,
  STRUCTURE_PROFILES,
  duplicateSegment,
  reindexAll,
  respaceSegment,
} from '../segment-ops';
import { autoFillRoof } from '../layout';

const rect = (cx: number, cy: number, w: number, h: number): XY[] => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

function roof(id: string, poly: XY[]): Roof {
  return {
    id, name: id, polygon: poly, roofType: 'rcc_flat', heightM: 3, pitchDeg: 0,
    slopeAzimuthDeg: 180, setbackM: 0.5, perEdgeSetbacksM: null,
    parapet: { enabled: false, direction: 'inward', heightM: 1, widthM: 0.3, perEdge: null, suppressSharedEdges: true },
  };
}

const SPEC: PanelSpec = {
  id: 'p1', brand: 'T', model: 'T', watt: 500, tech: 'Mono PERC',
  lengthMm: 2000, widthMm: 1000, vocV: 50, vmpV: 42, iscA: 13, impA: 12,
  tempCoeffVocPct: -0.27, almm: true, dcr: true, priceInr: 1,
};

// a big roof so there's room to grow into
const R = roof('a', rect(0, 0, 24, 20));

function projectWith(panels: PlacedPanel[], segments: unknown[] = []): Project {
  return { roofs: [R], obstructions: [], walkways: [], keepouts: [], panels, segments } as unknown as Project;
}

/** Fill a small sub-area so there's headroom to grow.
 *  The area-limit box CLIPS the roof-anchored lattice (it no longer gets its
 *  own box-anchored grid), so the box must span ≥2 lattice rows and columns —
 *  5×8 m at this position yields a 3×4 table on the 24×20 fixture roof. */
function seed() {
  const base = projectWith([]);
  const filled = fillRoofAsSegment(base, R, SPEC, { orientation: 'portrait', gapM: 0.05, grouped: true }, rect(-6, -4, 5, 8))!;
  return { segment: filled.segment, panels: filled.panels, project: projectWith(filled.panels, [filled.segment]) };
}

describe('growSegment', () => {
  it('adds a row of panels on the bottom and reindexes the grid', () => {
    const { segment, project } = seed();
    const before = project.panels.length;
    const rowsBefore = segment.rows;
    const res = growSegment(project, R, SPEC, segment, 'row', 'bottom', 1);
    expect(res.added).toBeGreaterThan(0);
    expect(res.panels.length).toBe(before + res.added);
    expect(res.segment.rows).toBe(rowsBefore + 1);
    // every panel still linked + has a decodable cellIndex
    for (const p of res.panels) {
      expect(p.segmentId).toBe(segment.id);
      expect(typeof p.cellIndex).toBe('number');
    }
  });

  it('adds a column on the right', () => {
    const { segment, project } = seed();
    const colsBefore = segment.cols;
    const res = growSegment(project, R, SPEC, segment, 'column', 'right', 1);
    expect(res.added).toBeGreaterThan(0);
    expect(res.segment.cols).toBe(colsBefore + 1);
  });

  it('adds multiple rows at once', () => {
    const { segment, project } = seed();
    const res = growSegment(project, R, SPEC, segment, 'row', 'top', 2);
    expect(res.segment.rows).toBe(segment.rows + 2);
  });

  it('grown panels inherit the TABLE azimuth + tilt, not the roof default', () => {
    const { segment, panels } = seed();
    const tilted = setSegmentRacking(R, SPEC, segment, panels, 'fixed_tilt');
    const rotated = setSegmentAzimuth(tilted.segment, tilted.panels, 210);
    const proj = projectWith(rotated.panels, [rotated.segment]);
    const res = growSegment(proj, R, SPEC, rotated.segment, 'row', 'bottom', 1);
    const before = new Set(rotated.panels.map((p) => p.id));
    const grown = res.panels.filter((p) => !before.has(p.id));
    expect(grown.length).toBeGreaterThan(0);
    for (const p of grown) {
      expect(p.azimuthDeg).toBe(210);
      if (rotated.segment.racking.kind !== 'flush') expect(p.tiltDeg).toBe(rotated.segment.racking.tiltDeg);
    }
  });

  it('grown panels never overlap existing ones (collision-aware)', () => {
    const { segment, project } = seed();
    const res = growSegment(project, R, SPEC, segment, 'row', 'bottom', 1);
    // reindex is 1:1 with unique (row,col) cells → no duplicate cellIndex means no overlap
    const idx = res.panels.map((p) => p.cellIndex);
    expect(new Set(idx).size).toBe(idx.length);
  });

  it('skips cells blocked by a keepout when growing', () => {
    const { segment, panels } = seed();
    // a keepout just below the block, where the new 'bottom' row (−Y) would land
    const by = Math.min(...panels.map((p) => p.center.y));
    const keepout = { id: 'k', roofId: 'a', shape: rect(-6, by - 2.2, 6, 2), heightM: 0, kind: 'obstruction' as const };
    const proj = { ...projectWith(panels, [segment]), keepouts: [keepout] } as unknown as Project;
    const open = growSegment(projectWith(panels, [segment]), R, SPEC, segment, 'row', 'bottom', 1).added;
    const blocked = growSegment(proj, R, SPEC, segment, 'row', 'bottom', 1).added;
    expect(blocked).toBeLessThan(open);
  });
});

describe('reindexSegment', () => {
  it('recomputes rows/cols and records holes for a removed panel', () => {
    const { segment, panels } = seed();
    // drop one interior panel → it should show up as a hole after reindex
    const dropped = panels.slice(1);
    const re = reindexSegment(R, SPEC, segment, dropped);
    expect(re.segment.rows * re.segment.cols).toBe(dropped.length + re.segment.removed.length);
  });
});

describe('groupIntoTable', () => {
  const loose = () =>
    autoFillRoof(projectWith([]), R, SPEC, { orientation: 'portrait', gapM: 0.05, grouped: true }, rect(-6, -4, 5, 5));

  it('turns loose panels into a parametric table (grid inferred from positions)', () => {
    const panels = loose();
    expect(panels.some((p) => p.segmentId)).toBe(false); // start loose
    const res = groupIntoTable(R, SPEC, panels, 'A1');
    expect(res.segment.label).toBe('A1');
    expect(res.segment.rows * res.segment.cols).toBe(res.panels.length + res.segment.removed.length);
    for (const p of res.panels) {
      expect(p.segmentId).toBe(res.segment.id);
      expect(typeof p.cellIndex).toBe('number');
    }
  });

  it('a grouped table can then be grown', () => {
    const g = groupIntoTable(R, SPEC, loose(), 'A1');
    const proj = projectWith(g.panels, [g.segment]);
    const res = growSegment(proj, R, SPEC, g.segment, 'row', 'bottom', 1);
    expect(res.added).toBeGreaterThan(0);
  });
});

describe('per-table properties', () => {
  // 5×8 m box ⇒ 3×4 table on the roof-anchored lattice (a drag box now CLIPS
  // the roof's own grid instead of getting a box-anchored one)
  const table = () => groupIntoTable(R, SPEC, autoFillRoof(projectWith([]), R, SPEC, { orientation: 'portrait', gapM: 0.05, grouped: true }, rect(-6, -4, 5, 8)), 'A1');

  it('setSegmentRacking flush lays panels flat; elevated tilts them', () => {
    const { segment, panels } = table();
    const flush = setSegmentRacking(R, SPEC, segment, panels, 'flush');
    expect(flush.segment.racking.kind).toBe('flush');
    expect(flush.panels.every((p) => p.tiltDeg === 0)).toBe(true); // flat RCC → 0
    const tilted = setSegmentRacking(R, SPEC, segment, panels, 'fixed_tilt');
    expect(tilted.segment.racking.kind).toBe('fixed_tilt');
    if (tilted.segment.racking.kind !== 'flush')
      expect(tilted.segment.racking.tiltDeg).toBeGreaterThan(0);
    expect(tilted.panels.every((p) => p.tiltDeg > 0)).toBe(true);
  });

  it('setSegmentTilt clamps 0–35 and syncs panels + back leg', () => {
    const { segment, panels } = table();
    const tilted = setSegmentRacking(R, SPEC, segment, panels, 'fixed_tilt');
    const res = setSegmentTilt(SPEC, tilted.segment, tilted.panels, 50); // over the clamp
    if (res.segment.racking.kind !== 'flush') {
      expect(res.segment.racking.tiltDeg).toBe(35);
      expect(res.segment.racking.backLegM).toBeGreaterThan(res.segment.racking.frontLegM);
    }
    expect(res.panels.every((p) => p.tiltDeg === 35)).toBe(true);
  });

  it('setSegmentTilt is a no-op on flush racking', () => {
    const { segment, panels } = table();
    const flush = setSegmentRacking(R, SPEC, segment, panels, 'flush');
    const res = setSegmentTilt(SPEC, flush.segment, flush.panels, 20);
    expect(res.segment.racking.kind).toBe('flush');
  });

  it('setSegmentAzimuth normalises and syncs the panels', () => {
    const { segment, panels } = table();
    const res = setSegmentAzimuth(segment, panels, 200);
    expect(res.segment.azimuthDeg).toBe(200);
    expect(res.panels.every((p) => p.azimuthDeg === 200)).toBe(true);
    expect(setSegmentAzimuth(segment, panels, 400).segment.azimuthDeg).toBe(40); // wraps
  });

  it('setSegmentProfile changes an elevated table’s steel section', () => {
    const { segment, panels } = table();
    const tilted = setSegmentRacking(R, SPEC, segment, panels, 'fixed_tilt');
    const z = STRUCTURE_PROFILES.find((p) => p.key === 'z_purlin')!;
    const out = setSegmentProfile(tilted.segment, z);
    if (out.racking.kind !== 'flush') expect(out.racking.profile.key).toBe('z_purlin');
  });
});

describe('reindexAll (delete + prune)', () => {
  // 5×8 m box ⇒ 3×4 table on the roof-anchored lattice (a drag box now CLIPS
  // the roof's own grid instead of getting a box-anchored one)
  const table = () => groupIntoTable(R, SPEC, autoFillRoof(projectWith([]), R, SPEC, { orientation: 'portrait', gapM: 0.05, grouped: true }, rect(-6, -4, 5, 8)), 'A1');

  it('shrinks the grid when an edge row is deleted', () => {
    const { segment, panels } = table();
    const topRow = Math.max(...panels.map((p) => Math.floor((p.cellIndex ?? 0) / COL_STRIDE)));
    const remaining = panels.filter((p) => Math.floor((p.cellIndex ?? 0) / COL_STRIDE) !== topRow);
    const out = reindexAll([R], SPEC, [segment], remaining);
    expect(out.segments[0].rows).toBe(segment.rows - 1);
  });

  it('drops a segment when all its panels are deleted', () => {
    const { segment } = table();
    const out = reindexAll([R], SPEC, [segment], []); // no panels left
    expect(out.segments).toHaveLength(0);
  });
});

describe('duplicateSegment', () => {
  it('clones the table to a new segment, offset and collision-aware', () => {
    const { segment, panels } = groupIntoTable(R, SPEC, autoFillRoof(projectWith([]), R, SPEC, { orientation: 'portrait', gapM: 0.05, grouped: true }, rect(-6, -4, 4, 4)), 'A1');
    const proj = projectWith(panels, [segment]);
    const dup = duplicateSegment(proj, R, SPEC, segment)!;
    expect(dup).not.toBeNull();
    expect(dup.segment.id).not.toBe(segment.id);
    expect(dup.panels.every((p) => p.segmentId === dup.segment.id)).toBe(true);
    // the clone does not overlap the original
    const angle = 0;
    const origCorners = panels.map((p) => placedPanelCorners(p, SPEC, angle));
    for (const p of dup.panels) {
      const c = placedPanelCorners(p, SPEC, angle);
      for (const oc of origCorners) expect(rectsOverlap(c, oc)).toBe(false);
    }
  });
});

describe('respaceSegment (apply shadow-free spacing)', () => {
  it('re-lays rows at a wider pitch, stores it, keeps the grid consistent', () => {
    // a tall table so wider spacing visibly drops rows
    const loose = autoFillRoof(projectWith([]), R, SPEC, { orientation: 'portrait', gapM: 0.05, grouped: true }, rect(-6, 0, 5, 12));
    const { segment, panels } = groupIntoTable(R, SPEC, loose, 'A1');
    const proj = projectWith(panels, [segment]);
    const widePitch = 3.5; // ≫ module pitch (~2.05 m)
    const res = respaceSegment(proj, R, SPEC, segment, widePitch)!;
    expect(res).not.toBeNull();
    expect(res.segment.rows).toBeLessThan(segment.rows); // fewer rows fit
    expect(res.segment.rows * res.segment.cols).toBe(res.panels.length + res.segment.removed.length);
    for (const p of res.panels) expect(p.segmentId).toBe(segment.id);
  });

  it('stores the applied pitch on elevated racking so grow/reindex keep it', () => {
    const loose = autoFillRoof(projectWith([]), R, SPEC, { orientation: 'portrait', gapM: 0.05, grouped: true }, rect(-6, 0, 5, 12));
    const grouped = groupIntoTable(R, SPEC, loose, 'A1');
    const tilted = setSegmentRacking(R, SPEC, grouped.segment, grouped.panels, 'fixed_tilt');
    const proj = projectWith(tilted.panels, [tilted.segment]);
    const res = respaceSegment(proj, R, SPEC, tilted.segment, 3.5)!;
    if (res.segment.racking.kind !== 'flush') expect(res.segment.racking.rowPitchM).toBe(3.5);
  });
});

describe('classifySelection', () => {
  it('detects a single row, a single column, and a table', () => {
    const { panels } = seed();
    const rowCells = panels.filter((p) => Math.floor((p.cellIndex ?? 0) / COL_STRIDE) === 0);
    const colCells = panels.filter((p) => (p.cellIndex ?? 0) % COL_STRIDE === 0);
    expect(classifySelection(rowCells).kind).toBe('row');
    expect(classifySelection(colCells).kind).toBe('column');
    expect(classifySelection(panels).kind).toBe('table');
  });

  it('returns other for loose (unsegmented) panels', () => {
    const loose: PlacedPanel = {
      id: 'x', roofId: 'a', center: { x: 0, y: 0 }, orientation: 'portrait',
      azimuthDeg: 180, tiltDeg: 10, solarAccess: 1, enabled: true,
    };
    expect(classifySelection([loose]).kind).toBe('other');
  });
});
