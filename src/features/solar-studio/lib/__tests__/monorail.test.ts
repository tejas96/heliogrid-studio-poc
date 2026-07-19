// ─── Phase 22h gates: metal-shed monorail ───────────────────────────────────
// A shed carries no table. Modules lie flush on rails, and the rails sit on
// L-foot standoffs fixed through the sheet crown into the purlin below. The
// two numbers that decide the fixing count and whether it lands on steel are
// both ASSUMED, so they are surfaced rather than presented as derived.
import { describe, expect, it } from 'vitest';
import {
  projectStructures,
  topologyOf,
  validateStructure,
  fastenerTotals,
} from '../structure';
import { foundationOptionsFor } from '../structure-view';
import { deriveBom } from '../bom';
import { resolveRules } from '../../data/rules/india';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { ArraySegment, PlacedPanel, Project, Roof } from '../../types';

const W = 1.134;
const GAP = 0.05;
const RULES = resolveRules();

function shedProject(opts: {
  cells?: number[];
  flush?: boolean;
  roofType?: Roof['roofType'];
  purlinPitchM?: number;
} = {}): Project {
  const base = fixtureProject(0);
  const roof: Roof = {
    ...fixtureRoof(),
    roofType: opts.roofType ?? 'metal_shed',
    heightM: 6.5,
    pitchDeg: 0,
  };
  const cells = opts.cells ?? [0, 1, 2, 3];
  const seg: ArraySegment = {
    id: 'seg_t',
    roofId: roof.id,
    label: 'A1',
    polygon: [],
    rows: 1,
    cols: 8,
    orientation: 'portrait',
    azimuthDeg: 180,
    racking:
      opts.flush === false
        ? {
            kind: 'fixed_tilt',
            tiltDeg: 20,
            rowPitchM: 0,
            frontLegM: 0.3,
            backLegM: 0.3,
            profile: { key: 'c_channel', label: 'C-Channel', kgPerM: 2.2 },
          }
        : { kind: 'flush' },
    moduleGapM: GAP,
    removed: [],
  };
  const panels: PlacedPanel[] = cells.map((c) => ({
    id: `pv_${c}`,
    roofId: roof.id,
    center: { x: c * (W + GAP), y: 0 },
    orientation: 'portrait',
    azimuthDeg: 180,
    tiltDeg: 0,
    solarAccess: 1,
    enabled: true,
    segmentId: 'seg_t',
    cellIndex: c,
  }));
  return {
    ...base,
    roofs: [roof],
    segments: [seg],
    panels,
    ...(opts.purlinPitchM !== undefined
      ? { structureDefaults: { ...base.structureDefaults, purlinPitchM: opts.purlinPitchM } }
      : {}),
  };
}

const shed = (o?: Parameters<typeof shedProject>[0]) => projectStructures(shedProject(o))[0];
const of = (s: ReturnType<typeof shed>, k: string) => s.members.filter((m) => m.kind === k);
const standoffs = (s: ReturnType<typeof shed>) =>
  s.nodes.filter((n) => n.kind === 'sheet_standoff');

describe('topology dispatch', () => {
  const p = shedProject();
  it('a FLUSH segment on a metal shed is a monorail', () => {
    expect(topologyOf(p.roofs[0], p.segments[0])).toBe('sheet_monorail');
  });

  it('flush anywhere else stays flush — no member model', () => {
    const rcc = shedProject({ roofType: 'rcc_flat' });
    expect(topologyOf(rcc.roofs[0], rcc.segments[0])).toBe('flush');
    expect(projectStructures(rcc)).toHaveLength(0);
  });

  it('a TILTED table on a shed is still an elevated table', () => {
    const tilted = shedProject({ flush: false });
    expect(topologyOf(tilted.roofs[0], tilted.segments[0])).toBe('elevated_table');
  });
});

describe('what a monorail is made of', () => {
  it('rails and standoffs, and none of the table members', () => {
    const s = shed();
    expect(of(s, 'rail').length).toBeGreaterThan(0);
    expect(standoffs(s).length).toBeGreaterThan(0);
    for (const kind of ['front_leg', 'back_leg', 'rafter', 'purlin', 'brace']) {
      expect(of(s, kind), kind).toHaveLength(0);
    }
  });

  it('two rails per run — the pair a flush module clamps to', () => {
    expect(of(shed(), 'rail')).toHaveLength(2);
  });

  it('validates — a rail without a standoff would be resting on nothing', () => {
    expect(validateStructure(shed())).toEqual([]);
  });

  it('every rail carries clamps at its ends', () => {
    const s = shed();
    for (const rail of of(s, 'rail')) {
      const ends = s.nodes.filter(
        (n) => n.kind === 'panel_clamp_end' && n.memberIds.includes(rail.id),
      );
      expect(ends, rail.id).toHaveLength(2);
    }
  });

  it('rails sit ABOVE the sheet, on their standoffs', () => {
    const s = shed();
    const railZ = of(s, 'rail')[0].a.z;
    const footZ = standoffs(s)[0].position.z;
    expect(railZ).toBeGreaterThan(footZ); // lifted clear of the crown
    expect(footZ).toBeCloseTo(6.5, 6); // the fixing is AT the sheet
  });

  it('every fixing carries its sealing washer — each one is a hole in a roof', () => {
    for (const n of standoffs(shed())) {
      expect(n.fastenerSpec.standoffs).toBe(1);
      expect(n.fastenerSpec.sealingWashers).toBe(1);
      expect(n.fastenerSpec.bolts).toBe(2);
    }
  });

  it('a hole splits the row into two independently railed runs', () => {
    expect(of(shed({ cells: [0, 1, 3, 4] }), 'rail')).toHaveLength(4);
  });
});

describe('standoff count follows the ASSUMED purlin pitch', () => {
  it('scales with panel count', () => {
    const few = standoffs(shed({ cells: [0, 1] })).length;
    const many = standoffs(shed({ cells: [0, 1, 2, 3, 4, 5, 6, 7] })).length;
    expect(many).toBeGreaterThan(few);
  });

  it('scales INVERSELY with the pitch — tighter purlins, more fixings', () => {
    const wide = standoffs(shed({ purlinPitchM: 3 })).length;
    const tight = standoffs(shed({ purlinPitchM: 0.8 })).length;
    expect(tight).toBeGreaterThan(wide);
  });

  it('never fewer than the floor, however wide the pitch (E15)', () => {
    // a rail on a single foot is a lever, and the arithmetic will ask for that
    // on a short run with wide purlins
    const s = shed({ cells: [0], purlinPitchM: 50 });
    for (const rail of of(s, 'rail')) {
      const feet = s.nodes.filter(
        (n) => n.kind === 'sheet_standoff' && n.memberIds.includes(rail.id),
      );
      expect(feet.length).toBeGreaterThanOrEqual(RULES.sheet.minStandoffsPerRail);
    }
  });

  it('a roof-level override beats the rule default', () => {
    const p = shedProject();
    const overridden: Project = {
      ...p,
      roofs: [{ ...p.roofs[0], structureOverride: { purlinPitchM: 0.5 } }],
    };
    expect(standoffs(projectStructures(overridden)[0]).length).toBeGreaterThan(
      standoffs(shed()).length,
    );
  });

  it('fastenerTotals counts the standoffs and washers', () => {
    const t = fastenerTotals([shed()]);
    expect(t.standoffs).toBe(standoffs(shed()).length);
    expect(t.sealingWashers).toBe(standoffs(shed()).length);
  });
});

describe('the numbers we cannot measure say so', () => {
  it('warns that BOTH the purlin pitch and the rib pitch are assumed', () => {
    const w = shed().warnings.join(' ');
    expect(w).toMatch(/ASSUMED/);
    expect(w).toMatch(/purlin/i);
    expect(w).toMatch(/rib/i);
    // the consequence, not just the label: a wrong rib pitch misses the steel
    expect(w).toMatch(/crown|valley/i);
  });
});

describe('no foundation on a shed (E1)', () => {
  it('a monorail is offered no foundation at all', () => {
    const p = shedProject();
    expect(foundationOptionsFor(p.roofs[0], p.segments[0])).toEqual([]);
  });

  it('a TILTED table on a shed is offered anchors only — never a cast pedestal', () => {
    const p = shedProject({ flush: false });
    expect(foundationOptionsFor(p.roofs[0], p.segments[0])).toEqual(['anchor']);
  });

  it('and it DEFAULTS to an anchor, not the rooftop pedestal', () => {
    // the live defect: a shed inherited the rooftop default and rendered
    // concrete blocks on corrugated steel, with dead load to match
    const s = projectStructures(shedProject({ flush: false }))[0];
    expect(s.foundation).toBe('anchor');
  });

  it('a flat RCC roof still defaults to the pedestal', () => {
    const p = shedProject({ flush: false, roofType: 'rcc_flat' });
    expect(projectStructures(p)[0].foundation).toBe('concrete');
  });
});

describe('BOM: the member model REPLACES the per-panel line (no double count)', () => {
  it('a monorail shed bills no flat per-panel metal-shed line', () => {
    const lines = deriveBom(shedProject());
    const perPanel = lines.find((l) => l.id.startsWith('mech.mms_metal_shed'));
    expect(perPanel).toBeUndefined();
  });

  it('a shed with NO member model keeps its honest per-panel line', () => {
    // flush on a shed is a monorail, so force the no-model case: an unsegmented
    // panel on a shed roof still needs its flat clamp line
    const p = shedProject();
    const loose: Project = {
      ...p,
      segments: [],
      panels: p.panels.map((x) => ({ ...x, segmentId: undefined })),
    };
    const lines = deriveBom(loose);
    expect(lines.find((l) => l.id.startsWith('mech.mms_metal_shed'))).toBeDefined();
  });

  it('the rails are priced as real steel', () => {
    expect(shed().steelKg).toBeGreaterThan(0);
  });
});
