// ─── Design Health Score v1 (§8.2, Phase 6 task 25c) ─────────────────────────
// A PURE, deterministic aggregation of the signals the app already computes:
// DRC layout issues + validateSystem electrical issues + Copilot insights.
// Scoring model: 100 − fixed code-level deductions (rule config), deduped by
// code — the fixed table is what makes monotonicity PROVABLE: fixing an issue
// removes exactly its deduction and cannot grow another category's.
//
// Double-count policy (each condition charged ONCE, to one category):
// - dc_ac_high / dc_ac_low from validateSystem are EXCLUDED — the dc-ac-ratio
//   Copilot insight scores that condition with the unified 0.90–1.35 band
//   (validateSystem's 0.80 floor disagrees; the insight is the one surface).
// - The utilization ratio is scored ONLY via the roof-utilization insight
//   (recomputing placed/max here would double-charge AND re-pay autoFillRoof).
// - imp_high is emitted once PER STRING by validateSystem for a panel-level
//   condition — the by-code dedupe collapses it, so splitting a string never
//   lowers the score (monotonicity).
//
// Snapshot key: designFp ALONE is not enough — panel solarAccess and the
// user's insightState are deliberately outside the fingerprint graph, and
// both change scores. healthKey() is the composite; the memo, the stamped
// snapshot and the delta attribution all use it.
import { resolveDesignTemps } from './electrical/temps';
import type { HealthSnapshotEntry, Project, ValidationIssue } from '../types';
import { resolveRules } from '../data/rules/india';
import { layoutIssues, structureIssues } from './drc';
import { validateSystem } from './stringing';
import { listAnalyzers, memoizedInsights } from './insights/registry';
import { registerAllAnalyzers } from './insights/analyzers';
import { designFp, isShadingFresh } from './fingerprints';
import { activeWeather } from './solar';

export type HealthCategoryKey = 'energy' | 'electrical' | 'utilization';
export type HealthBand = 'good' | 'fair' | 'poor';

export interface HealthDeduction {
  /** validation issue code or insight key — the delta unit */
  code: string;
  source: 'validation' | 'insight';
  label: string;
  points: number;
  focusIds?: string[];
}

export interface HealthCategory {
  key: HealthCategoryKey;
  /** 0–100, or null when the category is not applicable yet */
  score: number | null;
  deductions: HealthDeduction[];
}

export interface HealthResult {
  key: string;
  /** weighted mean over APPLICABLE categories; null = nothing to score yet */
  total: number | null;
  band: HealthBand | null;
  /** shading recompute in flight — energy numbers are optimistic until it lands */
  provisional: boolean;
  categories: HealthCategory[];
  /** unscored context lines (data provenance) — shown, never counted */
  context: string[];
}

/**
 * Validation code → category.
 *
 * ⚠️ A code that appears in NEITHER this map nor EXCLUDED_VALIDATION scores
 * ZERO — the loop below skips it before `unknownValidationPenalty` can apply.
 * That silent gap left twelve codes unscored, including two hard errors
 * (`unstrung_panels`, `panel_in_keepout`), which is how a design could show
 * "Good 100" with errors open. `health-coverage.test.ts` now asserts every
 * emitted code is listed in one place or the other, so the omission cannot
 * recur quietly — adding a DRC code forces a deliberate decision here.
 */
export const VALIDATION_CATEGORY: Record<string, HealthCategoryKey> = {
  panel_overlap: 'utilization',
  setback_breach: 'utilization',
  shaded: 'energy',
  voc_high: 'electrical',
  vmp_low: 'electrical',
  imp_high: 'electrical',
  mppt_overflow: 'electrical',
  panel_over_obstruction: 'utilization',
  bridge_clearance: 'utilization',
  bridge_engineer: 'utilization',
  // ── were silently unscored until Phase 22 ────────────────────────────────
  unstrung_panels: 'electrical',
  panel_in_keepout: 'utilization',
  isc_high: 'electrical',
  mppt_capacity: 'electrical',
  string_window_empty: 'electrical',
  dc_voltage_drop: 'electrical',
  group_too_small: 'electrical',
  shade_mismatch: 'energy',
  foundation_clash: 'utilization',
  foundation_too_tall: 'utilization',
};

/**
 * Codes that must NOT move the score, each for a stated reason. Silence here is
 * a decision, not an oversight.
 *
 *  · dc_ac_high / dc_ac_low — DC:AC ratio is a design CHOICE with a legitimate
 *    range, not a fault (see header).
 *  · temp_coeff_estimated — a data-provenance note about the panel datasheet,
 *    not something wrong with the design.
 *  · foundation_dead_load — we report the added mass but we do NOT check roof
 *    capacity (§F). Deducting for it would assert a structural verdict we have
 *    no basis for; the warning itself is the honest output.
 */
export const EXCLUDED_VALIDATION = new Set([
  'dc_ac_high',
  'dc_ac_low',
  'temp_coeff_estimated',
  'foundation_dead_load',
]);

/** Short human labels for deduction codes — the "What changed" panel persists
 *  only codes, so this map is the reader-facing name for every scored code. */
const CODE_LABEL: Record<string, string> = {
  panel_overlap: 'Overlapping panels',
  setback_breach: 'Panels breach the setback',
  shaded: 'Shaded panels',
  voc_high: 'String over-voltage (cold Voc)',
  vmp_low: 'String below MPPT window',
  imp_high: 'Panel current above MPPT limit',
  mppt_overflow: 'Too many strings for MPPT inputs',
  panel_over_obstruction: 'Panels over a non-bridgeable obstruction',
  bridge_clearance: 'Bridging without enough clearance',
  bridge_engineer: 'Bridge flagged for engineer confirmation',
  // ── newly scored in Phase 22 (previously silent) ──────────────────────────
  unstrung_panels: 'Panels not wired into any string',
  panel_in_keepout: 'Panels inside a no-build zone',
  isc_high: 'String current above MPPT limit',
  mppt_capacity: 'Not enough MPPT capacity',
  string_window_empty: 'No legal string length for this array',
  dc_voltage_drop: 'DC voltage drop above limit',
  group_too_small: 'Panel group too small to string',
  shade_mismatch: 'Mismatched shading within a string',
  foundation_clash: 'Foundations land where they cannot be built',
  foundation_too_tall: 'Foundation taller than its clearance',
};
const ANALYZER_LABEL: Record<string, string> = {
  'dc-ac-ratio': 'DC/AC ratio out of the 0.90–1.35 band',
  'roof-utilization': 'Large unused roof capacity',
  orientation: 'Tilted panels far off south',
  'row-spacing': 'Rows tighter than the shadow-free pitch',
};

/** Reader-facing name for a deduction code (insight keys are analyzerId:subject). */
export function describeHealthCode(code: string): string {
  return CODE_LABEL[code] ?? ANALYZER_LABEL[code.split(':')[0]] ?? code;
}

/** Composite recompute/snapshot key — see header for why designFp alone lies.
 *  Registered analyzers join the key (they change insight output), and the
 *  core pack is registered here so the key never depends on import order. */
export function healthKey(p: Project): string {
  registerAllAnalyzers();
  return (
    designFp(p) +
    '§' +
    (p.derived.solarAccessFp ?? '') +
    '§' +
    JSON.stringify(p.insightState) +
    '§' +
    listAnalyzers()
      .map((a) => a.id)
      .join(',')
  );
}

export function bandOf(total: number | null): HealthBand | null {
  if (total === null) return null;
  const { goodMin, fairMin } = resolveRules().health.bands;
  return total >= goodMin ? 'good' : total >= fairMin ? 'fair' : 'poor';
}

/** Pure scorer. Deterministic for identical (project, registered analyzers). */
export function computeHealth(project: Project): HealthResult {
  registerAllAnalyzers(); // idempotent — score must not depend on import order
  const rules = resolveRules().health;
  const spec = project.components.panel;
  const inverter = project.components.inverter;
  const enabled = project.panels.filter((x) => x.enabled);

  const applicable: Record<HealthCategoryKey, boolean> = {
    energy: enabled.length > 0,
    electrical: enabled.length > 0 && spec != null && inverter != null,
    utilization: enabled.length > 0 && project.roofs.length > 0 && spec != null,
  };

  // ── collect validation issues, dedupe by code (imp_high inflation guard) ──
  const issues: ValidationIssue[] = spec
    ? [
        ...layoutIssues(project, spec),
        ...structureIssues(project, spec),
        ...validateSystem(
          project.strings,
          spec,
          inverter,
          project.components.inverterCount,
          enabled.length,
          resolveDesignTemps(project),
          // WITHOUT this the unstrung-panels check never runs, so the score was
          // structurally blind to an error the Step-6 banner was showing at the
          // same moment — the chip could read "Good 100" beside a hard ERROR.
          // Step6Editor has always passed it; health.ts silently did not.
          enabled.map((p) => p.id),
        ),
      ]
    : [];
  const byCode = new Map<string, ValidationIssue>();
  for (const iss of issues) {
    if (EXCLUDED_VALIDATION.has(iss.code)) continue;
    if (!byCode.has(iss.code)) byCode.set(iss.code, iss);
  }

  const deductions: Record<HealthCategoryKey, HealthDeduction[]> = {
    energy: [],
    electrical: [],
    utilization: [],
  };
  for (const [code, iss] of byCode) {
    const cat = VALIDATION_CATEGORY[code];
    if (!cat || !applicable[cat]) continue;
    deductions[cat].push({
      code,
      source: 'validation',
      label: iss.message,
      points: rules.validationPenalties[code] ?? rules.unknownValidationPenalty,
      focusIds: iss.focusPanelIds,
    });
  }

  // ── Copilot insights (user-ignored ones are already filtered out — a
  // conscious dismissal legitimately clears its deduction, and the key
  // includes insightState so the change is attributed, not silent) ──
  for (const ins of memoizedInsights(project)) {
    const cat = ins.category as HealthCategoryKey;
    if (cat !== 'energy' && cat !== 'electrical' && cat !== 'utilization') continue;
    if (!applicable[cat]) continue;
    const points = rules.insightPenalties[ins.severity];
    if (points <= 0) continue;
    deductions[cat].push({
      code: ins.key,
      source: 'insight',
      label: ins.title,
      points,
      focusIds: ins.focusIds,
    });
  }

  const categories: HealthCategory[] = (['energy', 'electrical', 'utilization'] as const).map(
    (key) => ({
      key,
      score: applicable[key]
        ? Math.max(0, 100 - deductions[key].reduce((s, d) => s + d.points, 0))
        : null,
      deductions: deductions[key].sort((a, b) => b.points - a.points || a.code.localeCompare(b.code)),
    }),
  );

  let wSum = 0;
  let acc = 0;
  for (const c of categories) {
    if (c.score === null) continue;
    const w = rules.weights[c.key];
    wSum += w;
    acc += w * c.score;
  }
  const total = wSum > 0 ? Math.round(acc / wSum) : null;

  const context: string[] = [];
  if (enabled.length > 0) {
    context.push(
      activeWeather(project.location)
        ? 'Irradiance: PVGIS-measured for this pin'
        : 'Irradiance: built-in estimate (±10%) — confirm the location in Step 1',
    );
    const ai = [...project.roofs, ...project.obstructions].filter(
      (e) => e.provenance && e.provenance.source !== 'manual',
    ).length;
    if (ai > 0) context.push(`${ai} AI-detected entities — dimensions are detector estimates`);
    if (project.calibration.reference !== null) context.push('Scale calibrated against a known distance');
  }

  return {
    key: healthKey(project),
    total,
    band: bandOf(total),
    provisional: !isShadingFresh(project),
    categories,
    context,
  };
}

/** The serializable slice the snapshot persists — code lists per category. */
export function toSnapshotEntry(r: HealthResult): HealthSnapshotEntry {
  return {
    key: r.key,
    total: r.total,
    provisional: r.provisional,
    categories: r.categories.map((c) => ({
      key: c.key,
      score: c.score,
      codes: c.deductions.map((d) => d.code),
    })),
  };
}

export interface HealthDelta {
  category: HealthCategoryKey;
  from: number | null;
  to: number | null;
  /** deduction codes that appeared (score went down because of these) */
  added: string[];
  /** deduction codes that resolved (score went up because of these) */
  removed: string[];
}

/** Name-level "why did it change" — the explain-delta gate. */
export function explainDelta(
  prev: HealthSnapshotEntry,
  current: HealthSnapshotEntry,
): HealthDelta[] {
  const out: HealthDelta[] = [];
  for (const cur of current.categories) {
    const old = prev.categories.find((c) => c.key === cur.key);
    const from = old?.score ?? null;
    const oldCodes = new Set(old?.codes ?? []);
    const newCodes = new Set(cur.codes);
    const added = cur.codes.filter((c) => !oldCodes.has(c));
    const removed = [...oldCodes].filter((c) => !newCodes.has(c));
    if (from === cur.score && added.length === 0 && removed.length === 0) continue;
    out.push({ category: cur.key, from, to: cur.score, added, removed });
  }
  return out;
}

/**
 * Pure stamping decision for useHealthSync: the next snapshot to persist, or
 * null when the stored one is already in sync (the no-write-loop invariant —
 * feeding the returned snapshot back into the project yields null forever).
 */
export function nextHealthSnapshot(
  p: Project,
): { current: HealthSnapshotEntry; prev: HealthSnapshotEntry | null } | null {
  const stored = p.derived.healthSnapshot;
  if (stored?.current.key === healthKey(p)) return null;
  return {
    current: toSnapshotEntry(memoizedHealth(p)),
    // a PROVISIONAL intermediate (stamped mid shading-recompute) is replaced,
    // not chained — "what changed" must always compare settled states, or a
    // geometry edit would blame the optimistic in-between values
    prev: stored ? (stored.current.provisional ? (stored.prev ?? null) : stored.current) : null,
  };
}

// ─── Memoized selector (memoizedInsights pattern) ────────────────────────────

let memoKey: string | null = null;
let memoValue: HealthResult | null = null;

/** computeHealth with last-value memoization keyed on the composite key. */
export function memoizedHealth(project: Project): HealthResult {
  const key = healthKey(project);
  if (key !== memoKey || memoValue === null) {
    memoKey = key;
    memoValue = computeHealth(project);
  }
  return memoValue;
}

/** Test helper — drop the memo between cases. */
export function resetHealthMemo(): void {
  memoKey = null;
  memoValue = null;
}
