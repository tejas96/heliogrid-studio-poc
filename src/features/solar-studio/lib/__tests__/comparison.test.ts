// ─── Gate: component comparison matrix (Phase 6, §25b) ───────────────────────
// The binding gate from the plan: matrix values EQUAL single-run pipeline
// outputs on the identically constructed candidate project. Plus determinism,
// budget honoring, transparent shortlist/recommendation rules, and the
// stripped-overrides comparability contract.
import { describe, it, expect, beforeEach } from 'vitest';
import type { Project, SiteLocation } from '../../types';
import {
  buildCandidateProject,
  compareCandidates,
  compareShortlist,
  memoizedComparison,
  recommendInverterFor,
  resetComparisonMemo,
  shortlistPanels,
} from '../comparison';
import { computeEnergyReport } from '../solar';
import { computeFinancials } from '../finance';
import { resolveCatalog } from '../../data/catalog';
import { PANEL_DB } from '../../data/panels';
import { fixtureProject, fixtureRoof } from './fixtures/project';

const PUNE: SiteLocation = {
  address: 'Pune',
  latLng: { lat: 18.5203, lng: 73.8567 },
  confirmed: true,
  irradiance: 5.2,
  peakSunHours: 5.2,
  dataSource: 'test',
};

/** Step-4 reality: components chosen, roofs drawn, NO panels placed yet. */
function step4Project(targetKwp?: number): Project {
  const p = fixtureProject(0);
  return {
    ...p,
    location: PUNE,
    panels: [],
    segments: [],
    strings: [],
    components: { ...p.components, targetKwp: targetKwp ?? p.components.targetKwp },
  };
}

const normalizeIds = (v: unknown) => {
  const seen = new Map<string, string>();
  return JSON.stringify(v).replace(
    /"(pv|seg|str)_[0-9a-f-]{36}"/g,
    (m) => seen.get(m) ?? (seen.set(m, `"id_${seen.size}"`), seen.get(m)!),
  );
};

beforeEach(() => resetComparisonMemo());

describe('buildCandidateProject', () => {
  it('honors the target-kWp budget and synthesizes consistent strings', () => {
    const p = step4Project();
    const spec = p.components.panel!;
    p.components.targetKwp = (5 * spec.watt) / 1000;
    const cand = buildCandidateProject(p, spec, p.components.inverter, 1);
    expect(cand.panels).toHaveLength(5);
    expect(cand.strings.length).toBeGreaterThan(0);
    const strung = cand.strings.flatMap((s) => s.panelIds);
    expect(new Set(strung).size).toBe(strung.length); // no double-assignment
    expect(strung.length).toBe(5);
  });

  it('strips BOM overrides for comparability but keeps the saved margin', () => {
    const p = step4Project();
    p.bomOverrides = [
      { id: 'x1', category: 'Modules', item: 'custom', spec: '', qty: 1, unit: 'nos', unitPriceInr: 99999, formula: '', auto: false, overridden: true },
    ] as Project['bomOverrides'];
    p.pricing = { marginPct: 20 };
    const cand = buildCandidateProject(p, p.components.panel!, p.components.inverter, 1);
    expect(cand.bomOverrides).toHaveLength(0);
    expect(cand.pricing?.marginPct).toBe(20);
  });

  it('fills to max roof capacity when no target is set', () => {
    const p = step4Project(0);
    const spec = p.components.panel!;
    const cand = buildCandidateProject(p, spec, p.components.inverter, 1);
    expect(cand.panels.length).toBeGreaterThan(10); // 16×12 m roof holds far more
  });

  it('spans the budget across roofs in array order', () => {
    const p = step4Project(0);
    const spec = p.components.panel!;
    p.roofs = [
      fixtureRoof(),
      fixtureRoof({
        id: 'roof_2',
        name: 'Roof 2',
        polygon: [
          { x: 12, y: -6 },
          { x: 28, y: -6 },
          { x: 28, y: 6 },
          { x: 12, y: 6 },
        ],
      }),
    ];
    const cap1 = buildCandidateProject(
      { ...p, roofs: [p.roofs[0]] },
      spec,
      null,
      1,
    ).panels.length;
    p.components.targetKwp = ((cap1 + 3) * spec.watt) / 1000; // 3 panels overflow to roof 2
    const cand = buildCandidateProject(p, spec, p.components.inverter, 1);
    expect(cand.panels).toHaveLength(cap1 + 3);
    expect(cand.segments.map((s) => s.label)).toEqual(['A1', 'A2']);
    expect(cand.panels.filter((x) => x.roofId === 'roof_2')).toHaveLength(3);
  });
});

describe('compareCandidates — the determinism gates', () => {
  it('matrix cells EQUAL single-run pipeline outputs on the same constructed candidate', () => {
    const p = step4Project(4);
    const spec = p.components.panel!;
    const inv = p.components.inverter!;
    const result = compareCandidates(p, [
      { panel: spec, inverter: inv, inverterCount: 1, isCurrent: true },
    ]);
    const row = result.rows[0];

    // independent single runs of the SAME pure pipelines
    const cand = buildCandidateProject(p, spec, inv, 1);
    const report = computeEnergyReport(cand);
    const fin = computeFinancials(cand, report);

    expect(row.panelsPlaced).toBe(cand.panels.length);
    expect(row.annualKwh).toBe(Math.round(report.annualMwh * 1000));
    expect(row.systemCostInr).toBe(fin.systemCostInr);
    expect(row.subsidyInr).toBe(fin.subsidyInr);
    expect(row.netCostInr).toBe(fin.netCostInr);
    expect(row.paybackYears).toBe(fin.paybackYears);
    expect(row.savings25YrInr).toBe(fin.savings25YrInr);
    expect(row.annualSavingsInr).toBe(fin.annualSavingsInr);
  });

  it('is deterministic — identical input produces identical output (modulo fresh ids)', () => {
    const p = step4Project(4);
    const a = compareShortlist(p);
    const b = compareShortlist(p);
    expect(normalizeIds(b)).toBe(normalizeIds(a));
    expect(a.rows.length).toBeGreaterThan(1);
  });

  it('recommends by the stated rule: lowest payback among feasible rows', () => {
    const p = step4Project(4);
    const r = compareShortlist(p);
    const feasible = r.rows.filter((x) => x.stringFeasible);
    expect(feasible.length).toBeGreaterThan(0);
    const minPayback = Math.min(...feasible.map((x) => x.paybackYears));
    const winner = r.rows.find((x) => x.key === r.recommendedKey)!;
    expect(winner.paybackYears).toBe(minPayback);
    const rec = r.decisions.find((d) => d.id === 'recommendation')!;
    expect(rec.reason).toMatch(/feasible/);
    expect(rec.inputs.join(' ')).toContain('payback');
  });

  it('carries the basis + shortlist decisions with honest inputs', () => {
    const p = step4Project(4);
    const r = compareShortlist(p);
    const basis = r.decisions.find((d) => d.id === 'comparison-basis')!;
    expect(basis.choice).toContain('4 kWp');
    expect(basis.inputs.join(' ')).toContain(`catalog=${resolveCatalog().catalogVersion}`);
    expect(basis.reason).toMatch(/unshaded/i);
    expect(r.decisions.some((d) => d.id === 'shortlist')).toBe(true);
    expect(r.basis.objective).toBe('target_kwp');
  });

  it('gives every candidate a real inverter even when no catalog unit fits the band', () => {
    // 4.32 kWp on the single-phase catalog: best ratio 4.32/5 = 0.86 (<0.90) —
    // nearest fit must be used, priced, and validateSystem's warning surfaced
    const p = step4Project(4.32);
    const r = compareShortlist(p);
    for (const row of r.rows.filter((x) => x.panelsPlaced > 0)) {
      expect(row.inverter, `${row.key} inverter`).not.toBeNull();
      expect(row.netCostInr, `${row.key} netCost`).toBeGreaterThan(0);
      expect(row.annualKwh, `${row.key} kWh`).toBeGreaterThan(0);
      // the energy model has no clipping term — a fallback fit must never
      // land above 1.35 while a non-clipping option exists in the catalog
      expect(row.dcAcRatio!, `${row.key} dcAc`).toBeLessThanOrEqual(1.35);
    }
  });

  it('flags a roofless project instead of silently comparing zeros', () => {
    const p = { ...step4Project(4), roofs: [] };
    const r = compareShortlist(p);
    expect(r.warnings.some((w) => w.includes('roof'))).toBe(true);
    expect(r.rows.every((x) => x.panelsPlaced === 0)).toBe(true);
    expect(r.recommendedKey).toBeNull();
  });

  it('the CURRENT row keeps the user-chosen inverter and count verbatim', () => {
    const p = step4Project(8);
    p.components.inverterCount = 2;
    const r = compareShortlist(p);
    const current = r.rows.filter((x) => x.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0].inverter?.id).toBe(p.components.inverter!.id);
    expect(current[0].inverterCount).toBe(2);
  });

  it('a current panel WITHOUT an inverter selection still gets a recommended one', () => {
    const p = step4Project(4);
    p.components.inverter = null;
    const current = compareShortlist(p).rows.find((x) => x.isCurrent)!;
    expect(current.inverter).not.toBeNull();
    expect(current.netCostInr).toBeGreaterThan(0);
  });

  it('diagnoses a sub-panel target instead of blaming the roof, with finite payback', () => {
    const p = step4Project(0.4); // below one 440+ W module
    const r = compareShortlist(p);
    expect(r.rows.every((x) => x.panelsPlaced === 0)).toBe(true);
    for (const row of r.rows) {
      expect(row.feasibilityNote).toMatch(/below one/);
      expect(Number.isFinite(row.paybackYears)).toBe(true); // was NaN pre-fix
      expect(row.paybackYears).toBe(0); // zero net cost pays back at once
    }
    expect(r.warnings.some((w) => w.includes('smaller than a single panel'))).toBe(true);
  });

  it('clipping fits never win the recommendation and always carry a visible warn note', () => {
    // 40×20 m roof, 40 kWp target, single phase: the largest 1φ catalog combo
    // is 24 kW AC, so every fallback fit clips (>1.35) — with no clipping
    // model in the energy pipeline, NO row may be recommended
    const p = step4Project(40);
    p.roofs = [
      fixtureRoof({
        polygon: [
          { x: -20, y: -10 },
          { x: 20, y: -10 },
          { x: 20, y: 10 },
          { x: -20, y: 10 },
        ],
      }),
    ];
    p.components.inverter = null; // every row through the fallback
    const r = compareShortlist(p);
    for (const row of r.rows.filter((x) => x.panelsPlaced > 0)) {
      expect(row.dcAcRatio!).toBeGreaterThan(1.35);
      expect(row.warnNote).toMatch(/clipping|band/);
    }
    expect(r.recommendedKey).toBeNull();
  });

  it('out-of-band fits carry a warn note; in-band fits stay clean', () => {
    const p = step4Project(4.32); // ~4.2 kWp candidates fall to 0.85 on the 5 kW
    const r = compareShortlist(p);
    const rows = r.rows.filter((x) => x.panelsPlaced > 0);
    const outOfBand = rows.filter((x) => x.dcAcRatio! < 0.9 || x.dcAcRatio! > 1.35);
    expect(outOfBand.length).toBeGreaterThan(0); // the AESOLAR rows at 0.85
    for (const row of outOfBand) expect(row.warnNote).toMatch(/band|clipping|oversized/i);
    const inBand = rows.filter((x) => x.dcAcRatio! >= 0.9 && x.dcAcRatio! <= 1.35);
    for (const row of inBand) expect(row.warnNote).toBeNull();
  });

  it('states the max-roof basis wording when no target is set', () => {
    const r = compareShortlist(step4Project(0));
    expect(r.basis.objective).toBe('max_roof');
    const basis = r.decisions.find((d) => d.id === 'comparison-basis')!;
    expect(basis.choice).toMatch(/maximum roof capacity/);
    expect(basis.inputs.join(' ')).toContain('irradiance=');
  });
});

describe('shortlistPanels', () => {
  it('applies the stated rule: ALMM-only, ranked by ₹/W, current first and always included', () => {
    const p = step4Project(4);
    const { panels, rule } = shortlistPanels(p);
    expect(rule).toMatch(/ALMM/);
    expect(panels).toHaveLength(6); // catalog has ≥6 ALMM panels — no lost slot
    expect(rule).toContain('showing 6');
    expect(panels[0].id).toBe(p.components.panel!.id);
    const others = panels.slice(1);
    for (let i = 1; i < others.length; i++) {
      expect(others[i - 1].priceInr / others[i - 1].watt).toBeLessThanOrEqual(
        others[i].priceInr / others[i].watt + 1e-9,
      );
    }
    for (const x of others) expect(x.almm).toBe(true);
  });

  it('a non-ALMM current panel is included with an honest rule caveat', () => {
    const p = step4Project(4);
    p.components.panel = PANEL_DB.find((x) => !x.almm)!;
    const { panels, rule } = shortlistPanels(p);
    expect(panels[0].id).toBe(p.components.panel.id);
    expect(rule).toContain('not ALMM-listed');
  });

  it('works with no current selection — pure ranking, no isCurrent rows', () => {
    const p = step4Project(4);
    p.components.panel = null;
    const { panels, rule } = shortlistPanels(p);
    expect(panels).toHaveLength(6);
    expect(panels.every((x) => x.almm)).toBe(true);
    expect(rule).not.toContain('current selection');
    const r = compareShortlist(p);
    expect(r.rows.some((x) => x.isCurrent)).toBe(false);
    expect(r.recommendedKey).not.toBeNull();
  });
});

describe('recommendInverterFor', () => {
  const inverters = resolveCatalog().inverters;

  it('lands in the 0.90–1.35 DC/AC band, closest to 1.15, price tie-break pinned', () => {
    const pick = recommendInverterFor(5.4, 1, inverters)!;
    const ratio = 5.4 / (pick.inverter.acKw * pick.count);
    expect(ratio).toBeGreaterThanOrEqual(0.9);
    expect(ratio).toBeLessThanOrEqual(1.35);
    expect(pick.inverter.phases).toBe(1);
    // two 5 kW units tie on ratio — the ₹52,000 Growatt beats the ₹55,000 GoodWe
    expect(pick.inverter.id).toBe('inv_gr5');
    expect(pick.count).toBe(1);
  });

  it('uses multiple units when no single inverter fits a large capacity', () => {
    const pick = recommendInverterFor(60, 3, inverters)!;
    expect(pick.count).toBeGreaterThan(1);
    const ratio = 60 / (pick.inverter.acKw * pick.count);
    expect(ratio).toBeGreaterThanOrEqual(0.9);
    expect(ratio).toBeLessThanOrEqual(1.35);
  });

  it('restricts single-phase supplies to 1φ inverters and nulls on impossible fits', () => {
    const singlePhase = recommendInverterFor(4, 1, inverters)!;
    expect(singlePhase.inverter.phases).toBe(1);
    expect(recommendInverterFor(0, 1, inverters)).toBeNull();
  });
});

describe('memoizedComparison', () => {
  it('returns the identical instance until designFp changes', () => {
    const p = step4Project(4);
    const a = memoizedComparison(p);
    expect(memoizedComparison(p)).toBe(a);
    const p2 = { ...p, components: { ...p.components, targetKwp: 6 } };
    const b = memoizedComparison(p2);
    expect(b).not.toBe(a);
    expect(b.basis.targetKwp).toBe(6);
  });

  it('keys on VALUE (a structurally equal clone hits the memo) and matches a fresh compute', () => {
    const p = step4Project(4);
    const a = memoizedComparison(p);
    const clone = JSON.parse(JSON.stringify(p)) as Project;
    expect(memoizedComparison(clone)).toBe(a);
    expect(normalizeIds(a)).toBe(normalizeIds(compareShortlist(p)));
  });

  it('invalidates when the catalog version changes', () => {
    const p = step4Project(4);
    const cat = resolveCatalog();
    const orig = cat.catalogVersion;
    const a = memoizedComparison(p);
    try {
      cat.catalogVersion = '2099.01-1';
      const b = memoizedComparison(p);
      expect(b).not.toBe(a);
      expect(b.basis.catalogVersion).toBe('2099.01-1');
    } finally {
      cat.catalogVersion = orig;
      resetComparisonMemo();
    }
  });
});
