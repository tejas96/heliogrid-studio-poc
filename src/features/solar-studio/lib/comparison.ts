// ─── Component comparison matrix (§8.6, Phase 6 task 25b) ────────────────────
// Runs the EXISTING pure pipelines (fill → autoString → computeEnergyReport →
// computeFinancials) per candidate component set on a deterministically
// constructed hypothetical design. NO scoring black box: raw comparable
// numbers plus ONE highlighted recommendation whose rule is spelled out in
// the decision log.
//
// Honesty contract (surfaced in the UI basis line):
// - Candidates assume UNSHADED panels (solarAccess=1 — the raycast engine
//   never ran on a hypothetical layout). Identical treatment for every row
//   keeps the comparison fair; absolute kWh is provisional.
// - Rows are CATALOG-priced: user BOM overrides/custom lines are stripped so
//   candidates are apples-to-apples (overrides key on brand+model and would
//   apply only to the currently selected components).
// - Fill is budgeted by targetKwp in roof ARRAY order — deliberately NOT the
//   raycast-ranked order auto-design uses; a synchronous compare must not
//   raycast, and capacity comparability (not layout fidelity) is the goal.
import { resolveDesignTemps } from './electrical/temps';
import type {
  ArraySegment,
  DesignDecision,
  InverterSpec,
  PanelSpec,
  PlacedPanel,
  Project,
} from '../types';
import { resolveCatalog } from '../data/catalog';
import { DEFAULT_FILL, fillRoofAsSegment } from './layout';
import { reindexSegment } from './segment-ops';
import { autoString, validateSystem } from './stringing';
import { activeWeather, computeEnergyReport } from './solar';
import { computeFinancials } from './finance';
import { designFp } from './fingerprints';

export interface CandidateInput {
  panel: PanelSpec;
  /** absent ⇒ pick via recommendInverterFor on the candidate's achieved kWp */
  inverter?: InverterSpec;
  inverterCount?: number;
  isCurrent?: boolean;
}

export interface ComparisonRow {
  key: string; // `${panelId}|${inverterId}|${count}` — stable across runs
  isCurrent: boolean;
  panel: PanelSpec;
  inverter: InverterSpec | null;
  inverterCount: number;
  panelsPlaced: number;
  achievedKwp: number;
  moduleEfficiencyPct: number;
  annualKwh: number;
  systemCostInr: number;
  subsidyInr: number;
  netCostInr: number;
  annualSavingsInr: number;
  paybackYears: number;
  savings25YrInr: number;
  /** 25-yr savings as % of net cost (derived — FinancialSummary has no ROI field) */
  roi25Pct: number | null;
  dcAcRatio: number | null;
  stringFeasible: boolean;
  /** error-level cause when the row is NOT feasible (or why nothing fits) */
  feasibilityNote: string | null;
  /** warn-level caveat on an otherwise feasible row — ALWAYS rendered */
  warnNote: string | null;
  arrayWeightKg: number | null;
  installComplexity: 'low' | 'medium' | 'high';
}

export interface ComparisonResult {
  rows: ComparisonRow[];
  recommendedKey: string | null;
  decisions: DesignDecision[];
  /** what every row was computed against */
  basis: {
    objective: 'target_kwp' | 'max_roof';
    targetKwp: number;
    catalogVersion: string;
    catalogProvenance: string;
    irradianceSource: 'PVGIS' | 'estimate';
  };
  warnings: string[];
}

/**
 * Deterministic hypothetical design for one component set: budgeted fill in
 * roof array order + auto-strung, BOM overrides stripped, margin kept (equal
 * across rows). The CURRENT selection is routed through this SAME constructor
 * so the determinism gate (row === single-run pipelines) holds for it too.
 */
export function buildCandidateProject(
  project: Project,
  panel: PanelSpec,
  inverter: InverterSpec | null,
  inverterCount: number,
): Project {
  const budget =
    project.components.targetKwp > 0
      ? Math.floor((project.components.targetKwp * 1000) / panel.watt)
      : Infinity;
  const panels: PlacedPanel[] = [];
  const segments: ArraySegment[] = [];
  let remaining = budget;
  for (const roof of project.roofs) {
    if (remaining <= 0) break;
    const filled = fillRoofAsSegment(project, roof, panel, {
      ...DEFAULT_FILL,
      // this constructor REPLACES the layout in the candidate it returns — the
      // live project's panels must not block the hypothetical fill (the fill's
      // default now avoids project.panels)
      avoidPanels: [],
      maxPanels: Number.isFinite(remaining) ? remaining : undefined,
    });
    if (!filled) continue;
    const re = reindexSegment(roof, panel, filled.segment, filled.panels);
    re.segment.label = `A${segments.length + 1}`;
    segments.push(re.segment);
    panels.push(...re.panels);
    remaining -= re.panels.length;
  }
  const strings = inverter
    ? autoString(panels, panel, inverter, inverterCount, resolveDesignTemps(project))
    : [];
  return {
    ...project,
    components: { ...project.components, panel, inverter, inverterCount },
    panels,
    segments,
    strings,
    bomOverrides: [],
  };
}

/**
 * Best (inverter, count) for a DC capacity: DC/AC in the 0.90–1.35 band
 * (matching the Step-4 recommendation filter and the Copilot analyzer),
 * closest to 1.15, tie-broken by lower total price. Single-phase supply
 * restricts to 1φ inverters. Returns null when nothing lands in the band.
 */
export function recommendInverterFor(
  dcKwp: number,
  phase: 1 | 3,
  inverters: InverterSpec[],
  maxCount = 4,
): { inverter: InverterSpec; count: number } | null {
  if (dcKwp <= 0) return null;
  let best: { inverter: InverterSpec; count: number; dist: number; price: number } | null = null;
  for (const inv of inverters) {
    if (phase === 1 && inv.phases !== 1) continue;
    for (let count = 1; count <= maxCount; count++) {
      const ratio = dcKwp / (inv.acKw * count);
      if (ratio < 0.9 || ratio > 1.35) continue;
      const dist = Math.abs(ratio - 1.15);
      const price = inv.priceInr * count;
      if (!best || dist < best.dist - 1e-9 || (Math.abs(dist - best.dist) <= 1e-9 && price < best.price)) {
        best = { inverter: inv, count, dist, price };
      }
    }
  }
  return best ? { inverter: best.inverter, count: best.count } : null;
}

/**
 * Nearest-ratio fallback when nothing lands in the band (e.g. 4.3 kWp on a
 * single-phase catalog with 3/5/6 kW steps ⇒ best ratio 0.86). The row still
 * gets a real inverter + BOM + finance; validateSystem's DC/AC warning is
 * surfaced on the row instead of a blank, misleading ₹0 line.
 */
function nearestInverterFit(
  dcKwp: number,
  phase: 1 | 3,
  inverters: InverterSpec[],
  maxCount = 4,
): { inverter: InverterSpec; count: number } | null {
  if (dcKwp <= 0) return null;
  // two passes: the energy pipeline has NO clipping model, so a >1.35 ratio
  // would show kWh the inverter cannot actually deliver — prefer the
  // oversized (honest) side and only allow clipping fits when nothing else
  // exists at all
  for (const allowClipping of [false, true]) {
    let best: { inverter: InverterSpec; count: number; dist: number; price: number } | null = null;
    for (const inv of inverters) {
      if (phase === 1 && inv.phases !== 1) continue;
      for (let count = 1; count <= maxCount; count++) {
        const ratio = dcKwp / (inv.acKw * count);
        if (!allowClipping && ratio > 1.35) continue;
        const dist = Math.abs(ratio - 1.15);
        const price = inv.priceInr * count;
        if (!best || dist < best.dist - 1e-9 || (Math.abs(dist - best.dist) <= 1e-9 && price < best.price)) {
          best = { inverter: inv, count, dist, price };
        }
      }
    }
    if (best) return { inverter: best.inverter, count: best.count };
  }
  return null;
}

/**
 * Transparent shortlist: ALMM-listed catalog panels ranked by ₹ per W
 * (cheapest capacity first), capped, with the current selection always
 * included. The rule is returned as text so the UI can state it verbatim.
 */
export function shortlistPanels(
  project: Project,
  max = 6,
): { panels: PanelSpec[]; rule: string } {
  const cat = resolveCatalog();
  const current = project.components.panel;
  const ranked = cat.panels
    .filter((p) => p.almm)
    .sort((a, b) => a.priceInr / a.watt - b.priceInr / b.watt);
  // current selection first (even when non-ALMM), then the ranking — never a
  // lost slot, and the rule text reports what was ACTUALLY built
  const rest = ranked.filter((p) => !current || p.id !== current.id);
  const list = current ? [current, ...rest].slice(0, max) : rest.slice(0, max);
  const rule =
    `ALMM-listed panels ranked by ₹/W (cheapest capacity first) — showing ${list.length}` +
    (current
      ? current.almm
        ? ' incl. your current selection'
        : ' plus your current selection (not ALMM-listed)'
      : '');
  return { panels: list, rule };
}

function complexityOf(panelsPlaced: number): 'low' | 'medium' | 'high' {
  return panelsPlaced <= 12 ? 'low' : panelsPlaced <= 30 ? 'medium' : 'high';
}

/** Run the full pipeline chain for every candidate. Pure and deterministic. */
export function compareCandidates(
  project: Project,
  candidates: CandidateInput[],
  shortlistRule?: string,
): ComparisonResult {
  const cat = resolveCatalog();
  const phase: 1 | 3 = project.info.connectionType === 'three' ? 3 : 1;
  const objective = project.components.targetKwp > 0 ? 'target_kwp' : 'max_roof';
  const warnings: string[] = [];
  if (project.roofs.length === 0) warnings.push('Draw a roof first — capacity is 0 for every option.');

  const rows: ComparisonRow[] = [];
  for (const c of candidates) {
    // fill depends only on the panel — do it first, then pick the inverter
    const prefill = buildCandidateProject(project, c.panel, null, 1);
    const placedKwp = (prefill.panels.length * c.panel.watt) / 1000;
    const pick =
      c.inverter != null
        ? { inverter: c.inverter, count: c.inverterCount ?? 1 }
        : (recommendInverterFor(placedKwp, phase, cat.inverters) ??
          nearestInverterFit(placedKwp, phase, cat.inverters));
    const inverter = pick?.inverter ?? null;
    const inverterCount = pick?.count ?? 1;

    const candidate = buildCandidateProject(project, c.panel, inverter, inverterCount);
    const report = computeEnergyReport(candidate);
    const fin = computeFinancials(candidate, report);
    const n = candidate.panels.length;
    const issues = inverter
      ? validateSystem(candidate.strings, c.panel, inverter, inverterCount, n, resolveDesignTemps(project))
      : [];
    const errors = issues.filter((i) => i.level === 'error');
    const warns = issues.filter((i) => i.level === 'warn');
    const areaM2 = (c.panel.lengthMm / 1000) * (c.panel.widthMm / 1000);
    const acKw = inverter ? inverter.acKw * inverterCount : 0;
    const ratio = acKw > 0 ? Math.round(((n * c.panel.watt) / 1000 / acKw) * 100) / 100 : null;
    // a warn NEVER hides: validateSystem's message first, else an out-of-band
    // note for fallback fits sitting in validateSystem's 0.80-0.90 silence zone
    let warnNote = n > 0 ? (warns[0]?.message ?? null) : null;
    if (!warnNote && n > 0 && ratio !== null && (ratio < 0.9 || ratio > 1.35)) {
      warnNote = `DC/AC ${ratio} is outside the recommended 0.90\u20131.35 band \u2014 nearest catalog fit`;
    }
    // distinguish a budget-starved zero from a genuine geometric fit failure
    const budgetZero =
      project.components.targetKwp > 0 &&
      Math.floor((project.components.targetKwp * 1000) / c.panel.watt) === 0;

    rows.push({
      key: `${c.panel.id}|${inverter?.id ?? 'none'}|${inverterCount}`,
      isCurrent: c.isCurrent ?? false,
      panel: c.panel,
      inverter,
      inverterCount,
      panelsPlaced: n,
      achievedKwp: Math.round(((n * c.panel.watt) / 1000) * 100) / 100,
      moduleEfficiencyPct: Math.round((c.panel.watt / (areaM2 * 1000)) * 1000) / 10,
      annualKwh: Math.round(report.annualMwh * 1000),
      systemCostInr: fin.systemCostInr,
      subsidyInr: fin.subsidyInr,
      netCostInr: fin.netCostInr,
      annualSavingsInr: fin.annualSavingsInr,
      paybackYears: fin.paybackYears,
      savings25YrInr: fin.savings25YrInr,
      roi25Pct:
        fin.netCostInr > 0 ? Math.round((fin.savings25YrInr / fin.netCostInr) * 100) : null,
      dcAcRatio: ratio,
      stringFeasible: n > 0 && inverter != null && errors.length === 0,
      feasibilityNote:
        n === 0
          ? budgetZero
            ? `Target ${project.components.targetKwp} kWp is below one ${c.panel.watt} W module \u2014 raise the target`
            : 'No panels fit the drawn roofs'
          : inverter == null
            ? 'No inverter lands in the 0.90\u20131.35 DC/AC band for this capacity'
            : (errors[0]?.message ?? null),
      warnNote,
      arrayWeightKg: c.panel.weightKg != null ? Math.round(c.panel.weightKg * n) : null,
      installComplexity: complexityOf(n),
    });
  }

  if (
    project.roofs.length > 0 &&
    project.components.targetKwp > 0 &&
    rows.length > 0 &&
    rows.every((r) => r.panelsPlaced === 0)
  ) {
    warnings.push('Your target capacity is smaller than a single panel \u2014 every option places 0 panels.');
  }

  // ── transparent recommendation: feasible rows WITHOUT clipping risk (the
  // energy model has no clipping term, so a >1.35 row's kWh cannot fairly
  // compete), lowest payback first ──
  const eligible = rows.filter(
    (r) => r.stringFeasible && (r.dcAcRatio == null || r.dcAcRatio <= 1.35),
  );
  const rankedRows = [...eligible].sort(
    (a, b) =>
      a.paybackYears - b.paybackYears ||
      b.savings25YrInr - a.savings25YrInr ||
      a.netCostInr - b.netCostInr,
  );
  const winner = rankedRows[0] ?? null;
  const runnerUp = rankedRows[1] ?? null;

  const decisions: DesignDecision[] = [
    {
      id: 'comparison-basis',
      topic: 'Comparison basis',
      choice:
        objective === 'target_kwp'
          ? `Every option filled toward your ${project.components.targetKwp} kWp target`
          : 'Every option filled to maximum roof capacity (no target set)',
      reason:
        'All rows use the same rules: your drawn roofs with setbacks/obstructions, unshaded-panel energy estimate (final numbers come from the placed design), catalog prices without your BOM edits, and your saved margin.',
      inputs: [
        `targetKwp=${project.components.targetKwp}`,
        `catalog=${cat.catalogVersion} (${cat.provenance})`,
        `irradiance=${activeWeather(project.location) ? 'PVGIS' : 'estimate'}`,
        `marginPct=${project.pricing?.marginPct ?? 'default'}`,
      ],
    },
  ];
  if (shortlistRule) {
    decisions.push({
      id: 'shortlist',
      topic: 'Which options are compared',
      choice: shortlistRule,
      reason: 'A fixed, stated rule — not a black-box score — decides what enters the table.',
      inputs: [`candidates=${rows.length}`],
    });
  }
  if (winner) {
    decisions.push({
      id: 'recommendation',
      topic: `Recommended: ${winner.panel.brand} ${winner.panel.model}`,
      choice: `Payback ${winner.paybackYears} yr · net ₹${winner.netCostInr.toLocaleString('en-IN')} · ${winner.annualKwh.toLocaleString('en-IN')} kWh/yr`,
      reason: runnerUp
        ? `Lowest payback among electrically feasible options without clipping risk (next best: ${runnerUp.panel.brand} ${runnerUp.panel.model} at ${runnerUp.paybackYears} yr). Ties would break by 25-yr savings, then net cost.`
        : 'The only electrically feasible option without clipping risk in the shortlist.',
      inputs: [
        `payback=${winner.paybackYears}yr`,
        `savings25=₹${winner.savings25YrInr.toLocaleString('en-IN')}`,
        `netCost=₹${winner.netCostInr.toLocaleString('en-IN')}`,
      ],
    });
  }

  return {
    rows,
    recommendedKey: winner?.key ?? null,
    decisions,
    basis: {
      objective,
      targetKwp: project.components.targetKwp,
      catalogVersion: cat.catalogVersion,
      catalogProvenance: cat.provenance,
      irradianceSource: activeWeather(project.location) ? 'PVGIS' : 'estimate',
    },
    warnings,
  };
}

/** Shortlist + compare in one call — what the Step-4 sheet renders. */
export function compareShortlist(project: Project): ComparisonResult {
  const { panels, rule } = shortlistPanels(project);
  const currentId = project.components.panel?.id;
  const candidates: CandidateInput[] = panels.map((p) => ({
    panel: p,
    // the CURRENT row keeps the user's own inverter choice when one is set
    ...(p.id === currentId && project.components.inverter
      ? {
          inverter: project.components.inverter,
          inverterCount: project.components.inverterCount,
          isCurrent: true,
        }
      : { isCurrent: p.id === currentId }),
  }));
  return compareCandidates(project, candidates, rule);
}

// ─── Memoized selector (same pattern as memoizedInsights) ────────────────────

let memoKey: string | null = null;
let memoValue: ComparisonResult | null = null;

/**
 * compareShortlist with last-value memoization keyed on designFp + catalog
 * version. Candidate rows never read measured solarAccess (the constructor
 * synthesizes unshaded layouts), so no shading stamp belongs in the key.
 */
export function memoizedComparison(project: Project): ComparisonResult {
  const key = designFp(project) + '§' + resolveCatalog().catalogVersion;
  if (key !== memoKey || memoValue === null) {
    memoKey = key;
    memoValue = compareShortlist(project);
  }
  return memoValue;
}

/** Test helper — drop the memo between cases. */
export function resetComparisonMemo(): void {
  memoKey = null;
  memoValue = null;
}
