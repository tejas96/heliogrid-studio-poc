// ─── Solar math: sun position (NOAA-style), sunrise/sunset, loss model ──────
//
// LOW-LEVEL ONLY. spacing.ts, sim-time.ts, poa.ts and string-shade.ts all sit
// on top of this file, so it must not import anything that in turn needs them.
// The whole-project energy report used to live here; it now lives in
// lib/energy/report.ts, which is the top of the stack rather than the bottom.
import type { LatLng, LossItem, SiteLocation, SiteWeather } from '../types';

// Astronomical core lives in lib/sun.ts (kept acyclic for physics modules);
// re-exported here so every existing `from './solar'` import keeps working.
// Modules UNDER this one import from './sun' directly — going through this
// re-export would put the loss model underneath them.
export { sunPosition, solarHourDate, sunriseSunset } from './sun';

export function fmtHour(h: number): string {
  // round to the minute FIRST: rounding the fraction alone gave "7:60 AM" at 7.995
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

/** Mock irradiance model for India by latitude (kWh/m²/day annual mean). */
export function mockIrradiance(lat: number): number {
  // 4.8–5.8 band across India, peaking around 23–27°N (Rajasthan/Gujarat)
  const base = 5.6 - Math.abs(lat - 24) * 0.045;
  return Math.round(Math.max(4.6, Math.min(5.9, base)) * 100) / 100;
}

export const MONSOON_MONTHS = [5, 6, 7, 8]; // Jun..Sep (0-indexed)

/**
 * Equipment loss items (percent each). Losses COMPOSE MULTIPLICATIVELY —
 * PVWatts/PVsyst convention: PR = Π(1−lᵢ) — never by addition (the old
 * additive sum could push PR negative under heavy shading). The inverter
 * line is derived from the selected inverter's datasheet efficiency; 3.0%
 * is the fallback before one is chosen.
 * Shading is NOT in this list: it applies to the BEAM component only,
 * inside the plane-of-array composition (see energy/report.ts) — a fully
 * beam-shaded panel still collects diffuse light.
 */
export function equipmentLosses(inverterEfficiencyPct?: number): LossItem[] {
  const invLoss =
    inverterEfficiencyPct && inverterEfficiencyPct > 50 && inverterEfficiencyPct < 100
      ? Math.round((100 - inverterEfficiencyPct) * 10) / 10
      : 3.0;
  return [
    { key: 'temperature', label: 'Temperature', pct: 8.1 },
    { key: 'soiling', label: 'Soiling', pct: 3.0 },
    { key: 'inverter', label: 'Inverter', pct: invLoss },
    { key: 'mismatch', label: 'Mismatch', pct: 2.0 },
    { key: 'dc_wiring', label: 'DC Wiring', pct: 2.0 },
  ];
}

/** Multiplicative composition, clamped to (0,1]: PR = Π(1−lᵢ). */
export function composeLosses(losses: LossItem[]): number {
  const pr = losses.reduce((acc, l) => acc * (1 - Math.min(100, Math.max(0, l.pct)) / 100), 1);
  return Math.min(1, Math.max(0.005, pr));
}

/** True when two lat/lng points agree within `tolDeg` on both axes. */
export function latLngNear(a: LatLng, b: LatLng, tolDeg: number): boolean {
  return Math.abs(a.lat - b.lat) <= tolDeg && Math.abs(a.lng - b.lng) <= tolDeg;
}

/**
 * The site's measured weather, but ONLY if it was fetched for the current pin.
 * A rehydrated project whose pin moved (or any path that changed latLng without
 * refetching) falls back to the estimate rather than lying with old-pin numbers.
 */
export function activeWeather(location: SiteLocation | null): SiteWeather | undefined {
  const w = location?.weather;
  if (!w || !location) return undefined;
  // ~11 m — a rehydrated project whose pin drifted this far keeps its weather;
  // a real relocation is far larger and correctly invalidates it
  return latLngNear(w.forLatLng, location.latLng, 1e-4) ? w : undefined;
}

/** Suggested kWp from a monthly bill (improvement: consumption-based sizing). */
export function suggestKwpFromBill(
  monthlyBillInr: number,
  tariff: number,
  psh: number,
): number {
  const monthlyKwh = monthlyBillInr / Math.max(1, tariff);
  const kwp = monthlyKwh / (psh * 30 * 0.8);
  return Math.round(kwp * 10) / 10;
}

