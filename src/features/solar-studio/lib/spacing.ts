// ─── Inter-row shading: shadow-free row pitch + GCR (Phase 3 physics) ────────
// The differentiator over "fixed 20 mm gap" tools: for a TILTED array on a flat
// roof, rows self-shade in winter. We size the row pitch so the array stays
// shadow-free across the winter-solstice mid-day window, using the SAME sun
// engine as the rest of the app (timezone-independent via longitude).
// straight from the sun math, NOT via solar.ts — solar.ts only re-exports these
// and importing it from here would drag the whole energy engine into a cycle
import { solarHourDate, sunPosition } from './sun';

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

/**
 * How far IN from a roof edge the first module must start so a wall standing on
 * that edge — a parapet, almost always — never shades it during the same
 * winter shadow-free window the row pitch is solved for.
 *
 * The tool has always refused to let row 1 shade row 2, then placed row 1
 * against a 1 m parapet. Same sun, same window, same formula: a wall is just an
 * upstream row that throws a shadow and collects nothing.
 *
 * `shadeHeightM` is the wall top above the MODULE's lowest point, not above the
 * deck — a table on 0.3 m legs only sees 0.7 m of a 1 m wall.
 *
 * `inwardAzimuthDeg` is the compass direction the roof's interior lies in, seen
 * from that edge. The shadow reaches inward only while the sun stands on the
 * far side of the wall, so the reach is measured along the OUTWARD normal and
 * an edge whose sun never crosses it (the north parapet in India) returns 0.
 */
export function wallShadowSetbackM(
  lat: number,
  lng: number,
  shadeHeightM: number,
  inwardAzimuthDeg: number,
  windowStartHr = 9,
  windowEndHr = 15,
): number {
  if (shadeHeightM <= 1e-6) return 0;
  const year = new Date().getFullYear();
  const month = lat >= 0 ? 11 : 5;
  const outward = ((inwardAzimuthDeg + 180) * Math.PI) / 180;
  let maxD = 0;
  for (let hr = windowStartHr; hr <= windowEndHr + 1e-9; hr += 0.5) {
    const s = sunPosition(solarHourDate(year, month, 21, hr, lng), lat, lng);
    if (s.altitude <= 0.05) continue;
    const d = (shadeHeightM / Math.tan(s.altitude)) * Math.cos(s.azimuth - outward);
    if (d > maxD) maxD = d;
  }
  return maxD;
}
