// ─── Gate: parametric mounting-structure model (Phase 7, §26) ────────────────
// Hand-computed member units, node-graph fastener counts, hole-gated runs,
// determinism (structural ids), unsupported-member validation and the lazy
// racking resolution chain (incl. the legacy backLegM=0.3 repair).
import { describe, it, expect } from 'vitest';
import type { ArraySegment, PlacedPanel, Project } from '../../types';
import {
  buildStructure,
  fastenerTotals,
  projectStructures,
  resolveRacking,
  validateStructure,
} from '../structure';
import { COL_STRIDE, DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { deriveBom } from '../bom';
import { fixtureProject, fixtureRoof } from './fixtures/project';

const PROFILE = { key: 'c_channel', label: 'C-Channel', kgPerM: 2.2 };

/** One-row test segment: portrait 2279×1134 panels along x, facing south. */
function rowSegment(cols: number[], over: Partial<ArraySegment> = {}) {
  const W = 1.134;
  const GAP = 0.05;
  const seg: ArraySegment = {
    id: 'seg_t',
    roofId: 'roof_1',
    label: 'A1',
    polygon: [],
    rows: 1,
    cols: Math.max(...cols) + 1,
    orientation: 'portrait',
    azimuthDeg: 180,
    racking: {
      kind: 'fixed_tilt',
      tiltDeg: 10,
      rowPitchM: 0,
      frontLegM: 0.3,
      backLegM: 0.3, // legacy value — resolveRacking must repair it
      profile: PROFILE,
    },
    moduleGapM: GAP,
    removed: [],
    ...over,
  };
  const panels: PlacedPanel[] = cols.map((col) => ({
    id: `pv_${col}`,
    roofId: 'roof_1',
    center: { x: col * (W + GAP), y: 0 },
    orientation: 'portrait',
    azimuthDeg: 180,
    tiltDeg: 10,
    solarAccess: 1,
    enabled: true,
    segmentId: 'seg_t',
    cellIndex: 0 * COL_STRIDE + col,
  }));
  return { seg, panels };
}

function testProject(): Project {
  const p = fixtureProject(0);
  return { ...p, roofs: [fixtureRoof()] };
}

const RISE = 2.279 * Math.sin((10 * Math.PI) / 180); // ≈ 0.3957 m

describe('resolveRacking — lazy chain + legacy repair', () => {
  it('repairs a persisted backLegM=0.3 at READ time (front + module rise)', () => {
    const p = testProject();
    const { seg } = rowSegment([0, 1, 2]);
    const r = resolveRacking(p, p.roofs[0], seg, p.components.panel!)!;
    expect(r.frontLegM).toBe(0.3);
    expect(r.backLegM).toBeCloseTo(0.3 + RISE, 3);
  });

  it('resolves segment → roof → project → built-ins, most specific wins', () => {
    const p = testProject();
    const { seg } = rowSegment([0]);
    const base = resolveRacking(p, p.roofs[0], seg, p.components.panel!)!;
    expect(base.legSpacingM).toBe(2.0); // built-in
    expect(base.foundation).toBe('concrete'); // D12: rooftop default is a PCC pedestal

    p.structureDefaults = { legSpacingM: 1.5, foundation: 'ballast' };
    const proj = resolveRacking(p, p.roofs[0], seg, p.components.panel!)!;
    expect(proj.legSpacingM).toBe(1.5);
    expect(proj.foundation).toBe('ballast');

    p.roofs[0] = { ...p.roofs[0], structureOverride: { legSpacingM: 2.5 } };
    const roof = resolveRacking(p, p.roofs[0], seg, p.components.panel!)!;
    expect(roof.legSpacingM).toBe(2.5);
    expect(roof.foundation).toBe('ballast'); // untouched fields fall through

    const segExplicit = {
      ...seg,
      racking: { ...seg.racking, legSpacingM: 3 } as ArraySegment['racking'],
    };
    expect(resolveRacking(p, p.roofs[0], segExplicit, p.components.panel!)!.legSpacingM).toBe(3);
  });

  it('clearance raises the effective front leg (walk-under preset semantics)', () => {
    const p = testProject();
    p.structureDefaults = { clearanceM: 2.2 };
    const { seg } = rowSegment([0]);
    const r = resolveRacking(p, p.roofs[0], seg, p.components.panel!)!;
    expect(r.frontLegM).toBe(2.2);
    expect(r.backLegM).toBeCloseTo(2.2 + RISE, 3);
  });

  it('returns null for flush racking — no structure model', () => {
    const p = testProject();
    const { seg } = rowSegment([0], { racking: { kind: 'flush' } });
    expect(resolveRacking(p, p.roofs[0], seg, p.components.panel!)).toBeNull();
  });
});

describe('buildStructure — hand-computed units', () => {
  function built(cols: number[] = [0, 1, 2]) {
    const p = testProject();
    const { seg, panels } = rowSegment(cols);
    const racking = resolveRacking(p, p.roofs[0], seg, p.components.panel!)!;
    return buildStructure(seg, p.components.panel!, p.roofs[0], racking, panels);
  }

  it('emits the expected member set for a 3-panel row (2 m leg spacing)', () => {
    const s = built();
    // runLen 3.502 m ⇒ 2 bays ⇒ 3 stations
    // D15: the default PCC pedestal is 150 mm tall and CONSUMES clearance, so
    // the steel leg spans (frontLegM − 0.15) and the module plane is unmoved.
    // Steel below 150 mm has been replaced by concrete, not added to.
    const FOUND_H = 0.15;
    expect(s.memberSummary.front_leg).toEqual({
      count: 3,
      totalM: expect.closeTo(3 * (0.3 - FOUND_H), 2),
    });
    expect(s.memberSummary.back_leg.count).toBe(3);
    expect(s.memberSummary.back_leg.totalM).toBeCloseTo(3 * (0.3 + RISE - FOUND_H), 2);
    expect(s.memberSummary.rafter.count).toBe(3);
    // rafter spans front-top → back-top: exactly the module's along-tilt dim
    expect(s.memberSummary.rafter.totalM).toBeCloseTo(3 * 2.279, 2);
    expect(s.memberSummary.purlin).toEqual({
      count: 2,
      totalM: expect.closeTo(2 * 3.502, 2),
    });
    expect(s.memberSummary.brace.count).toBe(2);
    // steel = Σ length × kgPerM, hand-summed. Both leg runs start ON the
    // pedestal (D15), so 6 × 0.15 m of steel is concrete instead — the module
    // plane is identical either way.
    const totalM =
      3 * (0.3 - FOUND_H) +
      3 * (0.3 + RISE - FOUND_H) +
      3 * 2.279 +
      2 * 3.502 +
      s.memberSummary.brace.totalM;
    expect(s.steelKg).toBeCloseTo(totalM * 2.2, 1);
  });

  it('counts fasteners from the node graph (hand-computed)', () => {
    const s = built();
    const t = fastenerTotals([s]);
    // 6 legs: anchors 2×6, plates 6; leg_rafter 6 → 12 bolts;
    // rafter_purlin 6 → 6 bolts; 2 braces → 4 brace_bolt → 4 bolts
    expect(t.anchors).toBe(12);
    expect(t.plates).toBe(6);
    expect(t.bolts).toBe(12 + 6 + 4);
    // clamps: per purlin 2 ends + 2 mids = 4; × 2 purlins
    expect(t.clamps).toBe(8);
  });

  it('is deterministic — identical inputs give identical graphs with structural ids', () => {
    const a = built();
    const b = built();
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.members[0].id).toBe('seg_t/m/front_leg/0');
    expect(a.nodes[0].id).toMatch(/^seg_t\/n\//);
  });

  it('holes split runs — no member ever spans an absent module', () => {
    const s = built([0, 1, 3, 4]); // col 2 removed
    // two runs of 2 panels ⇒ 4 purlins of 2.318 m, never one 5-panel span
    expect(s.memberSummary.purlin.count).toBe(4);
    for (const m of s.members.filter((m) => m.kind === 'purlin')) {
      expect(m.lengthM).toBeCloseTo(2 * 1.134 + 0.05, 2);
    }
    // each run gets its own legs: runLen 2.318 ⇒ ceil(2.318/2)=2 bays ⇒ 3
    // stations per run ⇒ 3+3 front legs across the two runs
    expect(s.memberSummary.front_leg.count).toBe(6);
  });

  it('flags dual-tilt as approximate (v1 topology punt, honestly labeled)', () => {
    const p = testProject();
    const { seg, panels } = rowSegment([0, 1]);
    seg.racking = { ...seg.racking, kind: 'dual_tilt' } as ArraySegment['racking'];
    const racking = resolveRacking(p, p.roofs[0], seg, p.components.panel!)!;
    const s = buildStructure(seg, p.components.panel!, p.roofs[0], racking, panels);
    expect(s.warnings.some((w) => w.includes('Dual-tilt'))).toBe(true);
  });
});

describe('validateStructure — unsupported-member DRC', () => {
  it('a generated graph is always complete', () => {
    const p = testProject();
    const { seg, panels } = rowSegment([0, 1, 2]);
    const racking = resolveRacking(p, p.roofs[0], seg, p.components.panel!)!;
    const s = buildStructure(seg, p.components.panel!, p.roofs[0], racking, panels);
    expect(validateStructure(s)).toHaveLength(0);
  });

  it('flags members whose required nodes are missing', () => {
    const p = testProject();
    const { seg, panels } = rowSegment([0]);
    const racking = resolveRacking(p, p.roofs[0], seg, p.components.panel!)!;
    const s = buildStructure(seg, p.components.panel!, p.roofs[0], racking, panels);
    const corrupted = { ...s, nodes: s.nodes.filter((n) => n.kind !== 'roof_anchor') };
    const issues = validateStructure(corrupted);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toMatch(/missing roof_anchor/);
  });
});

describe('fill + project integration', () => {
  it('fill-created segments now carry the correct backLegM (front + rise)', () => {
    const p = testProject();
    const filled = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, DEFAULT_FILL)!;
    const r = filled.segment.racking;
    expect(r.kind).toBe('fixed_tilt');
    if (r.kind !== 'flush') {
      expect(r.backLegM).toBeCloseTo(0.3 + RISE, 2); // was flat 0.3 pre-fix
    }
  });

  it('projectStructures builds one graph per elevated segment, none for flush', () => {
    const p = testProject();
    const filled = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, {
      ...DEFAULT_FILL,
      maxPanels: 6,
    })!;
    const project: Project = {
      ...p,
      segments: [filled.segment],
      panels: filled.panels,
    };
    const structs = projectStructures(project);
    expect(structs).toHaveLength(1);
    expect(structs[0].steelKg).toBeGreaterThan(0);
    expect(validateStructure(structs[0])).toHaveLength(0);

    const flush: Project = {
      ...project,
      segments: [{ ...filled.segment, racking: { kind: 'flush' } }],
    };
    expect(projectStructures(flush)).toHaveLength(0);
  });
});

describe('review remediation pins', () => {
  it('a structured segment on a METAL SHED bills only the member model (disjoint buckets)', () => {
    const p = testProject();
    p.roofs = [fixtureRoof({ roofType: 'metal_shed' })];
    const filled = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, {
      ...DEFAULT_FILL,
      maxPanels: 6,
    })!;
    // metal sheds fill flush — switch to elevated like the Racking button does
    const seg = {
      ...filled.segment,
      racking: {
        kind: 'fixed_tilt' as const,
        tiltDeg: 10,
        rowPitchM: 0,
        frontLegM: 0.3,
        backLegM: 0.7,
        profile: PROFILE,
      },
    };
    const project: Project = { ...p, segments: [seg], panels: filled.panels };
    const bom = deriveBom(project);
    expect(bom.some((l) => l.item.startsWith('Structure Steel'))).toBe(true);
    // NOT double-billed as metal-shed clamp sets, and no negative-bucket fallout
    expect(bom.some((l) => l.item === 'Mounting Structure (metal shed)')).toBe(false);
    expect(bom.some((l) => l.item === 'Mounting Structure (elevated RCC)')).toBe(false);
  });

  it('ballasted structures bill ballast blocks and stop claiming anchors', () => {
    const p = testProject();
    p.structureDefaults = { foundation: 'ballast' };
    const filled = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, {
      ...DEFAULT_FILL,
      maxPanels: 6,
    })!;
    const project: Project = { ...p, segments: [filled.segment], panels: filled.panels };
    const bom = deriveBom(project);
    const ballast = bom.find((l) => l.item === 'Ballast Blocks')!;
    expect(ballast).toBeDefined();
    expect(ballast.qty).toBeGreaterThan(0);
    const plates = bom.find((l) => l.item === 'Base Plates')!;
    expect(plates).toBeDefined();
    expect(plates.spec).not.toMatch(/anchor/i);
    expect(bom.some((l) => l.item === 'Base Plates + Anchors')).toBe(false);
  });

  it('no member model on pitched roofs — elevated racking falls back to flat lines', () => {
    const p = testProject();
    p.roofs = [fixtureRoof({ pitchDeg: 15 })];
    const { seg } = rowSegment([0, 1]);
    expect(resolveRacking(p, p.roofs[0], seg, p.components.panel!)).toBeNull();
  });
});

describe('structural-safety boundary (§26b)', () => {
  it('engineeringStatus defaults to PRELIMINARY and flips only on explicit sign-off', async () => {
    const { engineeringStatus } = await import('../structure');
    const p = testProject();
    expect(engineeringStatus(p).approved).toBe(false);
    expect(engineeringStatus(p).label).toMatch(/PRELIMINARY/);
    const signed: Project = {
      ...p,
      structuralVerification: { status: 'engineer_approved', notes: 'Verified by S. Rao' },
    };
    expect(engineeringStatus(signed).approved).toBe(true);
    expect(engineeringStatus(signed).notes).toBe('Verified by S. Rao');
  });

  it('windZoneInfo flags high-wind states, is silent for unknown ones, never calculates', async () => {
    const { windZoneInfo } = await import('../structure');
    expect(windZoneInfo('Gujarat').high).toBe(true);
    expect(windZoneInfo('Gujarat').label).toMatch(/verification mandatory/);
    expect(windZoneInfo('Karnataka').high).toBe(false);
    expect(windZoneInfo('Atlantis')).toEqual({ speedMs: null, high: false, label: null });
  });

  it('the CSV export carries the disclaimer whenever structure lines exist', async () => {
    const { bomToCsv } = await import('../bom');
    const { STRUCTURE_DISCLAIMER } = await import('../structure');
    const p = testProject();
    const filled = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, {
      ...DEFAULT_FILL,
      maxPanels: 6,
    })!;
    const structured: Project = { ...p, segments: [filled.segment], panels: filled.panels };
    expect(bomToCsv(deriveBom(structured))).toContain(STRUCTURE_DISCLAIMER);
    // no structure ⇒ no structure footnote
    const loose = { ...p, panels: filled.panels.map((x) => ({ ...x, segmentId: undefined })) };
    const csv = bomToCsv(deriveBom(loose));
    expect(csv.split(STRUCTURE_DISCLAIMER).length - 1).toBeLessThanOrEqual(2); // flat-line formulas only
  });
});

describe('fingerprint stability (the capture-stale guard)', () => {
  it('absent structure defaults change NO fingerprint; setting them bumps designFp only', async () => {
    const { designFp, layoutFp } = await import('../fingerprints');
    const p = testProject();
    const base = designFp(p);
    // explicit undefined must serialize identically to the field being absent
    expect(designFp({ ...p, structureDefaults: undefined })).toBe(base);
    const withDefaults = { ...p, structureDefaults: { legSpacingM: 1.5 } };
    expect(designFp(withDefaults)).not.toBe(base);
    expect(layoutFp(withDefaults)).toBe(layoutFp(p)); // captures stay fresh
  });
});

describe('BOM integration — tonnage replaces flat structure lines', () => {
  function structuredProject(): Project {
    const p = testProject();
    const filled = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, {
      ...DEFAULT_FILL,
      maxPanels: 8,
    })!;
    return { ...p, segments: [filled.segment], panels: filled.panels };
  }

  it('structured segments get a per-profile steel line with member breakdown + disclaimer', () => {
    const bom = deriveBom(structuredProject());
    const steel = bom.find((l) => l.item.startsWith('Structure Steel'))!;
    expect(steel).toBeDefined();
    expect(steel.unit).toBe('kg');
    expect(steel.qty).toBeGreaterThan(10);
    expect(steel.item).toContain('C-Channel');
    expect(steel.formula).toMatch(/legs .*rafters .*purlins/);
    expect(steel.formula).toContain('certified engineer verification');
    // fastener lines from the node graph
    expect(bom.some((l) => l.item === 'Base Plates + Anchors')).toBe(true);
    expect(bom.some((l) => l.item === 'Structure Bolts (M10 SS)')).toBe(true);
    // the flat per-panel RCC line must NOT double-bill structured panels
    expect(bom.some((l) => l.item === 'Mounting Structure (elevated RCC)')).toBe(false);
    // rails are purlins now — no separate rail line for structured panels
    expect(bom.some((l) => l.item === 'Mounting Rail')).toBe(false);
    // clamps come from the node graph
    const clamps = bom.find((l) => l.item === 'Mid + End Clamps')!;
    expect(clamps.formula).toContain('node graph');
  });

  it('loose panels keep the flat line; metal-shed rails are never double-billed', () => {
    const p = fixtureProject(8); // loose panels, no segments
    p.roofs = [fixtureRoof()];
    const bom = deriveBom(p);
    expect(bom.some((l) => l.item === 'Mounting Structure (elevated RCC)')).toBe(true);
    expect(bom.some((l) => l.item.startsWith('Structure Steel'))).toBe(false);
    const rail = bom.find((l) => l.item === 'Mounting Rail')!;
    expect(rail.qty).toBeGreaterThan(0);

    const metal = { ...p, roofs: [fixtureRoof({ roofType: 'metal_shed' })] };
    const metalBom = deriveBom(metal);
    // all panels on metal shed: clamp line bundles mini-rails, NO rail line
    expect(metalBom.some((l) => l.item === 'Mounting Rail')).toBe(false);
    expect(metalBom.some((l) => l.item === 'Mounting Structure (metal shed)')).toBe(true);
  });
});
