// ─── Plane-of-array factor: makes tilt & azimuth real energy inputs ─────────
// Beam-weighted numeric integration over the SAME sun-position engine used
// everywhere else (lib/solar.ts). The factor is the annual beam energy a
// tilted/rotated panel intercepts relative to a horizontal panel at the same
// site. Diffuse light is treated as orientation-neutral, so this is a
// deliberately conservative first-order transposition model — it is labeled
// as such wherever it surfaces (audit R4/R5: no false precision).
import { solarHourDate, sunPosition } from './solar';

const SAMPLE_MONTHS = [0, 2, 5, 8, 11];
/** local MEAN-SOLAR hours (not machine-clock) — see solarHourDate use below */
const SAMPLE_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
/** fraction of annual irradiation assumed orientation-neutral (diffuse) */
export const DIFFUSE_SHARE = 0.35;

const beamCache = new Map<string, number>();
const factorCache = new Map<string, number>();

/**
 * RAW beam-only transposition ratio: annual beam energy a tilted/rotated panel
 * intercepts relative to a horizontal one, with NO diffuse blending. This is
 * the orientation gain applied only to the beam (direct) component, so callers
 * that know the real diffuse fraction (PVGIS `Kd`) can combine it themselves —
 * `poa = Kd + (1−Kd)·beamRatio` — instead of assuming the fixed DIFFUSE_SHARE.
 * azimuthDeg convention: 0 = North, 90 = East, 180 = South (project-wide).
 */
export function poaBeamRatio(
  lat: number,
  lng: number,
  tiltDeg: number,
  azimuthDeg: number,
): number {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${Math.round(tiltDeg)},${Math.round(azimuthDeg / 5) * 5}`;
  const hit = beamCache.get(key);
  if (hit !== undefined) return hit;

  const tilt = (tiltDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  // panel normal in the scene frame (x=east, y=up, z=north via −z)
  const nx = Math.sin(tilt) * Math.sin(az);
  const ny = Math.cos(tilt);
  const nz = -Math.sin(tilt) * Math.cos(az);

  let poaBeam = 0;
  let flatBeam = 0;
  const year = new Date().getFullYear();
  for (const m of SAMPLE_MONTHS) {
    for (const h of SAMPLE_HOURS) {
      // sample by the site's LOCAL SOLAR time (via longitude) so tilt/azimuth
      // gain is identical in any viewer/CI timezone — a machine-local Date would
      // shift these hours below the horizon out-of-TZ and collapse the ratio to 1
      const s = sunPosition(solarHourDate(year, m, 21, h, lng), lat, lng);
      if (s.altitude <= 0.03) continue;
      const sx = Math.cos(s.altitude) * Math.sin(s.azimuth);
      const sy = Math.sin(s.altitude);
      const sz = -Math.cos(s.altitude) * Math.cos(s.azimuth);
      poaBeam += Math.max(0, nx * sx + ny * sy + nz * sz);
      flatBeam += Math.max(0, sy);
    }
  }
  const beamRatio = flatBeam > 0 ? poaBeam / flatBeam : 1;
  const rounded = Math.round(beamRatio * 1000) / 1000;
  beamCache.set(key, rounded);
  return rounded;
}

/**
 * Annual POA factor with the fixed-0.35 diffuse assumption — the fallback used
 * when no measured diffuse fraction is available. Returns ~1.0 for flat, >1 for
 * equator-facing tilt, <1 for poleward tilt. When PVGIS weather is present,
 * prefer `poaBeamRatio` + the real monthly `Kd` instead (single diffuse source).
 */
export function poaFactor(
  lat: number,
  lng: number,
  tiltDeg: number,
  azimuthDeg: number,
): number {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${Math.round(tiltDeg)},${Math.round(azimuthDeg / 5) * 5}`;
  const hit = factorCache.get(key);
  if (hit !== undefined) return hit;
  const factor = DIFFUSE_SHARE + (1 - DIFFUSE_SHARE) * poaBeamRatio(lat, lng, tiltDeg, azimuthDeg);
  const rounded = Math.round(factor * 1000) / 1000;
  factorCache.set(key, rounded);
  return rounded;
}
