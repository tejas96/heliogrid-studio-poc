// ─── Proposal storytelling: narrative assembled ONLY from real data (§8.8) ──
// The customer reads sentences, not a spreadsheet — but every sentence here is
// a template with slots filled from the PROJECT. Nothing is generated,
// embellished, or invented: each beat carries the exact facts it was built
// from, so the traceability test can prove no number appeared out of thin air.
// This is the honest version of a "premium proposal" — persuasive because it is
// true, not because it reads well.
import type { DesignDecision, Project } from '../types';
import { computeEnergyReport } from './solar';
import { computeFinancials } from './finance';
import { estimateMaxCapacityKwp } from './layout';

export interface NarrativeBeat {
  text: string;
  /** the raw project-derived values this sentence was built from (traceability) */
  facts: (string | number)[];
}
export interface NarrativeSection {
  title: string;
  beats: NarrativeBeat[];
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Assemble the customer narrative. Pure f(project). Sections with no real data
 * are omitted rather than padded — an empty design tells no story.
 */
export function proposalNarrative(project: Project, fmtArea: (m2: number) => string): NarrativeSection[] {
  const r = computeEnergyReport(project);
  const spec = project.components.panel;
  if (!spec || r.panelCount === 0) return [];
  const fin = computeFinancials(project, r);
  const sections: NarrativeSection[] = [];

  // ── Your property ────────────────────────────────────────────────────────
  const site: NarrativeBeat[] = [];
  if (project.location?.address) {
    site.push({
      text: `This proposal is prepared for your site at ${project.location.address}.`,
      facts: [project.location.address],
    });
  }
  site.push({
    text: `We modelled ${fmtArea(r.roofAreaM2)} of usable roof and placed ${r.panelCount} panels of ${spec.watt} W each.`,
    facts: [r.roofAreaM2, r.panelCount, spec.watt],
  });
  sections.push({ title: 'Your rooftop', beats: site });

  // ── The system ───────────────────────────────────────────────────────────
  const sys: NarrativeBeat[] = [
    {
      text: `Your system is rated ${r.capacityKwp} kWp${
        project.components.inverter
          ? `, paired with ${project.components.inverterCount}× ${project.components.inverter.brand} ${project.components.inverter.model} inverter${project.components.inverterCount > 1 ? 's' : ''}`
          : ''
      }.`,
      facts: [r.capacityKwp, project.components.inverterCount],
    },
  ];
  if (r.avgSolarAccessPct > 0) {
    sys.push({
      text: `Across the year the array receives ${r.avgSolarAccessPct}% of available sunlight — the shadow study on the previous pages shows how obstructions were worked around.`,
      facts: [r.avgSolarAccessPct],
    });
  }
  sections.push({ title: 'Your system', beats: sys });

  // ── Energy & savings ─────────────────────────────────────────────────────
  const money: NarrativeBeat[] = [
    {
      text: `It is expected to generate about ${r.annualMwh} MWh in year one${
        r.irradianceSource === 'PVGIS' ? ', using measured PVGIS climate data for your location' : ''
      }.`,
      // the source is only a FACT when the sentence actually names it (PVGIS) —
      // an unshown fact is an untraceable claim
      facts: r.irradianceSource === 'PVGIS' ? [r.annualMwh, 'PVGIS'] : [r.annualMwh],
    },
    {
      text: `Over 25 years, after panel degradation, that is roughly ${r.lifetimeMwh25} MWh of clean electricity.`,
      facts: [r.lifetimeMwh25],
    },
  ];
  if (fin.paybackYears > 0 && fin.paybackYears < 25) {
    money.push({
      text: `At your current tariff the system pays for itself in about ${fin.paybackYears.toFixed(1)} years, then keeps saving for the rest of its life — an estimated ${inr(fin.savings25YrInr)} over 25 years.`,
      facts: [fin.paybackYears, fin.savings25YrInr],
    });
  }
  if (fin.subsidyInr > 0) {
    money.push({
      text: `A government subsidy of ${inr(fin.subsidyInr)} has been applied to your net cost.`,
      facts: [fin.subsidyInr],
    });
  }
  sections.push({ title: 'Energy & savings', beats: money });

  // ── Why this design (from the REAL decision log, not prose) ───────────────
  const log: DesignDecision[] = project.designLog ?? [];
  const notable = log.filter((d) => d.reason && d.topic).slice(0, 3);
  if (notable.length > 0) {
    sections.push({
      title: 'Why this design',
      beats: notable.map((d) => ({
        text: `${d.topic}: ${d.reason}`,
        facts: [d.topic, d.choice],
      })),
    });
  }

  // ── Room to grow ─────────────────────────────────────────────────────────
  const max = estimateMaxCapacityKwp(project, spec);
  const headroomKwp = Math.round((max.kwp - r.capacityKwp) * 10) / 10;
  if (headroomKwp >= 0.5) {
    sections.push({
      title: 'Room to grow',
      beats: [
        {
          text: `Your roof could hold up to ${max.kwp} kWp — about ${headroomKwp} kWp of headroom remains for a future expansion.`,
          facts: [max.kwp, headroomKwp],
        },
      ],
    });
  }

  return sections;
}
