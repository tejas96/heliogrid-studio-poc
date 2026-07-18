// ─── Financing models: cash / loan / lease / PPA (Phase 12 · task 31d) ──────
// Four ways to pay for the SAME system. Every option is derived from the one
// quote total (fin.systemCostInr / netCostInr) and the same annual grid saving,
// so no financing view can disagree with the BOM. Terms come from the rule
// config (representative — a real deployment wires actual lender/PPA offers).
// White-label branding + the proposal financing page are the DRAW half (31d),
// deferred; this is the calculation model only.
import type { FinancialSummary } from '../types';
import { resolveRules } from '../data/rules/india';

export type FinancingMode = 'cash' | 'loan' | 'lease' | 'ppa';

export interface FinancingOption {
  mode: FinancingMode;
  label: string;
  /** customer's day-1 outlay */
  upfrontInr: number;
  /** recurring monthly outflow (0 for cash) */
  monthlyInr: number;
  /** annual grid saving − the first year's financing outflow (>0 = cash-flow positive) */
  firstYearNetInr: number;
  /** total the customer pays over the term */
  lifetimeCostInr: number;
  headline: string;
  note: string;
}

export interface FinancingComparison {
  systemCostInr: number;
  netCostInr: number;
  annualSavingsInr: number;
  options: FinancingOption[];
}

const inr = (n: number): string => Math.round(n).toLocaleString('en-IN');

/** Level monthly payment amortising `principal` at `annualRatePct` over `months`. */
export function emiInr(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 1200;
  if (r === 0) return Math.round(principal / months);
  return Math.round((principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
}

/**
 * Compare the four financing modes for a computed design. `annualKwh` and
 * `gridTariff` must be the SAME values that produced `fin.annualSavingsInr`
 * (annualSavings = annualKwh × gridTariff) so PPA savings reconcile exactly.
 */
export function computeFinancing(
  fin: FinancialSummary,
  annualKwh: number,
  gridTariff: number,
): FinancingComparison {
  const f = resolveRules().financing;
  const net = fin.netCostInr;
  const annualSavings = fin.annualSavingsInr;

  // CASH — own it outright, fastest payback
  const cash: FinancingOption = {
    mode: 'cash',
    label: 'Cash',
    upfrontInr: net,
    monthlyInr: 0,
    firstYearNetInr: annualSavings,
    lifetimeCostInr: net,
    headline: `Pay ₹${inr(net)} once`,
    note: `You own the system outright — payback in about ${fin.paybackYears} years, then free power.`,
  };

  // LOAN — finance the net cost after a down payment
  const down = Math.round((net * f.loanDownPaymentPct) / 100);
  const principal = net - down;
  const months = f.loanTenureYears * 12;
  const monthly = emiInr(principal, f.loanRatePct, months);
  const total = down + monthly * months;
  const loan: FinancingOption = {
    mode: 'loan',
    label: 'Loan',
    upfrontInr: down,
    monthlyInr: monthly,
    firstYearNetInr: annualSavings - monthly * 12,
    lifetimeCostInr: total,
    headline: `₹${inr(down)} down + ₹${inr(monthly)}/mo × ${f.loanTenureYears} yr`,
    note: `${f.loanRatePct}% APR · total ₹${inr(total)} (₹${inr(total - net)} interest); you own the system.`,
  };

  // LEASE — developer owns & maintains; customer pays a monthly lease
  const leaseMonths = f.leaseTenureYears * 12;
  const leaseMonthly = emiInr(fin.systemCostInr, f.leaseRatePct, leaseMonths);
  const lease: FinancingOption = {
    mode: 'lease',
    label: 'Lease',
    upfrontInr: 0,
    monthlyInr: leaseMonthly,
    firstYearNetInr: annualSavings - leaseMonthly * 12,
    lifetimeCostInr: leaseMonthly * leaseMonths,
    headline: `₹0 down + ₹${inr(leaseMonthly)}/mo × ${f.leaseTenureYears} yr`,
    note: 'Developer owns & maintains the system; you keep the grid savings less the lease.',
  };

  // PPA — buy the generated kWh at a discount to the grid tariff, ₹0 upfront
  const ppaRate = Math.round(gridTariff * (1 - f.ppaDiscountPct / 100) * 100) / 100;
  const ppaAnnual = Math.round(ppaRate * annualKwh);
  const ppa: FinancingOption = {
    mode: 'ppa',
    label: 'PPA',
    upfrontInr: 0,
    monthlyInr: Math.round(ppaAnnual / 12),
    firstYearNetInr: annualSavings - ppaAnnual,
    lifetimeCostInr: ppaAnnual * f.ppaTenureYears,
    headline: `₹0 down · pay ₹${ppaRate}/kWh (${f.ppaDiscountPct}% below grid)`,
    note: 'Developer owns the system; you pay only for the solar energy you consume.',
  };

  return {
    systemCostInr: fin.systemCostInr,
    netCostInr: net,
    annualSavingsInr: annualSavings,
    options: [cash, loan, lease, ppa],
  };
}
