// ─── Stringing engine: auto grouping + live electrical validation ──────────
import type {
  InverterSpec,
  PanelSpec,
  PlacedPanel,
  Project,
  StringDef,
  ValidationIssue,
} from '../types';
import { genId } from './geo';
import { vocAt, type DesignTemps } from './electrical/temps';
import { stringSizing } from './electrical/window';
import { autoStringPlan } from './electrical/autostring';

/** Re-exported for callers that only need one module's cold Voc. */
export function vocAtTemp(spec: PanelSpec, tempC: number): number {
  return vocAt(spec, tempC);
}

export { STRING_COLORS, stringSizing, type StringSizing } from './electrical/window';

/**
 * LEGACY shim — the real planner is lib/electrical/autostring.ts.
 * Kept because callers that only want the strings (comparison matrix, SLD
 * fallback) shouldn't have to handle the issue list. Anything user-facing
 * should use `autoStringPlan` so the refusals are visible instead of silent.
 */
export function autoString(
  panels: PlacedPanel[],
  panel: PanelSpec,
  inverter: InverterSpec,
  inverterCount: number,
  temps: DesignTemps,
): StringDef[] {
  return autoStringPlan(
    { panels, segments: [], roofs: [] } as unknown as Project,
    panel,
    inverter,
    inverterCount,
    temps,
  ).strings;
}

/** Live validation (improvement over reference: inline electrical checks). */
export function validateSystem(
  strings: StringDef[],
  panel: PanelSpec | null,
  inverter: InverterSpec | null,
  inverterCount: number,
  totalPanels: number,
  temps: DesignTemps,
  /** enabled panel ids — pass them to catch panels no string covers */
  enabledPanelIds?: string[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!panel || !inverter) return issues;
  const sizing = stringSizing(panel, inverter, temps);
  // an EMPTY window is a component-pairing fault, not a per-string one: say it
  // once, name both parts, and don't bury it under N derived string errors
  if (sizing.impossible) {
    issues.push({
      level: 'error',
      code: 'string_window_empty',
      message: `${panel.brand} ${panel.model} + ${inverter.brand} ${inverter.model}: ${sizing.impossible}`,
    });
  }

  for (const s of strings) {
    const n = s.panelIds.length;
    const vocCold = Math.round(vocAt(panel, sizing.temps.minCellC) * n);
    if (n > sizing.maxPanels) {
      issues.push({
        level: 'error',
        code: 'voc_high',
        message: `${s.name}: ${n} panels → ${vocCold}V cold Voc exceeds max DC ${inverter.maxDcV}V (max ${sizing.maxPanels}/string)`,
        focusPanelIds: s.panelIds,
      });
    } else if (n < sizing.minPanels) {
      issues.push({
        level: 'warn',
        code: 'vmp_low',
        message: `${s.name}: ${n} panels may fall below MPPT window ${inverter.mppt.minV}V at ${sizing.temps.maxCellC}°C cell (min ${sizing.minPanels}/string)`,
        focusPanelIds: s.panelIds,
      });
    }
    if (panel.impA > inverter.mppt.maxCurrentA) {
      issues.push({
        level: 'warn',
        code: 'imp_high',
        message: `${s.name}: panel Imp ${panel.impA}A exceeds MPPT input limit ${inverter.mppt.maxCurrentA}A`,
        focusPanelIds: s.panelIds,
      });
    }
  }

  const dcKw = (totalPanels * panel.watt) / 1000;
  const acKw = inverter.acKw * inverterCount;
  if (acKw > 0) {
    const ratio = dcKw / acKw;
    if (ratio > 1.35)
      issues.push({
        level: 'warn',
        code: 'dc_ac_high',
        message: `DC/AC ratio ${ratio.toFixed(2)} is high (>1.35) — expect clipping losses`,
      });
    // 0.90 floor = ONE band across every surface (Step-4 readout/recommender,
    // comparison matrix, Copilot analyzer, health score) — a looser floor here
    // made Step 6 read "all checks pass" while the health score deducted
    else if (ratio < 0.9 && dcKw > 0)
      issues.push({
        level: 'warn',
        code: 'dc_ac_low',
        message: `DC/AC ratio ${ratio.toFixed(2)} is low (<0.90) — inverter is oversized`,
      });
  }
  // An enabled panel outside every string is a HOLE in the design: it is
  // counted in capacity, priced in the BOM and drawn on the layout, but no
  // conductor reaches it. Auto-stringing now leaves panels unstrung rather than
  // inventing illegal strings, so this is the check that makes that refusal
  // visible — and it stays true however the strings were authored (manual too).
  if (enabledPanelIds && enabledPanelIds.length > 0) {
    const strung = new Set(strings.flatMap((s) => s.panelIds));
    const orphans = enabledPanelIds.filter((id) => !strung.has(id));
    if (orphans.length > 0) {
      issues.push({
        level: 'error',
        code: 'unstrung_panels',
        message: `${orphans.length} enabled panel${orphans.length > 1 ? 's are' : ' is'} not wired into any string — they add cost and capacity but generate nothing`,
        focusPanelIds: orphans,
      });
    }
  }

  const usedSlots = strings.length;
  const slots = inverter.mppt.count * inverterCount;
  if (usedSlots > slots)
    issues.push({
      level: 'error',
      code: 'mppt_overflow',
      message: `${usedSlots} strings exceed available ${slots} MPPT inputs`,
    });
  return issues;
}

/** Approximate DC cable run: serpentine within strings + home-run, meters. */
export function estimateDcCableM(
  strings: StringDef[],
  panels: PlacedPanel[],
  homeRunM = 15,
): number {
  const byId = new Map(panels.map((p) => [p.id, p]));
  let total = 0;
  for (const s of strings) {
    let prev: PlacedPanel | undefined;
    for (const id of s.panelIds) {
      const p = byId.get(id);
      if (!p) continue;
      if (prev)
        total += Math.hypot(p.center.x - prev.center.x, p.center.y - prev.center.y);
      prev = p;
    }
    total += homeRunM; // + and − home runs averaged
  }
  return Math.round(total * 2); // pair of conductors
}
