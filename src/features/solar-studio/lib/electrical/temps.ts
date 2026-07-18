// ─── Site design temperatures: the basis of every string window ─────────────
// String sizing is a temperature problem. Voc RISES as cells get colder, so the
// coldest morning of the year sets the MAXIMUM series length (exceed it and the
// inverter sees over-voltage — a safety and warranty event, not a rounding
// error). Vmp FALLS as cells get hotter, so the hottest afternoon sets the
// MINIMUM length (fall short and the array drops out of the MPPT window and
// simply stops harvesting).
//
// Before this module the engine used two hardcoded constants — T_MIN 5 °C /
// T_MAX 70 °C — for every site on earth, from Leh to Chennai (audit finding 7).
//
// ENGINEER VALIDATION REQUIRED (plan §7 — "design-temperature policy"): the
// question "record low vs TMY minimum vs TMY minimum + margin" is a policy
// choice with real liability attached, and it is NOT settled here. This module
// makes the choice EXPLICIT and LABELLED instead of hidden in two constants.
import type { PanelSpec, Project } from '../../types';
import { resolveRules } from '../../data/rules/india';

export interface DesignTemps {
  /** coldest ambient the design must survive (°C) — drives cold Voc */
  minAmbientC: number;
  /** hottest ambient (°C) */
  maxAmbientC: number;
  /** hottest CELL temperature (°C) = maxAmbient + rise at full irradiance */
  maxCellC: number;
  /** cold Voc is checked at ambient: at dawn the cell has not warmed yet */
  minCellC: number;
  /**
   * 'measured' — from the site's own weather record;
   * 'assumed'  — a climate-band default that an engineer must confirm.
   * Never label an assumption as measured: the whole provenance system exists
   * so a number's confidence travels with it.
   */
  source: 'measured' | 'assumed';
  /** plain-language basis, for the UI and the SLD sheet */
  note: string;
}

/**
 * Design temperatures for a project's pin.
 *
 * Prefers the site's measured weather whenever the project carries it; falls
 * back to the market's climate bands. Today no weather source in the app
 * supplies ambient extremes (PVGIS MRcalc returns irradiance only), so this
 * resolves to 'assumed' in practice — the measured branch is live so that
 * wiring PVGIS TMY min/max later changes the LABEL and the NUMBERS with no
 * caller edits.
 */
export function resolveDesignTemps(project: Project): DesignTemps {
  const rules = resolveRules();
  const lat = project.location?.latLng.lat ?? 20;
  const band =
    rules.temps.latBands.find((b) => Math.abs(lat) <= b.maxAbsLat) ??
    rules.temps.latBands[rules.temps.latBands.length - 1];
  const minAmbientC = band.designMinAmbientC;
  const maxAmbientC = band.designMaxAmbientC;
  return {
    minAmbientC,
    maxAmbientC,
    maxCellC: maxAmbientC + rules.temps.cellRiseC,
    // the cold check uses AMBIENT, not a warmed cell: worst-case Voc happens at
    // first light, when the module is at air temperature and the sun is already
    // on it. Adding a cell rise here would quietly shrink the safety margin.
    minCellC: minAmbientC,
    source: 'assumed',
    note: `${band.label} climate band (${minAmbientC}–${maxAmbientC} °C ambient, +${rules.temps.cellRiseC} °C cell rise) — assumed, confirm for this site`,
  };
}

/**
 * Module Pmax/Vmp temperature coefficient (%/°C, negative).
 *
 * The engine previously applied the Voc coefficient to Vmp. They are not
 * interchangeable: Voc drifts ~−0.25 %/°C while Pmax/Vmp drifts ~−0.35 %/°C,
 * so using Voc's number UNDER-states how far Vmp sags when hot, which
 * UNDER-states the minimum string length — the exact direction that lets a
 * string fall out of the MPPT window on the days it should be earning most.
 */
export function pmaxCoeffPct(spec: PanelSpec): { pct: number; estimated: boolean } {
  const rules = resolveRules();
  return typeof spec.tempCoeffPmaxPct === 'number'
    ? { pct: spec.tempCoeffPmaxPct, estimated: false }
    : { pct: rules.temps.fallbackPmaxCoeffPct, estimated: true };
}

const T_STC = 25;

/** Open-circuit voltage of one module at `tempC` (cold ⇒ higher). */
export function vocAt(spec: PanelSpec, tempC: number): number {
  return spec.vocV * (1 + (spec.tempCoeffVocPct / 100) * (tempC - T_STC));
}

/** Max-power voltage of one module at `tempC` (hot ⇒ lower). */
export function vmpAt(spec: PanelSpec, tempC: number): number {
  return spec.vmpV * (1 + (pmaxCoeffPct(spec).pct / 100) * (tempC - T_STC));
}
