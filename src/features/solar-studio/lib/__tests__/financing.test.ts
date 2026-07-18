// ─── Financing models: cash / loan / lease / PPA (Phase 12 · task 31d) ──────
// Every option must reconcile to the ONE quote total and the same grid saving.
import { describe, expect, it } from 'vitest';
import { computeFinancing, emiInr } from '../financing';
import type { FinancialSummary } from '../../types';

// 10 000 kWh/yr @ ₹6 ⇒ ₹60 000 annual saving; ₹5L system, ₹78k subsidy ⇒ ₹4.22L net
const FIN: FinancialSummary = {
  systemCostInr: 500000,
  subsidyInr: 78000,
  netCostInr: 422000,
  annualSavingsInr: 60000,
  paybackYears: 7,
  savings25YrInr: 2000000,
  emiPerMonthInr: 0,
  tariffEscalationPct: 3,
};
const ANNUAL_KWH = 10000;
const GRID = 6;

describe('emiInr', () => {
  it('amortises a known loan correctly (₹1L @ 12% over 12 mo ≈ ₹8 885)', () => {
    expect(emiInr(100000, 12, 12)).toBeGreaterThan(8800);
    expect(emiInr(100000, 12, 12)).toBeLessThan(8900);
  });
  it('is zero for a non-positive principal', () => {
    expect(emiInr(0, 9.5, 60)).toBe(0);
  });
});

describe('computeFinancing', () => {
  const c = computeFinancing(FIN, ANNUAL_KWH, GRID);

  it('offers exactly the four modes and reconciles to the one quote total', () => {
    expect(c.options.map((o) => o.mode)).toEqual(['cash', 'loan', 'lease', 'ppa']);
    expect(c.systemCostInr).toBe(FIN.systemCostInr);
    expect(c.netCostInr).toBe(FIN.netCostInr);
  });

  it('cash = the full net cost upfront, nothing recurring', () => {
    const cash = c.options.find((o) => o.mode === 'cash')!;
    expect(cash.upfrontInr).toBe(FIN.netCostInr);
    expect(cash.monthlyInr).toBe(0);
    expect(cash.lifetimeCostInr).toBe(FIN.netCostInr);
  });

  it('loan down payment + financed principal === net cost, and interest makes lifetime > net', () => {
    const loan = c.options.find((o) => o.mode === 'loan')!;
    expect(loan.upfrontInr).toBe(Math.round(FIN.netCostInr * 0.2)); // 20% down
    expect(loan.monthlyInr).toBeGreaterThan(0);
    expect(loan.lifetimeCostInr).toBeGreaterThan(FIN.netCostInr); // pays interest
  });

  it('lease & PPA need ₹0 upfront (developer owns the system)', () => {
    for (const m of ['lease', 'ppa'] as const) {
      expect(c.options.find((o) => o.mode === m)!.upfrontInr).toBe(0);
    }
  });

  it('PPA is always cash-flow positive from year 1 (rate is below grid)', () => {
    const ppa = c.options.find((o) => o.mode === 'ppa')!;
    // saving = (grid − ppaRate) × kWh > 0
    expect(ppa.firstYearNetInr).toBeGreaterThan(0);
    expect(ppa.firstYearNetInr).toBeLessThan(FIN.annualSavingsInr); // customer shares the benefit
  });

  it('every option carries a plain-language headline + note', () => {
    for (const o of c.options) {
      expect(o.headline.length).toBeGreaterThan(0);
      expect(o.note.length).toBeGreaterThan(0);
      expect(o.monthlyInr).toBeGreaterThanOrEqual(0);
    }
  });
});
