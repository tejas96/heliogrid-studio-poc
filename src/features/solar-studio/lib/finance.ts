// ─── Financials (improvement): CAPEX, subsidy, payback, EMI ────────────────
import type { EnergyReport, FinancialSummary, Project } from '../types';
import { mergedBom, bomTotal } from './bom';
import { resolveRules } from '../data/rules/india';

/**
 * PM Surya Ghar residential subsidy slab (values in data/rules/india.ts):
 * ₹30,000/kW for the first 2 kW, ₹18,000 for the 3rd kW, capped at ₹78,000 for
 * 3 kW AND ABOVE — the cap applies regardless of system size (the scheme does
 * not zero out for larger residential systems). Eligibility additionally
 * requires DCR (domestic content requirement) modules; a non-DCR module gets ₹0.
 * Verify current-year values against the official portal before release.
 */
export function subsidyInr(
  capacityKwp: number,
  residential: boolean,
  dcrEligible: boolean,
): number {
  const s = resolveRules().subsidy;
  if (!residential || (s.requiresDcr && !dcrEligible) || capacityKwp <= 0) return 0;
  const kw = Math.min(capacityKwp, s.capKw);
  const first = Math.min(kw, s.firstSlabKw) * s.firstSlabPerKwInr;
  const rest = Math.max(0, kw - s.firstSlabKw) * s.secondSlabPerKwInr;
  return Math.min(s.capInr, Math.round(first + rest));
}

/** The commercial life the payback and the savings figure are quoted over. */
export const HORIZON_YEARS = 25;

export function computeFinancials(
  project: Project,
  report: EnergyReport,
): FinancialSummary {
  // mergedBom (auto + user overrides + custom lines) — the SAME lines the BOM
  // table shows, so the proposal's headline cost can never disagree with it.
  const bom = mergedBom(project);
  const systemCost = bomTotal(bom, project);
  const subsidy = subsidyInr(
    report.capacityKwp,
    project.info.siteType === 'residential',
    project.components.panel?.dcr ?? false,
  );
  const netCost = Math.max(0, systemCost - subsidy);
  const tariff = project.info.tariffInrPerKwh;
  // The EXACT annual figure, not `annualMwh * 1000`. `annualMwh` is
  // `Math.round(annualKwh / 100) / 10` (lib/energy/report.ts) — quantised to
  // 100 kWh — and every rupee below is built on it and then compounded over 25
  // years with escalation, so the rounding does not stay small. The unrounded
  // value sits one line away in the same report and its own type comment calls
  // itself "the basis annualMwh rounds".
  const annualKwh = report.annualKwh;
  const annualSavings = Math.round(annualKwh * tariff);
  const escalation = 3; // % tariff escalation per year
  // payback with escalating tariff. Guards: zero net cost pays back at once;
  // zero yearly savings must not divide (0-panel candidates hit NaN otherwise)
  let cum = 0;
  let payback = netCost <= 0 ? 0 : HORIZON_YEARS;
  /**
   * Whether the loop actually FOUND a payback year.
   *
   * `payback` starts at the horizon, so a system that never pays back within 25
   * years ends up holding 25 — indistinguishable from one that pays back in
   * exactly 25. `ProposalView` printed that as "25 yrs" and the energy sheet as
   * "25.0 years", on a document a buyer signs against. The narrative already
   * knew, guarding on `< 25`, but the headline number did not.
   *
   * A flag rather than a nullable number on purpose: `paybackYears` is also the
   * RANKING key in lib/comparison.ts, where "did not pay back" sorting as 25 is
   * the correct order, and a null there would have to be special-cased at every
   * comparison. Callers that PRINT must consult this; callers that SORT need not.
   */
  let paysBack = netCost <= 0;
  let yearly = annualSavings;
  let gen = annualKwh;
  for (let y = 1; netCost > 0 && y <= HORIZON_YEARS; y++) {
    cum += yearly;
    if (cum >= netCost && !paysBack) {
      payback = yearly > 0 ? y - 1 + Math.max(0, (netCost - (cum - yearly)) / yearly) : y;
      paysBack = true;
      break;
    }
    gen *= 1 - report.degradationPctPerYear / 100;
    yearly = Math.round(gen * tariff * Math.pow(1 + escalation / 100, y));
  }
  // 25-yr savings
  let total = 0;
  gen = annualKwh;
  for (let y = 0; y < HORIZON_YEARS; y++) {
    total += gen * tariff * Math.pow(1 + escalation / 100, y);
    gen *= 1 - report.degradationPctPerYear / 100;
  }
  // simple 5-yr 9.5% EMI on net cost
  const r = 0.095 / 12;
  const n = 60;
  const emi = netCost > 0 ? Math.round((netCost * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)) : 0;

  return {
    systemCostInr: systemCost,
    subsidyInr: subsidy,
    netCostInr: netCost,
    annualSavingsInr: annualSavings,
    paybackYears: Math.round(payback * 10) / 10,
    paysBackWithinHorizon: paysBack,
    savings25YrInr: Math.round(total),
    emiPerMonthInr: emi,
    tariffEscalationPct: escalation,
  };
}
