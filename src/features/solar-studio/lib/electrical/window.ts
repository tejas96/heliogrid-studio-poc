// ─── The series-length window a panel/inverter pair allows ──────────────────
// Extracted from lib/stringing.ts so lib/electrical/ owns the electrical model
// end-to-end (plan §B) and autostring can use it without importing back into
// stringing.ts — the cycle that layering exists to prevent.
import type { InverterSpec, PanelSpec } from '../../types';
import { pmaxCoeffPct, vmpAt, vocAt, type DesignTemps } from './temps';

/** Series-string colours, cycled per string (shared by the planner and the UI). */
export const STRING_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#14b8a6',
];

export interface StringSizing {
  minPanels: number;
  maxPanels: number;
  /** the temperatures this window was derived from (provenance travels) */
  temps: DesignTemps;
  /** true when the Pmax coefficient was assumed rather than read from a datasheet */
  pmaxEstimated: boolean;
  /**
   * Set when the window is EMPTY (minPanels > maxPanels): no series length
   * satisfies both the cold-Voc ceiling and the hot-Vmp floor for this pair.
   * The old engine could not express this — it returned a window whose min
   * exceeded its max and every caller silently used it anyway.
   */
  impossible?: string;
}

/**
 * Allowed series length for a panel/inverter pair across the SITE's design
 * temperatures. Callers pass `temps` (resolveDesignTemps(project)); the
 * default keeps the legacy hardcoded pair working for tests that predate
 * site temps, but production callers must resolve real ones.
 */
export function stringSizing(
  panel: PanelSpec,
  inverter: InverterSpec,
  temps: DesignTemps,
): StringSizing {
  // cold Voc at AMBIENT (dawn, module not yet warmed) — the over-voltage case
  const vocCold = vocAt(panel, temps.minCellC);
  // hot Vmp at CELL temperature, using the Pmax coefficient (NOT Voc's)
  const vmpHot = vmpAt(panel, temps.maxCellC);
  const maxByDc = Math.floor(inverter.maxDcV / vocCold);
  const maxByMppt = Math.floor(inverter.mppt.maxV / vocCold);
  const minByMppt = Math.ceil(inverter.mppt.minV / Math.max(1, vmpHot));
  const minPanels = Math.max(1, minByMppt);
  const maxPanels = Math.max(1, Math.min(maxByDc, maxByMppt));
  const { estimated } = pmaxCoeffPct(panel);
  return {
    minPanels,
    maxPanels,
    temps,
    pmaxEstimated: estimated,
    ...(minPanels > maxPanels
      ? {
          impossible:
            `No series length fits this pair at ${temps.minAmbientC}–${temps.maxCellC} °C: ` +
            `${minPanels} modules needed to hold the ${inverter.mppt.minV} V MPPT floor when hot, ` +
            `but only ${maxPanels} fit under ${Math.min(inverter.maxDcV, inverter.mppt.maxV)} V when cold`,
        }
      : {}),
  };
}

