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
  const annualKwh = report.annualMwh * 1000;
  const annualSavings = Math.round(annualKwh * tariff);
  const escalation = 3; // % tariff escalation per year
  // payback with escalating tariff. Guards: zero net cost pays back at once;
  // zero yearly savings must not divide (0-panel candidates hit NaN otherwise)
  let cum = 0;
  let payback = netCost <= 0 ? 0 : 25;
  let yearly = annualSavings;
  let gen = annualKwh;
  for (let y = 1; netCost > 0 && y <= 25; y++) {
    cum += yearly;
    if (cum >= netCost && payback === 25) {
      payback = yearly > 0 ? y - 1 + Math.max(0, (netCost - (cum - yearly)) / yearly) : y;
      break;
    }
    gen *= 1 - report.degradationPctPerYear / 100;
    yearly = Math.round(gen * tariff * Math.pow(1 + escalation / 100, y));
  }
  // 25-yr savings
  let total = 0;
  gen = annualKwh;
  for (let y = 0; y < 25; y++) {
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
    savings25YrInr: Math.round(total),
    emiPerMonthInr: emi,
    tariffEscalationPct: escalation,
  };
}
