// ─── Phase 22k gates: the three foundation design-rule checks ───────────────
// Each check gets a passing AND a failing layout — a check that only ever fires
// (or never fires) proves nothing.
import { describe, expect, it } from 'vitest';
import { structureIssues } from '../drc';
import { ruleFor } from '../foundation';
import { STRUCTURE_PROFILES } from '../../data/profiles';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type {
  ArraySegment,
  Keepout,
  Obstruction,
  PanelSpec,
  PlacedPanel,
  Project,
  Roof,
  Walkway,
} from '../../types';

const SPEC: PanelSpec = {
  id: 'p', brand: 'T', model: 'M', watt: 550, tech: 'TOPCon',
  lengthMm: 2278, widthMm: 1134, vocV: 49, vmpV: 41, iscA: 14, impA: 13.5,
  tempCoeffVocPct: -0.25, almm: true, dcr: true, priceInr: 12000,
  warrantyYears: 25, weightKg: 27, availability: 'in_stock',
};

const rect = (cx: number, cy: number, w: number, h: number) => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

const ROOF: Roof = fixtureRoof({ id: 'r1', name: 'Roof 1', polygon: rect(0, 0, 24, 18) });

function seg(over: Partial<ArraySegment> = {}): ArraySegment {
  return {
    id: 'seg_1', roofId: 'r1', label: 'A1', polygon: rect(0, 0, 12, 8),
    rows: 2, cols: 4, orientation: 'portrait', azimuthDeg: 180,
    racking: {
      kind: 'fixed_tilt', tiltDeg: 10, rowPitchM: 3,
      frontLegM: 0.3, backLegM: 0.7, profile: STRUCTURE_PROFILES[0],
    },
    moduleGapM: 0.05, removed: [],
    ...over,
  };
}

function panels(): PlacedPanel[] {
  const out: PlacedPanel[] = [];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 4; c++)
      out.push({
        id: `pv_${r}_${c}`, roofId: 'r1', segmentId: 'seg_1', cellIndex: r * 1000 + c,
        center: { x: -3 + c * 1.184, y: -1.5 + r * 3 },
        orientation: 'portrait', azimuthDeg: 180, tiltDeg: 10, solarAccess: 1, enabled: true,
      });
  return out;
}

function project(over: Partial<Project> = {}): Project {
  return {
    ...fixtureProject(0),
    roofs: [ROOF],
    segments: [seg()],
    panels: panels(),
    ...over,
  };
}

const codes = (p: Project) => structureIssues(p, SPEC).map((i) => i.code);
const find = (p: Project, code: string) => structureIssues(p, SPEC).find((i) => i.code === code);

describe('1 — added dead load is never added silently', () => {
  it('warns, and states the total', () => {
    const iss = find(project(), 'foundation_dead_load')!;
    expect(iss).toBeDefined();
    expect(iss.level).toBe('warn');
    // 8 panels ⇒ 2 runs × 3 stations × 2 legs = 12 pedestals × ~32 kg
    expect(iss.message).toMatch(/\d+ kg/);
    expect(iss.message).toMatch(/roof capacity is NOT checked/i);
  });

  it('does NOT fire when the foundation adds no mass', () => {
    const p = project({
      segments: [seg({ racking: { ...seg().racking, foundation: 'anchor' } as ArraySegment['racking'] })],
    });
    expect(codes(p)).not.toContain('foundation_dead_load');
  });

  it('does NOT fire on a ground array — there is no slab to overload', () => {
    const ground: Roof = fixtureRoof({
      id: 'r1', name: 'Ground', polygon: rect(0, 0, 24, 18), roofType: 'ground', heightM: 0,
    });
    expect(codes(project({ roofs: [ground] }))).not.toContain('foundation_dead_load');
  });
});

describe('2 — a foundation cannot be built inside something', () => {
  it('clean roof produces no clash', () => {
    expect(codes(project())).not.toContain('foundation_clash');
  });

  it('errors when a footing lands in a no-build zone', () => {
    const k: Keepout = { id: 'k1', roofId: 'r1', shape: rect(0, -1.5, 10, 3), heightM: 0, kind: 'fire_setback' };
    const iss = find(project({ keepouts: [k] }), 'foundation_clash')!;
    expect(iss).toBeDefined();
    expect(iss.level).toBe('error');
    expect(iss.message).toMatch(/no-build zone/);
  });

  // Legs sit at the module centre ± plan-depth/2, i.e. y ≈ −2.62 / −0.38 for
  // the front row — NOT at the module centre. A walkway laid down the middle of
  // a row misses every footing, which is why this runs along the leg line.
  it('errors when a footing lands in a walkway', () => {
    const onLegLine: Walkway = {
      id: 'w1', roofId: 'r1', a: { x: -6, y: -2.62 }, b: { x: 6, y: -2.62 },
      widthMm: 900, heightMm: 0,
    };
    expect(find(project({ walkways: [onLegLine] }), 'foundation_clash')?.message).toMatch(/walkway/);
  });

  it('a walkway laid BETWEEN the leg lines is fine', () => {
    const clear: Walkway = {
      id: 'w2', roofId: 'r1', a: { x: -6, y: -1.5 }, b: { x: 6, y: -1.5 },
      widthMm: 900, heightMm: 0,
    };
    expect(codes(project({ walkways: [clear] }))).not.toContain('foundation_clash');
  });

  // The distinction that matters: §26c lets a PANEL span above an obstruction.
  // A pedestal cannot be cast inside one, so this check ignores bridging.
  it('errors on an obstruction even though a panel may legally bridge it', () => {
    const o: Obstruction = {
      id: 'o1', type: 'tank', label: 'WT1', roofId: 'r1',
      center: { x: -3, y: -2.62 }, shape: 'rect', lengthM: 2, widthM: 2, diameterM: 2,
      heightM: 1.2, rotationDeg: 0, setbackM: 0.3, castsShadow: true,
      blocksPlacement: false, // bridgeable — panels may cross it
    };
    const iss = find(project({ obstructions: [o] }), 'foundation_clash')!;
    expect(iss).toBeDefined();
    expect(iss.message).toMatch(/WT1/);
    expect(iss.message).toMatch(/cannot be cast in one/);
  });
});

describe('3 — a foundation taller than its clearance is flagged, not clamped', () => {
  it('the default 150 mm pedestal fits inside 300 mm of clearance', () => {
    expect(codes(project())).not.toContain('foundation_too_tall');
  });

  it('errors when the clearance leaves no buildable steel leg', () => {
    const tight = seg({
      racking: { ...seg().racking, frontLegM: 0.15, backLegM: 0.55 } as ArraySegment['racking'],
    });
    const iss = find(project({ segments: [tight] }), 'foundation_too_tall')!;
    expect(iss).toBeDefined();
    expect(iss.level).toBe('error');
    expect(iss.message).toMatch(/no.*buildable steel leg/i);
  });

  it('an anchor never triggers it — it occupies no height', () => {
    const tight = seg({
      racking: {
        ...seg().racking, frontLegM: 0.15, backLegM: 0.55, foundation: 'anchor',
      } as ArraySegment['racking'],
    });
    expect(codes(project({ segments: [tight] }))).not.toContain('foundation_too_tall');
  });

  it('the rule config is what decides, not a magic number', () => {
    expect(ruleFor('concrete').heightMm).toBeGreaterThan(0);
    expect(ruleFor('anchor').heightMm).toBe(0);
  });
});

describe('the checks stay quiet when there is nothing to check', () => {
  it('no spec ⇒ no issues', () => {
    expect(structureIssues(project(), null)).toEqual([]);
  });

  it('no structures ⇒ no issues', () => {
    expect(structureIssues(project({ segments: [], panels: [] }), SPEC)).toEqual([]);
  });
});
