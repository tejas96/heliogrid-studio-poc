// ─── Simulation time: ONE basis for visual sun, sun path, captures, engine ──
// Every simulated instant in the studio is a LOCAL MEAN-SOLAR hour at the
// SITE's longitude, converted to a UTC Date via solarHourDate. The engine
// (lib/shading), the heatmap and the sunrise/sunset labels always worked this
// way; the 3D scene and sun-path arc used the BROWSER's wall clock
// (`Date.setHours`) — shadows were ~34 min off even in-timezone (IST is
// UTC+5:30 but Pune's solar noon isn't 12:00 IST) and arbitrarily wrong when
// viewing a project from another timezone. This module is the single
// conversion point so the visual sun can never disagree with the engine again.
import { solarHourDate } from './solar';

/**
 * UTC instant for solar `hour` (0–24, 12 = solar noon) on the calendar day of
 * `date` at site longitude `lng`. Feed the result to sunPosition().
 */
export function simTimeDate(date: Date, hour: number, lng: number): Date {
  return solarHourDate(date.getFullYear(), date.getMonth(), date.getDate(), hour, lng);
}
