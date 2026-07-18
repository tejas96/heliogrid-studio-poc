import { describe, expect, it } from 'vitest';
import type { ArraySegment, PanelSpec, PlacedPanel, Project, Roof, XY } from '../../types';
import {
  PHASE_RANK,
  installProgress,
  installationPlan,
  type InstallStep,
} from '../installation';
import { STRUCTURE_PROFILES } from '../segment-ops';
import { COL_STRIDE } from '../layout';
import { fixtureProject } from './fixtures/project';

const rect = (cx: number, cy: number, w: number, h: number): XY[] => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

const SPEC: PanelSpec = {
  id: 'p1', brand: 'T', model: 'T', watt: 550, tech: 'Mono PERC',
  lengthMm: 2278, widthMm: 1134, vocV: 49.5, vmpV: 41, iscA: 14, impA: 13.4,
  tempCoeffVocPct: -0.27, almm: true, dcr: true, priceInr: 1,
};

function roof(id: string): Roof {
  return {
    id, name: id, polygon: rect(0, 0, 30, 20), roofType: 'rcc_flat', heightM: 3,
    pitchDeg: 0, slopeAzimuthDeg: 180, setbackM: 0.5, perEdgeSetbacksM: null,
    parapet: { enabled: false, direction: 'inward', heightM: 1, widthM: 0.3, perEdge: null, suppressSharedEdges: true },
  };
}

function segment(id: string, roofId: string, label: string): ArraySegment {
  return {
    id, roofId, label, polygon: rect(0, 0, 10, 6), rows: 2, cols: 3,
    orientation: 'portrait', azimuthDeg: 180,
    racking: {
      kind: 'fixed_tilt', tiltDeg: 10, rowPitchM: 3,
      frontLegM: 0.3, backLegM: 0.7, profile: STRUCTURE_PROFILES[0],
    },
    moduleGapM: 0.05, removed: [],
  };
}

// cellIndex is REQUIRED: buildStructure emits members from the segment's
// occupancy grid (holes gate emission), so a panel without one is invisible
// to the structure model — and therefore to the work order.
const panel = (
  id: string, roofId: string, segmentId: string, x: number,
  row: number, col: number,
): PlacedPanel => ({
  id, roofId, segmentId, center: { x, y: row * 3 - 1.5 }, orientation: 'portrait',
  azimuthDeg: 180, tiltDeg: 10, solarAccess: 1, enabled: true,
  cellIndex: row * COL_STRIDE + col,
});

function structured(): Project {
  const base = fixtureProject(0);
  const r = roof('r1');
  const seg = segment('seg1', 'r1', 'A1');
  return {
    ...base,
    roofs: [r],
    segments: [seg],
    panels: [
      panel('m1', 'r1', 'seg1', -2, 0, 0),
      panel('m2', 'r1', 'seg1', 2, 0, 1),
    ],
    strings: [
      { id: 'str1', name: 'String 1', inverterIndex: 0, mpptIndex: 0, color: '#f00', panelIds: ['m1', 'm2'] },
    ],
    components: { ...base.components, panel: SPEC },
  };
}

describe('installationPlan — order follows the structural dependency graph', () => {
  const steps = installationPlan(structured());

  it('produces a plan for a structured design', () => {
    expect(steps.length).toBeGreaterThan(0);
  });

  it('never schedules a member before the thing that supports it', () => {
    // THE gate: within one table, phase rank must never decrease
    const bySeg = new Map<string, InstallStep[]>();
    for (const s of steps.filter((x) => x.segmentId)) {
      const list = bySeg.get(s.segmentId!) ?? [];
      list.push(s);
      bySeg.set(s.segmentId!, list);
    }
    for (const [, list] of bySeg) {
      const ranks = list.map((s) => PHASE_RANK[s.phase]);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it('sets foundations before standing any leg', () => {
    const f = steps.findIndex((s) => s.phase === 'foundation');
    const l = steps.findIndex((s) => s.phase === 'legs');
    expect(f).toBeGreaterThanOrEqual(0);
    expect(l).toBeGreaterThan(f);
  });

  it('mounts modules only after the frame that carries them', () => {
    const purlins = steps.findIndex((s) => s.phase === 'purlins');
    const modules = steps.findIndex((s) => s.phase === 'modules');
    if (purlins >= 0) expect(modules).toBeGreaterThan(purlins);
  });

  it('wires strings only after the modules are up', () => {
    const modules = steps.findIndex((s) => s.phase === 'modules');
    const stringing = steps.findIndex((s) => s.phase === 'stringing');
    expect(stringing).toBeGreaterThan(modules);
  });

  it('finishes with balance of system', () => {
    expect(steps[steps.length - 1].phase).toBe('bos');
  });
});

describe('determinism', () => {
  it('the same design produces a byte-identical plan', () => {
    const p = structured();
    expect(installationPlan(p)).toEqual(installationPlan(p));
  });

  it('step ids are structural — no random ids, so ticks survive a reload', () => {
    const ids = installationPlan(structured()).map((s) => s.id);
    for (const id of ids) expect(id).toMatch(/\/install\//);
    expect(new Set(ids).size).toBe(ids.length); // unique
  });
});

describe('traceability — every step points at real design objects', () => {
  const steps = installationPlan(structured());

  it('each step names what it installs and how many', () => {
    for (const s of steps) {
      expect(s.count).toBeGreaterThan(0);
      expect(s.title.trim()).not.toBe('');
      expect(s.detail.trim()).not.toBe('');
    }
  });

  it('module and stringing steps focus the actual modules', () => {
    const mod = steps.find((s) => s.phase === 'modules')!;
    expect(mod.focusIds).toEqual(['m1', 'm2']);
    const str = steps.find((s) => s.phase === 'stringing')!;
    expect(str.focusIds).toEqual(['m1', 'm2']);
  });

  it('the balance-of-system step draws real BOM items', () => {
    const bos = steps.find((s) => s.phase === 'bos')!;
    expect(bos.materials.length).toBeGreaterThan(0);
  });
});

describe('loose modules are not forgotten', () => {
  it('panels outside any structure still get an install step', () => {
    const base = fixtureProject(0);
    const p: Project = {
      ...base,
      roofs: [roof('r1')],
      segments: [],
      panels: [{ ...panel('x', 'r1', 'none', 0, 0, 0), segmentId: undefined } as PlacedPanel],
      strings: [],
      components: { ...base.components, panel: SPEC },
    };
    const steps = installationPlan(p);
    expect(steps.some((s) => s.phase === 'modules' && s.count === 1)).toBe(true);
  });

  it('an empty project yields an empty plan — nothing to install', () => {
    const base = fixtureProject(0);
    expect(installationPlan({ ...base, roofs: [], segments: [], panels: [], strings: [] })).toEqual([]);
  });
});

describe('installProgress', () => {
  const steps = installationPlan(structured());

  it('counts nothing done on a fresh site', () => {
    expect(installProgress(steps, undefined)).toEqual({ done: 0, total: steps.length, pct: 0 });
  });

  it('counts ticked steps', () => {
    const state = { [steps[0].id]: true };
    expect(installProgress(steps, state).done).toBe(1);
  });

  it('is 100% when every step is ticked', () => {
    const state = Object.fromEntries(steps.map((s) => [s.id, true]));
    expect(installProgress(steps, state).pct).toBe(100);
  });

  it('does not divide by zero on an empty plan', () => {
    expect(installProgress([], {})).toEqual({ done: 0, total: 0, pct: 0 });
  });
});
