// ─── Phase 22i gates: the persisted leg plan ────────────────────────────────
// The dangerous part of this feature is NOT the geometry — it is the frame.
// A leg plan that derives its own axes agrees with the panel lattice on a
// due-south table and silently diverges the moment one is rotated, which is
// the azimuth-lattice bug class this project has already been bitten by. So
// the plan is stored in `segmentFrameAngle` — the lattice's own derivation —
// and the rotated-table case is a first-class gate here.
import { describe, expect, it } from 'vitest';
import { buildStructure, resolveRacking, validateStructure } from '../structure';
import { segmentFrameAngle } from '../segment-ops';
import { normalizeProject } from '../persistence/normalize';
import { layoutFp } from '../fingerprints';
import { rotate } from '../geo';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { ArraySegment, PlacedPanel, Project, XY } from '../../types';

const W = 1.134;
const GAP = 0.05;

function scene(opts: { azimuthDeg?: number; legPlan?: { points: XY[] }; cells?: number[] } = {}) {
  const base = fixtureProject(0);
  const project: Project = {
    ...base,
    roofs: [fixtureRoof()],
    structureDefaults: { ...base.structureDefaults, foundation: 'anchor' },
  };
  const az = opts.azimuthDeg ?? 180;
  const cells = opts.cells ?? [0, 1, 2, 3];
  const seg: ArraySegment = {
    id: 'seg_t',
    roofId: 'roof_1',
    label: 'A1',
    polygon: [],
    rows: 1,
    cols: 8,
    orientation: 'portrait',
    azimuthDeg: az,
    racking: {
      kind: 'fixed_tilt',
      tiltDeg: 10,
      rowPitchM: 0,
      frontLegM: 0.3,
      backLegM: 0.3,
      profile: { key: 'c_channel', label: 'C-Channel', kgPerM: 2.2 },
    },
    moduleGapM: GAP,
    removed: [],
    ...(opts.legPlan ? { legPlan: opts.legPlan } : {}),
  };
  // panels laid out along the segment's own frame, so a rotated table really
  // is rotated rather than merely relabelled
  const angle = segmentFrameAngle(project.roofs[0], seg, []);
  const panels: PlacedPanel[] = cells.map((c) => ({
    id: `pv_${c}`,
    roofId: 'roof_1',
    center: rotate({ x: c * (W + GAP), y: 0 }, angle),
    orientation: 'portrait',
    azimuthDeg: az,
    tiltDeg: 10,
    solarAccess: 1,
    enabled: true,
    segmentId: 'seg_t',
    cellIndex: c,
  }));
  const r = resolveRacking(project, project.roofs[0], seg, project.components.panel!)!;
  return {
    project,
    seg,
    panels,
    frameAngle: segmentFrameAngle(project.roofs[0], seg, panels),
    s: buildStructure(seg, project.components.panel!, project.roofs[0], r, panels),
  };
}

const of = (s: ReturnType<typeof scene>['s'], k: string) => s.members.filter((m) => m.kind === k);

describe('absent plan ⇒ AUTO, unchanged', () => {
  it('produces the automatic graph', () => {
    const { s } = scene();
    expect(of(s, 'front_leg').length).toBeGreaterThan(0);
    expect(s.warnings).toEqual([]);
    expect(validateStructure(s)).toEqual([]);
  });

  it('layoutFp is byte-identical to a project that never had the field', () => {
    const { project, seg, panels } = scene();
    const without: Project = { ...project, segments: [seg], panels };
    const explicitlyUndefined: Project = {
      ...project,
      segments: [{ ...seg, legPlan: undefined }],
      panels,
    };
    expect(layoutFp(explicitlyUndefined)).toBe(layoutFp(without));
  });
});

describe('a saved plan places the legs', () => {
  // three legs across the run, in the segment's LOCAL frame
  const points = [{ x: 0, y: 0 }, { x: 1.6, y: 0 }, { x: 3.2, y: 0 }];

  it('3 points ⇒ 3 front legs, 3 back legs, 3 rafters', () => {
    const { s } = scene({ legPlan: { points } });
    expect(of(s, 'front_leg')).toHaveLength(3);
    expect(of(s, 'back_leg')).toHaveLength(3);
    expect(of(s, 'rafter')).toHaveLength(3);
    expect(validateStructure(s)).toEqual([]);
  });

  it('overrides the automatic station count', () => {
    const auto = of(scene().s, 'front_leg').length;
    const planned = of(scene({ legPlan: { points } }).s, 'front_leg').length;
    expect(planned).toBe(3);
    expect(planned).not.toBe(auto);
  });

  it('legs come out sorted along the run, whatever order they were placed in', () => {
    const shuffled = [{ x: 3.2, y: 0 }, { x: 0, y: 0 }, { x: 1.6, y: 0 }];
    const a = of(scene({ legPlan: { points } }).s, 'front_leg').map((m) => m.id);
    const b = of(scene({ legPlan: { points: shuffled } }).s, 'front_leg').map((m) => m.id);
    expect(b).toEqual(a); // ids stay deterministic
    const xs = of(scene({ legPlan: { points: shuffled } }).s, 'front_leg').map((m) => m.a.x);
    expect(xs).toEqual([...xs].sort((p, q) => p - q));
  });

  it('braces span the PLANNED bays, not the automatic ones', () => {
    const s = scene({ legPlan: { points } }).s;
    expect(of(s, 'brace')).toHaveLength(2); // 3 stations ⇒ 2 bays
    expect(validateStructure(s)).toEqual([]);
  });

  it('a point beyond the run end is not used by it', () => {
    const s = scene({ legPlan: { points: [...points, { x: 500, y: 0 }] } }).s;
    expect(of(s, 'front_leg')).toHaveLength(3);
  });
});

// ══════════════════════════════ THE FRAME GATE (E3) ═════════════════════════
describe('a rotated table keeps its legs aligned with its panels', () => {
  for (const az of [180, 90, 0, 270, 135]) {
    it(`azimuth ${az}: every leg sits under the panel run`, () => {
      const points = [{ x: 0, y: 0 }, { x: 1.6, y: 0 }, { x: 3.2, y: 0 }];
      const { s, panels, frameAngle } = scene({ azimuthDeg: az, legPlan: { points } });
      expect(of(s, 'front_leg')).toHaveLength(3);

      // the legs must lie on the SAME axis the panels do. Rotate both back into
      // the segment frame: the panel row is a constant-y line there, and so is
      // the leg line. An independently-derived frame breaks this for az != 180.
      const panelYs = panels.map((p) => rotate(p.center, -frameAngle).y);
      const spreadPanels = Math.max(...panelYs) - Math.min(...panelYs);
      expect(spreadPanels).toBeLessThan(1e-6); // sanity: the row IS a line

      const legLocalYs = of(s, 'front_leg').map((m) => rotate({ x: m.a.x, y: m.a.y }, -frameAngle).y);
      const spreadLegs = Math.max(...legLocalYs) - Math.min(...legLocalYs);
      expect(spreadLegs, `legs must share one axis at az ${az}`).toBeLessThan(1e-6);
    });
  }

  it('the plan is frame-relative: the same points follow the table round', () => {
    const points = [{ x: 0, y: 0 }, { x: 1.6, y: 0 }, { x: 3.2, y: 0 }];
    const south = scene({ azimuthDeg: 180, legPlan: { points } });
    const east = scene({ azimuthDeg: 90, legPlan: { points } });
    // identical counts and identical spacing — only the world orientation moved
    const spacing = (r: typeof south) => {
      const xs = of(r.s, 'front_leg').map((m) => rotate({ x: m.a.x, y: m.a.y }, -r.frameAngle).x);
      return xs.slice(1).map((v, i) => +(v - xs[i]).toFixed(6));
    };
    expect(spacing(east)).toEqual(spacing(south));
  });
});

describe('starved and partial runs warn instead of failing', () => {
  it('a run with no planned leg falls back to AUTO and says so', () => {
    // two runs (a hole splits them); the plan only covers the first
    const { s } = scene({
      cells: [0, 1, 4, 5],
      legPlan: { points: [{ x: 0, y: 0 }, { x: 1.2, y: 0 }] },
    });
    expect(of(s, 'front_leg').length).toBeGreaterThan(2); // the far run kept legs
    expect(s.warnings.join(' ')).toMatch(/automatic spacing/i);
    expect(validateStructure(s)).toEqual([]);
  });

  it('a partially planned table warns about the mix (E6)', () => {
    const { s } = scene({
      cells: [0, 1, 4, 5],
      legPlan: { points: [{ x: 0, y: 0 }, { x: 1.2, y: 0 }] },
    });
    expect(s.warnings.join(' ')).toMatch(/runs use your leg plan/i);
  });

  it('a fully planned table does NOT warn about a mix', () => {
    const { s } = scene({ legPlan: { points: [{ x: 0, y: 0 }, { x: 3.2, y: 0 }] } });
    expect(s.warnings.join(' ')).not.toMatch(/runs use your leg plan/i);
  });

  it('a plan that misses everything never crashes', () => {
    const { s } = scene({ legPlan: { points: [{ x: 9999, y: 9999 }] } });
    expect(of(s, 'front_leg').length).toBeGreaterThan(0); // AUTO everywhere
    expect(validateStructure(s)).toEqual([]);
  });

  it('a one-leg plan is legal — it just makes a one-station run', () => {
    const { s } = scene({ legPlan: { points: [{ x: 1.6, y: 0 }] } });
    expect(of(s, 'front_leg')).toHaveLength(1);
    expect(of(s, 'brace')).toHaveLength(0); // no bay to brace
    expect(validateStructure(s)).toEqual([]);
  });
});

describe('normalize: a bad plan drops to AUTO, never taking the table with it', () => {
  const withPlan = (legPlan: unknown) => {
    const { project, seg, panels } = scene();
    return normalizeProject({
      ...project,
      segments: [{ ...seg, legPlan }],
      panels,
    } as unknown as Project);
  };

  it('keeps a valid plan', () => {
    expect(withPlan({ points: [{ x: 1, y: 2 }] }).segments[0].legPlan).toEqual({
      points: [{ x: 1, y: 2 }],
    });
  });

  for (const [name, bad] of [
    ['non-finite', { points: [{ x: NaN, y: 0 }] }],
    ['infinite', { points: [{ x: Infinity, y: 0 }] }],
    ['missing y', { points: [{ x: 1 }] }],
    ['null point', { points: [null] }],
    ['points not an array', { points: 'nope' }],
    ['empty', { points: [] }],
  ] as const) {
    it(`${name}: the key is REMOVED and the segment survives`, () => {
      const p = withPlan(bad);
      expect(p.segments).toHaveLength(1); // table not deleted
      expect('legPlan' in p.segments[0]).toBe(false); // key gone, not undefined
    });
  }

  it('a dropped plan leaves layoutFp exactly as if it never existed', () => {
    const { project, seg, panels } = scene();
    const clean: Project = { ...project, segments: [seg], panels };
    const dirty = normalizeProject({
      ...project,
      segments: [{ ...seg, legPlan: { points: [{ x: NaN, y: 0 }] } }],
      panels,
    } as unknown as Project);
    expect(layoutFp(dirty)).toBe(layoutFp(clean));
  });
});

describe('fingerprint discipline', () => {
  it('a plan re-keys the layout — moved legs move steel, which moves money', () => {
    const { project, seg, panels } = scene();
    const base: Project = { ...project, segments: [seg], panels };
    const planned: Project = {
      ...project,
      segments: [{ ...seg, legPlan: { points: [{ x: 0, y: 0 }, { x: 2, y: 0 }] } }],
      panels,
    };
    expect(layoutFp(planned)).not.toBe(layoutFp(base));
  });

  it('moving one leg re-keys it again', () => {
    const { project, seg, panels } = scene();
    const a: Project = {
      ...project,
      segments: [{ ...seg, legPlan: { points: [{ x: 0, y: 0 }] } }],
      panels,
    };
    const b: Project = {
      ...project,
      segments: [{ ...seg, legPlan: { points: [{ x: 0.5, y: 0 }] } }],
      panels,
    };
    expect(layoutFp(a)).not.toBe(layoutFp(b));
  });
});
