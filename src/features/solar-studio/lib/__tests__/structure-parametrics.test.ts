// ─── Phase 22g gates: the structure is parametric ───────────────────────────
// Byte-identity for an untouched segment is pinned separately by
// structure-golden.test.ts. These pin what each new field actually DOES, and
// — just as important — what it leaves alone.
import { describe, expect, it } from 'vitest';
import { buildStructure, resolveRacking, validateStructure } from '../structure';
import { STRUCTURE_PROFILES } from '../../data/profiles';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { ArraySegment, PlacedPanel, Project, RackingSpec, StructureProfile } from '../../types';

const W = 1.134;
const GAP = 0.05;
const BASE = STRUCTURE_PROFILES[0];

function build(racking: Partial<RackingSpec> = {}, cells = [0, 1, 2, 3]) {
  const base = fixtureProject(0);
  const project: Project = {
    ...base,
    roofs: [fixtureRoof()],
    structureDefaults: { ...base.structureDefaults, foundation: 'anchor' },
  };
  const seg: ArraySegment = {
    id: 'seg_t',
    roofId: 'roof_1',
    label: 'A1',
    polygon: [],
    rows: 1,
    cols: 8,
    orientation: 'portrait',
    azimuthDeg: 180,
    racking: {
      kind: 'fixed_tilt',
      tiltDeg: 10,
      rowPitchM: 0,
      frontLegM: 0.3,
      backLegM: 0.3,
      profile: BASE,
      ...racking,
    } as RackingSpec,
    moduleGapM: GAP,
    removed: [],
  };
  const panels: PlacedPanel[] = cells.map((c) => ({
    id: `pv_${c}`,
    roofId: 'roof_1',
    center: { x: c * (W + GAP), y: 0 },
    orientation: 'portrait',
    azimuthDeg: 180,
    tiltDeg: 10,
    solarAccess: 1,
    enabled: true,
    segmentId: 'seg_t',
    cellIndex: c,
  }));
  const r = resolveRacking(project, project.roofs[0], seg, project.components.panel!)!;
  return buildStructure(seg, project.components.panel!, project.roofs[0], r, panels);
}

const of = (s: ReturnType<typeof build>, kind: string) => s.members.filter((m) => m.kind === kind);
const len = (s: ReturnType<typeof build>, kind: string) =>
  of(s, kind).reduce((a, m) => a + m.lengthM, 0);

describe('purlinCount', () => {
  it('defaults to 2 — the front and back module edges', () => {
    expect(of(build(), 'purlin')).toHaveLength(2);
  });

  it('3 adds exactly one purlin per run', () => {
    expect(of(build({ purlinCount: 3 }), 'purlin')).toHaveLength(3);
  });

  it('the extra purlin sits BETWEEN the others in Z, on the tilted rafter', () => {
    // a mid purlin at the front height would float above the rafter; at the
    // back height it would cut through it. It has to be interpolated.
    const zs = of(build({ purlinCount: 3 }), 'purlin')
      .map((m) => m.a.z)
      .sort((a, b) => a - b);
    expect(zs).toHaveLength(3);
    expect(zs[1]).toBeGreaterThan(zs[0]);
    expect(zs[1]).toBeLessThan(zs[2]);
    expect(zs[1]).toBeCloseTo((zs[0] + zs[2]) / 2, 6); // evenly spaced
  });

  it('is interpolated in XY too — it lands on the rafter span', () => {
    const p = of(build({ purlinCount: 3 }), 'purlin');
    const ys = p.map((m) => m.a.y).sort((a, b) => a - b);
    expect(ys[1]).toBeCloseTo((ys[0] + ys[2]) / 2, 6);
  });

  it('each purlin gets its own support and clamp nodes', () => {
    const s = build({ purlinCount: 3 });
    for (const purlin of of(s, 'purlin')) {
      const supports = s.nodes.filter(
        (n) => n.kind === 'rafter_purlin' && n.memberIds.includes(purlin.id),
      );
      expect(supports.length, purlin.id).toBeGreaterThan(0);
    }
    expect(validateStructure(s)).toEqual([]);
  });

  it('does not disturb legs or rafters', () => {
    const a = build();
    const b = build({ purlinCount: 4 });
    expect(of(b, 'front_leg')).toHaveLength(of(a, 'front_leg').length);
    expect(of(b, 'rafter')).toHaveLength(of(a, 'rafter').length);
  });
});

describe('endBufferM — overhang past the end legs', () => {
  // Only the RUN-AXIS members can overhang: a rafter spans front-to-back and
  // its length comes from the module depth, not from runLen. The plan groups
  // "rafters/purlins" but the run-axis buffer is a purlin concern.
  it('lengthens every purlin by twice the buffer', () => {
    const a = build();
    const b = build({ endBufferM: 0.2 });
    expect(len(b, 'purlin')).toBeCloseTo(len(a, 'purlin') + 0.4 * of(a, 'purlin').length, 3);
  });

  it('leaves legs exactly where they were', () => {
    const a = build();
    const b = build({ endBufferM: 0.2 });
    expect(of(b, 'front_leg').map((m) => m.a)).toEqual(of(a, 'front_leg').map((m) => m.a));
    expect(of(b, 'back_leg').map((m) => m.a)).toEqual(of(a, 'back_leg').map((m) => m.a));
  });

  it('leaves rafter lengths untouched — they span the module, not the run', () => {
    expect(len(build({ endBufferM: 0.2 }), 'rafter')).toBeCloseTo(len(build(), 'rafter'), 6);
  });

  it('zero is the default and changes nothing', () => {
    expect(len(build({ endBufferM: 0 }), 'purlin')).toBeCloseTo(len(build(), 'purlin'), 6);
  });
});

describe('bracing', () => {
  it('braces by default', () => {
    expect(of(build(), 'brace').length).toBeGreaterThan(0);
  });

  it('false removes the braces AND their bolts, and still validates', () => {
    const s = build({ bracing: false });
    expect(of(s, 'brace')).toHaveLength(0);
    // a brace_bolt with no brace would price hardware for a member that is not
    // there, and would fail validation
    expect(s.nodes.filter((n) => n.kind === 'brace_bolt')).toHaveLength(0);
    expect(validateStructure(s)).toEqual([]);
  });

  it('removing bracing lowers the steel mass', () => {
    expect(build({ bracing: false }).steelKg).toBeLessThan(build().steelKg);
  });

  it('true is the same as absent', () => {
    expect(build({ bracing: true }).steelKg).toBe(build().steelKg);
  });
});

describe('rafter density', () => {
  it('defaults to one rafter per leg station', () => {
    const s = build();
    const stations = of(s, 'front_leg').length;
    expect(of(s, 'rafter')).toHaveLength(stations);
  });

  it('an explicit rafterCount is honoured and stays supported', () => {
    const s = build({ rafterCount: 5 });
    expect(of(s, 'rafter')).toHaveLength(5);
    expect(validateStructure(s)).toEqual([]);
  });

  it('a multiplier scales the station count', () => {
    const stations = of(build(), 'front_leg').length;
    const s = build({ rafterMultiplier: 2 });
    expect(of(s, 'rafter')).toHaveLength(stations * 2);
    expect(validateStructure(s)).toEqual([]);
  });

  it('multiplier 1 is the same as absent', () => {
    expect(build({ rafterMultiplier: 1 }).steelKg).toBe(build().steelKg);
  });

  it('never drops below one rafter, whatever the input', () => {
    for (const r of [{ rafterCount: 0 }, { rafterMultiplier: 0 }, { rafterCount: -3 }]) {
      const s = build(r as Partial<RackingSpec>);
      expect(of(s, 'rafter').length, JSON.stringify(r)).toBeGreaterThanOrEqual(1);
      expect(validateStructure(s), JSON.stringify(r)).toEqual([]);
    }
  });

  it('more rafters means more steel', () => {
    expect(build({ rafterMultiplier: 2 }).steelKg).toBeGreaterThan(build().steelKg);
  });
});

describe('per-member-class profiles', () => {
  const HEAVY: StructureProfile =
    STRUCTURE_PROFILES.find((p) => p.kgPerM > BASE.kgPerM) ?? { ...BASE, key: 'heavy', kgPerM: BASE.kgPerM * 2 };

  it('a class-specific section is stamped on those members only', () => {
    const s = build({ profiles: { legs: HEAVY } } as Partial<RackingSpec>);
    for (const m of of(s, 'front_leg')) expect(m.profileKey).toBe(HEAVY.key);
    for (const m of of(s, 'back_leg')) expect(m.profileKey).toBe(HEAVY.key);
    for (const m of of(s, 'rafter')) expect(m.profileKey).toBe(BASE.key);
    for (const m of of(s, 'purlin')) expect(m.profileKey).toBe(BASE.key);
  });

  it('mass is summed PER MEMBER against its own section', () => {
    const s = build({ profiles: { legs: HEAVY } } as Partial<RackingSpec>);
    const expected =
      (len(s, 'front_leg') + len(s, 'back_leg')) * HEAVY.kgPerM +
      (len(s, 'rafter') + len(s, 'purlin') + len(s, 'brace')) * BASE.kgPerM;
    expect(s.steelKg).toBeCloseTo(Math.round(expected * 1000) / 1000, 2);
  });

  it('a heavier leg raises the mass; the single-profile sum would miss it', () => {
    const s = build({ profiles: { legs: HEAVY } } as Partial<RackingSpec>);
    expect(s.steelKg).toBeGreaterThan(build().steelKg);
  });

  it('an unset class falls back to the table profile', () => {
    const s = build({ profiles: { rafters: HEAVY } } as Partial<RackingSpec>);
    for (const m of of(s, 'front_leg')) expect(m.profileKey).toBe(BASE.key);
    for (const m of of(s, 'rafter')) expect(m.profileKey).toBe(HEAVY.key);
  });

  it('an empty profiles object is a no-op', () => {
    expect(build({ profiles: {} } as Partial<RackingSpec>).steelKg).toBe(build().steelKg);
  });
});

describe('combinations stay coherent', () => {
  it('every field at once still validates and is fully supported', () => {
    const s = build({
      purlinCount: 4,
      endBufferM: 0.25,
      bracing: false,
      rafterMultiplier: 2,
      profiles: { legs: STRUCTURE_PROFILES[1] },
    } as Partial<RackingSpec>);
    expect(validateStructure(s)).toEqual([]);
    expect(of(s, 'purlin')).toHaveLength(4);
    expect(of(s, 'brace')).toHaveLength(0);
    expect(s.steelKg).toBeGreaterThan(0);
  });

  it('a single-panel run survives every field', () => {
    const s = build(
      { purlinCount: 3, endBufferM: 0.3, rafterCount: 1, bracing: false } as Partial<RackingSpec>,
      [0],
    );
    expect(validateStructure(s)).toEqual([]);
    expect(Number.isFinite(s.steelKg)).toBe(true);
  });
});
