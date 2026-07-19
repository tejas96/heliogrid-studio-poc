// ─── Phase 22j gates: the MMS bill comes from the member graph ──────────────
// Every quantity here must be traceable to a member or a node, not to a
// per-panel rule of thumb. The failure this guards against is a BOM that looks
// derived while quietly being an estimate.
import { describe, expect, it } from 'vitest';
import { deriveBom } from '../bom';
import { fastenerTotals, projectStructures } from '../structure';
import { foundationVolumeM3, ruleFor } from '../foundation';
import { PRICE_BOOK } from '../../data/pricebook';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import { DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import type { ArraySegment, FoundationKind, PlacedPanel, Project, Roof } from '../../types';

/** A real filled table on a flat RCC roof. */
function tableProject(foundation: FoundationKind = 'concrete'): Project {
  const base = fixtureProject(0);
  const p: Project = { ...base, roofs: [fixtureRoof()] };
  const filled = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, {
    ...DEFAULT_FILL,
    maxPanels: 8,
  })!;
  return {
    ...p,
    segments: [filled.segment],
    panels: filled.panels,
    structureDefaults: { ...p.structureDefaults, foundation },
  };
}

/** A flush segment on a metal shed ⇒ monorail. */
function shedProject(): Project {
  const base = fixtureProject(0);
  const roof: Roof = { ...fixtureRoof(), roofType: 'metal_shed', heightM: 6.5, pitchDeg: 0 };
  const W = 1.134;
  const seg: ArraySegment = {
    id: 'seg_s',
    roofId: roof.id,
    label: 'S1',
    polygon: [],
    rows: 1,
    cols: 4,
    orientation: 'portrait',
    azimuthDeg: 180,
    racking: { kind: 'flush' },
    moduleGapM: 0.05,
    removed: [],
  };
  const panels: PlacedPanel[] = [0, 1, 2, 3].map((c) => ({
    id: `pv_${c}`,
    roofId: roof.id,
    center: { x: c * (W + 0.05), y: 0 },
    orientation: 'portrait',
    azimuthDeg: 180,
    tiltDeg: 0,
    solarAccess: 1,
    enabled: true,
    segmentId: 'seg_s',
    cellIndex: c,
  }));
  return { ...base, roofs: [roof], segments: [seg], panels };
}

const lineOf = (p: Project, key: string) => deriveBom(p).find((l) => l.id.startsWith(key));

describe('steel tonnage reconciles with the member graph', () => {
  it('the steel line kg equals the sum of the structures’ steelKg', () => {
    const p = tableProject();
    const steel = deriveBom(p).filter((l) => l.id.startsWith('mech.steel'));
    const modelled = projectStructures(p).reduce((s, st) => s + st.steelKg, 0);
    const billed = steel.reduce((s, l) => s + l.qty, 0);
    expect(billed).toBeCloseTo(Math.round(modelled * 10) / 10, 1);
  });

  it('the breakdown names the members the table ACTUALLY has', () => {
    const f = lineOf(tableProject(), 'mech.steel')!.formula;
    expect(f).toMatch(/legs/);
    expect(f).toMatch(/rafters/);
    expect(f).toMatch(/purlins/);
    expect(f).toContain('certified engineer verification');
  });

  it('the spec carries section, mass, grade and coating — not a database key', () => {
    const spec = lineOf(tableProject(), 'mech.steel')!.spec;
    expect(spec).toMatch(/kg\/m/);
    expect(spec).toMatch(/IS \d+/);
    expect(spec).toMatch(/HDG/);
    expect(spec).not.toMatch(/key /); // the internal profile key must not leak
  });
});

describe('clamps: mid and end are different parts (the dead endClamp price)', () => {
  const p = tableProject();

  it('both lines exist and come from the node graph', () => {
    expect(lineOf(p, 'mech.clamps_mid')).toBeDefined();
    expect(lineOf(p, 'mech.clamps_end')).toBeDefined();
  });

  it('an end clamp is priced as an end clamp', () => {
    // it used to be billed at midClamp, leaving endClamp unreferenced in the
    // price book and every end clamp quoted light
    expect(lineOf(p, 'mech.clamps_end')!.unitPriceInr).toBe(PRICE_BOOK.endClamp);
    expect(lineOf(p, 'mech.clamps_mid')!.unitPriceInr).toBe(PRICE_BOOK.midClamp);
    expect(PRICE_BOOK.endClamp).not.toBe(PRICE_BOOK.midClamp);
  });

  it('the split reconciles with the node graph totals', () => {
    const ft = fastenerTotals(projectStructures(p));
    const mid = lineOf(p, 'mech.clamps_mid')!.qty;
    const end = lineOf(p, 'mech.clamps_end')!.qty;
    expect(mid).toBeGreaterThanOrEqual(ft.clampsMid);
    expect(end).toBeGreaterThanOrEqual(ft.clampsEnd);
    expect(ft.clampsMid + ft.clampsEnd).toBe(ft.clamps); // the split is exhaustive
  });
});

describe('foundation lines follow the RESOLVED kind', () => {
  it('a pedestal bills concrete at the shape-correct volume', () => {
    const p = tableProject('concrete');
    const ped = lineOf(p, 'mech.pedestal')!;
    const ft = fastenerTotals(projectStructures(p));
    expect(ped.qty).toBe(ft.pedestals);
    expect(ped.confidence).toBe('assumed'); // size is nominal, never calculated

    const each = foundationVolumeM3(ruleFor('concrete'));
    expect(ped.formula).toContain((Math.round(each * ft.pedestals * 100) / 100).toString());
  });

  it('a circular pedestal is ~21% less concrete than a square one', () => {
    // π/4 — the reason shape is a parameter and not a cosmetic choice
    const sq = foundationVolumeM3(ruleFor('concrete', 'square'));
    const ci = foundationVolumeM3(ruleFor('concrete', 'circular'));
    expect(ci / sq).toBeCloseTo(Math.PI / 4, 2);
  });

  it('ballast bills blocks and never a required mass', () => {
    const p = tableProject('ballast');
    const b = lineOf(p, 'mech.ballast')!;
    expect(b.qty).toBe(fastenerTotals(projectStructures(p)).ballast);
    // §F: we do not compute the mass wind uplift would demand
    expect(b.formula).not.toMatch(/\bkg\b.*required|required.*\bkg\b/i);
  });

  it('switching kind switches the line — no stale pedestal on an anchored table', () => {
    expect(lineOf(tableProject('anchor'), 'mech.pedestal')).toBeUndefined();
    expect(lineOf(tableProject('concrete'), 'mech.pedestal')).toBeDefined();
  });
});

describe('metal-shed fixings are billed, not just modelled', () => {
  const p = shedProject();

  it('rail steel is billed — a flush segment used to be skipped entirely', () => {
    const steel = deriveBom(p).filter((l) => l.id.startsWith('mech.steel'));
    expect(steel.length).toBeGreaterThan(0);
    const modelled = projectStructures(p).reduce((s, st) => s + st.steelKg, 0);
    expect(modelled).toBeGreaterThan(0);
    expect(steel.reduce((s, l) => s + l.qty, 0)).toBeCloseTo(
      Math.round(modelled * 10) / 10,
      1,
    );
  });

  it('the breakdown says RAILS, not "0 legs 0 rafters"', () => {
    const f = lineOf(p, 'mech.steel')!.formula;
    expect(f).toMatch(/rails/);
    expect(f).not.toMatch(/0 legs/);
    expect(f).not.toMatch(/0 rafters/);
  });

  it('standoffs and washers are billed from the node graph', () => {
    const ft = fastenerTotals(projectStructures(p));
    expect(lineOf(p, 'mech.sheet_standoff')!.qty).toBe(ft.standoffs);
    expect(lineOf(p, 'mech.sealing_washer')!.qty).toBe(ft.sealingWashers);
  });

  it('one washer per penetration — every fixing is a hole', () => {
    const ft = fastenerTotals(projectStructures(p));
    expect(ft.sealingWashers).toBe(ft.standoffs);
  });

  it('the standoff line is ASSUMED and says why', () => {
    const l = lineOf(p, 'mech.sheet_standoff')!;
    expect(l.confidence).toBe('assumed');
    expect(l.formula).toMatch(/purlin pitch/i);
    expect(l.formula).toMatch(/crown/i);
  });

  it('a flat-roof table bills no shed fixings', () => {
    expect(lineOf(tableProject(), 'mech.sheet_standoff')).toBeUndefined();
    expect(lineOf(tableProject(), 'mech.sealing_washer')).toBeUndefined();
  });
});

describe('one design change, one BOM change', () => {
  it('more purlins ⇒ more modelled steel AND more billed steel', () => {
    const base = tableProject();
    const denser: Project = {
      ...base,
      segments: base.segments.map((s) => ({
        ...s,
        racking: s.racking.kind === 'flush' ? s.racking : { ...s.racking, purlinCount: 4 },
      })),
    };
    const kg = (p: Project) =>
      deriveBom(p)
        .filter((l) => l.id.startsWith('mech.steel'))
        .reduce((s, l) => s + l.qty, 0);
    expect(kg(denser)).toBeGreaterThan(kg(base));
    // and the model agrees — the two cannot drift
    const modelled = (p: Project) =>
      projectStructures(p).reduce((s, st) => s + st.steelKg, 0);
    expect(modelled(denser)).toBeGreaterThan(modelled(base));
  });
});
