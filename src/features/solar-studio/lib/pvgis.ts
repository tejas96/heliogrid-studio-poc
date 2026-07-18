// ─── PVGIS MRcalc → SiteWeather (pure mapper, shared by route + tests) ──────
// PVGIS `MRcalc?horirrad=1&d2g=1` returns `outputs.monthly` as a FLAT list of
// one row PER (year, month) across the database's year span (ERA5: 2005–2020 =
// 192 rows), each `{ year, month, "H(h)_m", Kd }` where:
//   • `H(h)_m` = monthly SUM of horizontal global irradiation, kWh/m²/month
//   • `Kd`     = diffuse/global ratio for that month, 0..1
// We average each calendar month across all years to get a climatological
// normal, then express GHI as kWh/m²/day using a FIXED calendar (the ÷days here
// and ×days in the energy model cancel exactly, so leap years never drift).
// Verified against a live Pune (18.52,73.86) response; see
// __tests__/fixtures/pvgis-mrcalc-pune.json.
import type { LatLng, SiteWeather } from '../types';

/** Days per month — fixed calendar (see note above; leap years ignored). */
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Radiation-database request ladder (PVGIS v5.3, verified live 2026-07-16):
 * satellite SARAH3 is preferred where covered (Meteosat 0° disc ≈ Europe/
 * Africa/Middle East, lon ≲ ±65°), else the global ERA5 reanalysis. India is
 * OUTSIDE SARAH3's grid — PVGIS answers 400 "out of the spatial coverage…
 * select PVGIS-ERA5", so the primary market deterministically lands on ERA5;
 * pinning buys determinism + honest provenance, not different data.
 */
export const PVGIS_DB_LADDER = ['PVGIS-SARAH3', 'PVGIS-ERA5'] as const;

interface PvgisMonthlyRow {
  year?: number;
  month?: number;
  'H(h)_m'?: number;
  Kd?: number;
}

export interface PvgisResponse {
  outputs?: { monthly?: PvgisMonthlyRow[] };
  inputs?: { meteo_data?: { radiation_db?: string } };
}

const isFiniteNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * Shape-check a SiteWeather before it can drive energy numbers — the single
 * source of truth shared by the fetch client (weatherApi) and the persistence
 * validator (store.normalizeWeather). Rejects short/non-finite/NEGATIVE GHI and
 * out-of-range diffuse fractions so corrupt data falls back to the estimate.
 */
export function isValidSiteWeather(w: unknown): w is SiteWeather {
  if (!w || typeof w !== 'object') return false;
  const o = w as Record<string, unknown>;
  const arr12 = (v: unknown, min: number, max: number): v is number[] =>
    Array.isArray(v) &&
    v.length === 12 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max);
  if (!arr12(o.monthlyGhi, 0, Infinity)) return false; // GHI must be non-negative
  if (!arr12(o.monthlyDiffuseFrac, 0.05, 0.95)) return false;
  if (typeof o.annualGhi !== 'number' || !Number.isFinite(o.annualGhi) || o.annualGhi <= 0) return false;
  const ll = o.forLatLng as { lat?: unknown; lng?: unknown } | undefined;
  if (!ll || typeof ll.lat !== 'number' || typeof ll.lng !== 'number') return false;
  return o.source === 'pvgis';
}

/**
 * Convert a raw PVGIS MRcalc JSON payload into SiteWeather, or return null if
 * the payload is missing/short/out-of-range (caller treats null as
 * 'unavailable' and falls back to the estimate — never a partial repair).
 */
export function pvgisToWeather(
  json: PvgisResponse,
  lat: number,
  lng: number,
): SiteWeather | null {
  const rows = json?.outputs?.monthly;
  if (!Array.isArray(rows) || rows.length < 12) return null;

  // group H(h)_m and Kd by calendar month (1..12)
  const ghiByMonth: number[][] = Array.from({ length: 12 }, () => []);
  const kdByMonth: number[][] = Array.from({ length: 12 }, () => []);
  for (const r of rows) {
    const m = r?.month;
    const h = r?.['H(h)_m'];
    const kd = r?.Kd;
    if (typeof m !== 'number' || m < 1 || m > 12) return null;
    if (!isFiniteNum(h) || h < 0) return null;
    if (!isFiniteNum(kd)) return null;
    ghiByMonth[m - 1].push(h);
    kdByMonth[m - 1].push(kd);
  }

  const monthlyGhi: number[] = [];
  const monthlyDiffuseFrac: number[] = [];
  let annualSum = 0;
  for (let m = 0; m < 12; m++) {
    const ghis = ghiByMonth[m];
    const kds = kdByMonth[m];
    if (ghis.length === 0 || kds.length === 0) return null; // a month had no data
    const meanGhiSum = ghis.reduce((s, v) => s + v, 0) / ghis.length; // kWh/m²/mo
    const meanKd = kds.reduce((s, v) => s + v, 0) / kds.length;
    // physically-plausible diffuse fraction; a bad month invalidates the whole
    if (meanKd < 0.1 || meanKd > 0.9) return null;
    annualSum += meanGhiSum;
    monthlyGhi.push(round(meanGhiSum / DAYS_IN_MONTH[m], 4)); // kWh/m²/day
    monthlyDiffuseFrac.push(round(meanKd, 4));
  }

  const annualGhi = round(annualSum / 365, 4);
  if (!isFiniteNum(annualGhi) || annualGhi <= 0) return null;

  // record length (distinct years) — provenance for the report; a longer
  // climatological base means a more stable monthly normal
  const years = new Set<number>();
  for (const r of rows) if (typeof r.year === 'number') years.add(r.year);

  return {
    monthlyGhi,
    monthlyDiffuseFrac,
    annualGhi,
    forLatLng: { lat, lng } as LatLng,
    source: 'pvgis',
    fetchedAt: 0, // stamped by the caller (keeps this mapper pure/testable)
    raddatabase: json?.inputs?.meteo_data?.radiation_db,
    yearsOfRecord: years.size > 0 ? years.size : undefined,
  };
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
