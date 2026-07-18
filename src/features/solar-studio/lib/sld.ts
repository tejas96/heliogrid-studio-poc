// ─── SLD parameters: derived defaults + user override layer ─────────────────
// Class-S derived data (cheap + pure): the sheet ALWAYS derives its ratings
// from the live project, then merges the user's explicit edits on top — the
// same proven pattern as mergedBom over the auto BOM. This replaces the old
// `sldParams` snapshot, which froze on first visit and silently went stale
// when the inverter or module changed afterwards.
import type { Project, SldParams } from '../types';
import { acBreakerA, dcCableSizeMm2, dcFuseA, dcIsolatorA } from './electrical-sizing';
import { resolveDesignTemps, vocAt } from './electrical/temps';

/**
 * Derive the full SLD parameter set from the current components. Pure — no
 * stored state. Returns null when no inverter is selected (an SLD cannot be
 * derived, and Step 8 is unreachable in that state anyway).
 * AC breaker comes from the SAME acBreakerA the BOM uses — the sheet and the
 * quote can never print two different ratings for one system.
 */
export function deriveSldDefaults(project: Project): SldParams | null {
  const inv = project.components.inverter;
  if (!inv) return null;
  const panel = project.components.panel;
  const acKw = inv.acKw * project.components.inverterCount;
  const mcb = acBreakerA(acKw, inv.phases);

  // Cold-Voc max system voltage: the LONGEST real string × the module's Voc at
  // the site's design MINIMUM temperature (Voc rises as it gets colder). This
  // is the number that must stay under the inverter's DC input — the check a
  // CEIG inspector runs, and the audit's original sin (the impossible 2794 V
  // all-panels string). Derived from REAL strings only; 0 when unstrung.
  const maxStringLength = project.strings.reduce((m, st) => Math.max(m, st.panelIds.length), 0);
  const temps = resolveDesignTemps(project);
  const maxSystemVdc =
    panel && maxStringLength > 0 ? Math.round(vocAt(panel, temps.minCellC) * maxStringLength) : 0;

  return {
    maxSystemVdc,
    inverterMaxDcV: inv.maxDcV,
    // strictly UNDER the limit; equal is already a design-margin problem
    voltageWithinLimit: maxSystemVdc === 0 || maxSystemVdc < inv.maxDcV,
    maxStringLength,
    inverterCount: project.components.inverterCount,
    inverterLabel: `${inv.brand} ${inv.model}`,
    acRatingKw: acKw,
    // DC side derived from the selected module's Isc (≥1.56×Isc per IEC 62548)
    dcCableSizeMm2: panel ? dcCableSizeMm2(panel) : 4,
    dcFuseA: panel ? dcFuseA(panel) : 20,
    dcSpdType: 'Type-II',
    dcIsolatorA: panel ? dcIsolatorA(panel) : 32,
    acCableSizeMm2: inv.phases === 3 ? 10 : 6,
    acCableType: 'PVC Cu',
    mccbA: mcb,
    acSpdType: 'Type-II',
    acIsolatorA: mcb,
    standard: 'IS/IEC 62548 · CEA (India)',
  };
}

/**
 * The parameters the SLD sheet renders: freshly derived values with the user's
 * explicit overrides merged on top. Null only when no inverter is selected.
 */
export function effectiveSld(project: Project): SldParams | null {
  const derived = deriveSldDefaults(project);
  if (!derived) return null;
  return { ...derived, ...(project.derived.sldOverrides ?? {}) };
}

/**
 * Reduce a full stored parameter set to ONLY the fields that differ from the
 * derived defaults. Null when nothing differs (the sheet stays fully live).
 * Used by the Edit-Ratings save path and the one-time sldParams migration.
 */
export function diffSldOverrides(
  stored: SldParams,
  derived: SldParams | null,
): Partial<SldParams> | null {
  if (!derived) return { ...stored }; // nothing to diff against — keep everything
  const out: Partial<SldParams> = {};
  for (const key of Object.keys(derived) as (keyof SldParams)[]) {
    if (stored[key] !== derived[key]) {
      // Partial<SldParams> assignment across the string/number union
      (out as Record<string, unknown>)[key] = stored[key];
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ─── 3-line diagram conductors (Phase 11 · task 30d) ────────────────────────
/**
 * The conductors a 3-LINE diagram must draw for the AC run. Some DISCOMs
 * require the 3-line form (every conductor shown) rather than the single-line
 * shorthand, so this is the one place the phase→conductor rule lives:
 *   3-phase → three phases + neutral + protective earth (5)
 *   1-phase → line + neutral + protective earth (3)
 * PE is ALWAYS present — an installation without an earth conductor is not a
 * drawing style, it is a fault.
 */
export function acConductorLabels(phases: 1 | 3): string[] {
  return phases === 3 ? ['L1', 'L2', 'L3', 'N', 'PE'] : ['L', 'N', 'PE'];
}

/** DC side of a 3-line diagram: the two poles plus the array earth. */
export function dcConductorLabels(): string[] {
  return ['DC+', 'DC−', 'PE'];
}
