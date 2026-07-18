// ─── Inter-row shading: shadow-free row pitch + GCR (Phase 3 physics) ────────
// The differentiator over "fixed 20 mm gap" tools: for a TILTED array on a flat
// roof, rows self-shade in winter. We size the row pitch so the array stays
// shadow-free across the winter-solstice mid-day window, using the SAME sun
// engine as the rest of the app (timezone-independent via longitude).
import { solarHourDate, sunPosition } from './solar';

/** Ground Coverage Ratio (pvlib): collector slant length ÷ row pitch. */
export function gcr(collectorLenM: number, pitchM: number): number {
  return pitchM > 0 ? collectorLenM / pitchM : 1;
}

/**
 * Minimum row PITCH (centre-to-centre, metres) so a tilted array never
 * self-shades during the winter-solstice shadow-free window (default 09:00–15:00
 * local solar time). Flat (tilt≈0) returns the collector length (GCR≈1).
 *
 * pitch = collectorLen·cos(tilt) + max over the window of the back-edge shadow
 * projected onto the inter-row axis:  d = (h/tanα)·cos(ψ),  h = collectorLen·sin(tilt).
 */
export function shadowFreePitchM(
  lat: number,
  lng: number,
  tiltDeg: number,
  collectorLenM: number,
  arrayAzimuthDeg: number,
  windowStartHr = 9,
  windowEndHr = 15,
): number {
  const tilt = (tiltDeg * Math.PI) / 180;
  const h = collectorLenM * Math.sin(tilt);
  const base = collectorLenM * Math.cos(tilt);
  if (h <= 1e-6) return collectorLenM; // flush → no self-shading

  // northern hemisphere: worst mid-winter day is Dec 21; southern: Jun 21
  const year = new Date().getFullYear();
  const month = lat >= 0 ? 11 : 5;
  const arrayAz = (arrayAzimuthDeg * Math.PI) / 180;

  let maxD = 0;
  for (let hr = windowStartHr; hr <= windowEndHr + 1e-9; hr += 0.5) {
    const s = sunPosition(solarHourDate(year, month, 21, hr, lng), lat, lng);
    if (s.altitude <= 0.05) continue; // sun on/below horizon → ignore
    // shadow falls away from the sun; its component along the inter-row axis:
    const d = (h / Math.tan(s.altitude)) * Math.cos(s.azimuth - arrayAz);
    if (d > maxD) maxD = d;
  }
  return base + maxD;
}
