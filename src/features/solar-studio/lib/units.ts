// ─── Display units: all stored values are METERS; only formatting converts ──
import type { UnitSystem } from '../types';
import { useStore } from '../store/store';

export const M_TO_FT = 3.28084;
export const M2_TO_FT2 = 10.7639;

export function lenUnit(units: UnitSystem): string {
  return units === 'imperial' ? 'ft' : 'm';
}

export function areaUnit(units: UnitSystem): string {
  return units === 'imperial' ? 'ft²' : 'm²';
}

/** Format a length stored in meters for display. */
export function fmtLen(m: number, units: UnitSystem, dp = 2): string {
  return units === 'imperial'
    ? `${(m * M_TO_FT).toFixed(dp)} ft`
    : `${m.toFixed(dp)} m`;
}

/** Length number only (no unit suffix), for slider values etc. */
export function lenValue(m: number, units: UnitSystem, dp = 2): string {
  return units === 'imperial'
    ? (m * M_TO_FT).toFixed(dp)
    : `${+m.toFixed(dp)}`;
}

/**
 * Inverse of `lenValue`: a number the user TYPED in display units, back to the
 * meters we store. Every other helper here is one-way because most lengths are
 * read-only on screen; an editable field needs the return trip or an imperial
 * user's "100" is stored as 100 meters.
 *
 * Rounded to 0.1 mm so a metric→imperial→metric round trip does not leave
 * float dust in the project and churn the fingerprint.
 */
export function lenToM(v: number, units: UnitSystem): number {
  return units === 'imperial' ? Math.round((v / M_TO_FT) * 1e4) / 1e4 : v;
}

/** Format an area stored in m² for display (whole numbers). */
export function fmtArea(m2: number, units: UnitSystem): string {
  return units === 'imperial'
    ? `${Math.round(m2 * M2_TO_FT2)} ft²`
    : `${Math.round(m2)} m²`;
}

/**
 * Units preference + bound formatters. Falls back to metric when no user is
 * logged in (share viewer / proposal links render without a session).
 */
export function useUnits() {
  const { state, dispatch } = useStore();
  const units: UnitSystem = state.user?.units ?? 'metric';
  return {
    units,
    setUnits: (u: UnitSystem) => dispatch({ type: 'set-units', units: u }),
    lenUnit: lenUnit(units),
    areaUnit: areaUnit(units),
    fmtLen: (m: number, dp = 2) => fmtLen(m, units, dp),
    lenValue: (m: number, dp = 2) => lenValue(m, units, dp),
    lenToM: (v: number) => lenToM(v, units),
    fmtArea: (m2: number) => fmtArea(m2, units),
  };
}
