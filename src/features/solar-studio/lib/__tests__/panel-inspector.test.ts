// ─── Per-panel inspector data (Phase 8 task 27c) ────────────────────────────
// Two contracts the on-panel card leans on: shade ATTRIBUTION names the thing
// actually blocking the sun, and the per-panel kWh is a SPLIT of the report —
// never a second energy model that could contradict the proposal.
import { describe, expect, it } from 'vitest';
import { computePanelShadeDetail, computeSolarAccess } from '../shading';
import { computeEnergyReport, panelEnergyShares } from '../solar';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import { CAPABILITY_PRESETS } from '../capabilities';
import type { Obstruction, Project } from '../../types';

function located(p: Project): Project {
  return {
    ...p,
    location: {
      address: 'Pune',
      latLng: { lat: 18.5204, lng: 73.8567 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}

function wall(over: Partial<Obstruction> = {}): Obstruction {
  return {
    id: 'ob_wall',
    type: 'tank',
    label: 'WALL',
    roofId: 'roof_1',
    center: { x: 0, y: -6 },
    shape: 'rect',
    lengthM: 14,
    widthM: 0.4,
    diameterM: 0,
    heightM: 6,
    rotationDeg: 0,
    setbackM: 0.3,
    castsShadow: true,
    blocksPlacement: true,
    capabilities: { ...CAPABILITY_PRESETS.tank },
    ...over,
  };
}

describe('computePanelShadeDetail — attribution', () => {
  it('access matches computeSolarAccess exactly (one engine, two readouts)', () => {
    const p = located(fixtureProject(8));
    const bulk = computeSolarAccess(p);
    for (const panel of p.panels) {
      const detail = computePanelShadeDetail(p, panel.id)!;
      expect(detail.access).toBeCloseTo(bulk.get(panel.id)!, 10);
    }
  });

  it('names the OBSTRUCTION blocking a panel, not the roof behind it', () => {
    const p: Project = { ...located(fixtureProject(8)), obstructions: [wall()] };
    // the wall stands due south of the array — it must own the loss
    const detail = computePanelShadeDetail(p, p.panels[0].id)!;
    expect(detail.access).toBeLessThan(0.95);
    expect(detail.blockers.length).toBeGreaterThan(0);
    const worst = detail.blockers[0];
    expect(worst.kind).toBe('obstruction');
    expect(worst.label).toBe('WALL');
    expect(worst.lossFrac).toBeGreaterThan(0);
  });

  it('attributes row shading to a PANEL blocker (Tier-2 self-shading)', () => {
    // the fixture's rows sit ~7cm apart: the back row is shaded by the front
    const p = located(fixtureProject(8));
    const backY = Math.max(...p.panels.map((x) => x.center.y));
    const back = p.panels.find((x) => x.center.y === backY)!;
    const detail = computePanelShadeDetail(p, back.id)!;
    expect(detail.blockers.some((b) => b.kind === 'panel')).toBe(true);
  });

  it('an unshaded panel reports no blockers at all', () => {
    const base = located(fixtureProject(8));
    const p: Project = { ...base, panels: [base.panels[0]], obstructions: [] };
    const detail = computePanelShadeDetail(p, p.panels[0].id)!;
    expect(detail.access).toBeGreaterThan(0.99);
    expect(detail.blockers).toEqual([]);
  });

  it('losses + access account for the whole beam budget (nothing unattributed)', () => {
    const p: Project = { ...located(fixtureProject(8)), obstructions: [wall()] };
    const detail = computePanelShadeDetail(p, p.panels[0].id)!;
    const totalLoss = detail.blockers.reduce((s, b) => s + b.lossFrac, 0);
    expect(detail.access + totalLoss).toBeCloseTo(1, 6);
  });

  it('returns null for an unknown panel or an unlocated project', () => {
    const p = located(fixtureProject(4));
    expect(computePanelShadeDetail(p, 'nope')).toBeNull();
    expect(computePanelShadeDetail({ ...p, location: null }, p.panels[0].id)).toBeNull();
  });
});

describe('panelEnergyShares — a split of the report, not a rival model', () => {
  it('Σ shares === the report annual energy (§A0: one number)', () => {
    const p = located(fixtureProject(8));
    const report = computeEnergyReport(p);
    const shares = panelEnergyShares(p);
    const sum = [...shares.values()].reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(report.annualKwh, 6);
    expect(shares.size).toBe(p.panels.filter((x) => x.enabled).length);
  });

  it('a shaded panel earns strictly less than its unshaded twin', () => {
    const base = located(fixtureProject(8));
    const p: Project = {
      ...base,
      panels: base.panels.map((x, i) => ({ ...x, solarAccess: i === 0 ? 0.4 : 1 })),
    };
    const shares = panelEnergyShares(p);
    expect(shares.get(p.panels[0].id)!).toBeLessThan(shares.get(p.panels[1].id)!);
  });

  it('disabled panels get no share and no seat at the table', () => {
    const base = located(fixtureProject(8));
    const p: Project = {
      ...base,
      panels: base.panels.map((x, i) => (i === 0 ? { ...x, enabled: false } : x)),
    };
    const shares = panelEnergyShares(p);
    expect(shares.has(p.panels[0].id)).toBe(false);
    expect([...shares.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(
      computeEnergyReport(p).annualKwh,
      6,
    );
  });

  it('no panels ⇒ empty map (no divide-by-zero)', () => {
    const p: Project = { ...located(fixtureProject(0)), panels: [] };
    expect(panelEnergyShares(p).size).toBe(0);
  });
});
