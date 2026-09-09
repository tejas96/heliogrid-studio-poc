// ─── A clear-sky typical year, from the engine's own sun ────────────────────
// Shared by the hourly-engine gates that need a TmyYear without the blob store.
import { airMass } from '../../energy/hourly';
import { HOURS_PER_YEAR, type TmyYear } from '../../energy/tmy';
import { sunPosition } from '../../sun';

const years = new Map<string, TmyYear>();

export function clearYear(lat: number, lng: number): TmyYear {
  const key = `${lat},${lng}`;
  const hit = years.get(key);
  if (hit) return hit;
  const n = HOURS_PER_YEAR;
  const ghi = new Float32Array(n);
  const dni = new Float32Array(n);
  const dhi = new Float32Array(n);
  const start = Date.UTC(2019, 0, 1);
  for (let h = 0; h < n; h++) {
    const s = sunPosition(new Date(start + (h + 0.5) * 3_600_000), lat, lng);
    if (s.altitude <= 0) continue;
    const sinA = Math.sin(s.altitude);
    dni[h] = 950 * Math.exp(-0.09 * airMass(Math.PI / 2 - s.altitude));
    dhi[h] = 90 * Math.sqrt(sinA);
    ghi[h] = dni[h] * sinA + dhi[h];
  }
  const year: TmyYear = {
    ghi,
    dni,
    dhi,
    tair: new Float32Array(n).fill(28),
    wind: new Float32Array(n).fill(2),
    timeOffsetH: 0.5,
  };
  years.set(key, year);
  return year;
}
