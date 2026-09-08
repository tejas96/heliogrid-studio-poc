// ─── Gate: the two numbers the proposal printed wrongly ─────────────────────
// Both reached a document a buyer signs against, and neither was pinned by any
// existing test — the whole suite stayed green through both defects.
import { describe, expect, it } from 'vitest';
import { computeFinancials, HORIZON_YEARS } from '../finance';
import { computeEnergyReport } from '../energy/report';
import { computeFinancing } from '../financing';
import { proposalNarrative } from '../proposal-narrative';
import { fixtureProject } from './fixtures/project';
import type { EnergyReport, Project } from '../../types';

/** A report whose annual figure is deliberately NOT a multiple of 100 kWh. */
function reportWith(annualKwh: number, base: EnergyReport): EnergyReport {
  return {
    ...base,
    annualKwh,
    // exactly what lib/energy/report.ts stores: quantised to 0.1 MWh
    annualMwh: Math.round(annualKwh / 100) / 10,
  };
}

describe('payback never prints the horizon as if it were an answer', () => {
  const project = fixtureProject(8);
  const base = computeEnergyReport(project);

  it('a system that does not pay back says so, instead of "25 yrs"', () => {
    // a punishing tariff makes the savings far too small to ever clear the cost
    const p: Project = { ...project, info: { ...project.info, tariffInrPerKwh: 0.01 } };
    const fin = computeFinancials(p, computeEnergyReport(p));
    expect(fin.paysBackWithinHorizon).toBe(false);
    // the number is still the horizon — that is deliberate, it is the ranking
    // key in lib/comparison.ts — but it is now labelled as not an answer
    expect(fin.paybackYears).toBe(HORIZON_YEARS);
  });

  it('a system that DOES pay back is unaffected', () => {
    const fin = computeFinancials(project, base);
    if (fin.netCostInr <= 0) {
      expect(fin.paysBackWithinHorizon).toBe(true);
      expect(fin.paybackYears).toBe(0);
      return;
    }
    expect(fin.paysBackWithinHorizon).toBe(true);
    expect(fin.paybackYears).toBeLessThan(HORIZON_YEARS);
    expect(fin.paybackYears).toBeGreaterThan(0);
  });

  it('the cash financing note stops promising one too', () => {
    // This is the sentinel in PROSE, on the surface a prospect actually sees:
    // the note renders through EnergyReportSheet, which ShareViewer mounts
    // read-only. Fixing the tile and leaving this said "Over 25 yrs" and
    // "payback in about 25 years" on the same page.
    const p: Project = { ...project, info: { ...project.info, tariffInrPerKwh: 0.01 } };
    const rep = computeEnergyReport(p);
    const fin = computeFinancials(p, rep);
    const cash = computeFinancing(fin, rep.annualKwh, p.info.tariffInrPerKwh).options.find(
      (o) => o.mode === 'cash',
    )!;
    expect(fin.paysBackWithinHorizon).toBe(false);
    expect(cash.note).not.toContain('payback in about');
    expect(cash.note).toContain('does not pay back');
  });

  it('the narrative stays silent when there is no payback to promise', () => {
    // it derives its own finance from the project, so the punishing tariff is
    // all it needs; the guard used to be a bare `< 25` reading the sentinel
    const p: Project = { ...project, info: { ...project.info, tariffInrPerKwh: 0.01 } };
    expect(computeFinancials(p, computeEnergyReport(p)).paysBackWithinHorizon).toBe(false);
    const flat = JSON.stringify(proposalNarrative(p, (m2) => `${m2} m2`));
    expect(flat).not.toContain('pays for itself');
  });
});

describe('money is built on the exact annual energy, not the rounded one', () => {
  const project = fixtureProject(8);
  const base = computeEnergyReport(project);
  const tariff = project.info.tariffInrPerKwh;

  it('annual savings use annualKwh, not annualMwh × 1000', () => {
    // 12 345.6 kWh rounds to 12.3 MWh → 12 300 kWh: a 45.6 kWh error per year
    const exact = 12345.6;
    const fin = computeFinancials(project, reportWith(exact, base));
    expect(fin.annualSavingsInr).toBe(Math.round(exact * tariff));
    // and specifically NOT the figure the rounded MWh would have produced
    const rounded = (Math.round(exact / 100) / 10) * 1000;
    expect(rounded).not.toBe(exact); // the fixture really does exercise it
    expect(fin.annualSavingsInr).not.toBe(Math.round(rounded * tariff));
  });

  it('the 25-year savings figure moves with it, compounded', () => {
    const exact = 12345.6;
    const rounded = (Math.round(exact / 100) / 10) * 1000;
    const withExact = computeFinancials(project, reportWith(exact, base));
    const withRounded = computeFinancials(project, reportWith(rounded, base));
    // the error does not stay small: it is escalated and degraded over 25 years
    expect(withExact.savings25YrInr).not.toBe(withRounded.savings25YrInr);
    expect(Math.abs(withExact.savings25YrInr - withRounded.savings25YrInr)).toBeGreaterThan(0);
  });
});
