// ─── Sun paths and the site's horizon, in numbers ───────────────────────────
// The sun chart PVsyst users know: azimuth across, altitude up, one curve per
// season, hour marks along each curve — and the site's own horizon drawn
// under them: every neighbour, tree and roof obstruction as the elevation
// angle it subtends from the array. Where a sun curve dips below that line
// the array is in shade. All pure maths; the panel only draws it.
import type { Project, XY } from '../types';
import { sunPosition } from './sun';
import { simTimeDate } from './sim-time';
import { peekSurroundHeights, type SurroundHeights } from './surround';
import { pointInPolygon } from './geo';

/** India runs on one clock; solar time at the site differs by the longitude. */
export const CLOCK_OFFSET_H = 5.5;

/** Mean solar hour at `lng` → wall-clock hour (IST). */
export function clockHour(solarHour: number, lng: number): number {
  return solarHour - lng / 15 + CLOCK_OFFSET_H;
}

export interface SunSample {
  /** solar hour, e.g. 13.5 */
  hour: number;
  /** compass azimuth, degrees clockwise from north, 0..360 */
  azDeg: number;
  /** altitude, degrees above the horizon */
  altDeg: number;
}

/** The sun's path over one day, from the first to the last sample above the horizon. */
export function sunCurve(lat: number, lng: number, date: Date, stepH = 0.25): SunSample[] {
  const out: SunSample[] = [];
  for (let h = 3; h <= 21; h += stepH) {
    const s = sunPosition(simTimeDate(date, h, lng), lat, lng);
    if (s.altitude <= 0) continue;
    const az = ((s.azimuth * 180) / Math.PI + 360) % 360;
    out.push({ hour: Math.round(h * 100) / 100, azDeg: az, altDeg: (s.altitude * 180) / Math.PI });
  }
  return out;
}

/** The three days that bound the year: summer and winter solstice, equinox. */
export function seasonDates(year: number): { label: string; date: Date }[] {
  return [
    { label: '21 Jun', date: new Date(year, 5, 21, 12) },
    { label: '21 Mar / 23 Sep', date: new Date(year, 2, 21, 12) },
    { label: '21 Dec', date: new Date(year, 11, 21, 12) },
  ];
}

/** azimuth → the horizon's elevation angle (degrees), `stepDeg` apart, from north clockwise */
export interface HorizonProfile {
  stepDeg: number;
  /** length = 360 / stepDeg */
  elevDeg: number[];
  /** what was in the picture */
  sources: { surround: boolean; obstructions: number; otherRoofs: number };
}

function heightAt(g: SurroundHeights, p: XY): number | null {
  // grid cell (c, r) from the EN origin and the step vectors (an orthogonal grid)
  const dx = p.x - g.originEN.x;
  const dy = p.y - g.originEN.y;
  const cl = g.stepCol.x * g.stepCol.x + g.stepCol.y * g.stepCol.y;
  const rl = g.stepRow.x * g.stepRow.x + g.stepRow.y * g.stepRow.y;
  if (!cl || !rl) return null;
  const c = Math.round((dx * g.stepCol.x + dy * g.stepCol.y) / cl);
  const r = Math.round((dx * g.stepRow.x + dy * g.stepRow.y) / rl);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return null;
  const h = g.heights[r * g.cols + c];
  return Number.isFinite(h) ? h : null;
}

/**
 * The horizon as the array sees it: from the array's centre, a little above
 * the module plane, in every compass direction. Plan geometry is in the image
 * frame; compass azimuths are turned by the calibration's north offset.
 */
export function horizonProfile(project: Project, stepDeg = 3): HorizonProfile {
  const n = Math.round(360 / stepDeg);
  const elev = new Array<number>(n).fill(0);
  const panels = project.panels.filter((p) => p.enabled);
  const roofOf = (id: string) => project.roofs.find((r) => r.id === id);
  // eye: the array centre, or the first roof's centroid when nothing is placed yet
  let eye: XY;
  let eyeH: number;
  let eyeRoofId: string | null;
  if (panels.length) {
    eye = {
      x: panels.reduce((a, p) => a + p.center.x, 0) / panels.length,
      y: panels.reduce((a, p) => a + p.center.y, 0) / panels.length,
    };
    const roof = roofOf(panels[0].roofId);
    eyeRoofId = roof?.id ?? null;
    eyeH = (roof?.heightM ?? 0) + 1.2;
  } else {
    const roof = project.roofs[0];
    if (!roof) return { stepDeg, elevDeg: elev, sources: { surround: false, obstructions: 0, otherRoofs: 0 } };
    eye = {
      x: roof.polygon.reduce((a, p) => a + p.x, 0) / roof.polygon.length,
      y: roof.polygon.reduce((a, p) => a + p.y, 0) / roof.polygon.length,
    };
    eyeRoofId = roof.id;
    eyeH = roof.heightM + 1.2;
  }
  const offset = ((project.calibration?.northOffsetDeg ?? 0) * Math.PI) / 180;
  const grid = peekSurroundHeights(project.surround);
  const grade = 0; // grid heights are metres above the site's grade, the model's ground
  const radius = project.surround?.radiusM ?? 100;
  const others = project.roofs.filter((r) => r.id !== eyeRoofId);
  const obstructions = project.obstructions.filter((o) => o.roofId === eyeRoofId || !o.roofId);

  for (let i = 0; i < n; i++) {
    const azDeg = i * stepDeg;
    const az = (azDeg * Math.PI) / 180 + offset; // compass → image frame
    const dir = { x: Math.sin(az), y: Math.cos(az) };
    let best = 0;
    // the real surround: march out along the ray, keep the steepest sight line
    if (grid) {
      for (let d = 3; d <= radius; d += 0.5) {
        const p = { x: eye.x + dir.x * d, y: eye.y + dir.y * d };
        // inside the array's own roof the DSM is cut out; nothing there blocks
        const own = eyeRoofId ? roofOf(eyeRoofId) : null;
        if (own && pointInPolygon(p, own.polygon)) continue;
        const h = heightAt(grid, p);
        if (h === null) continue;
        const ang = (Math.atan2(h + grade - eyeH, d) * 180) / Math.PI;
        if (ang > best) best = ang;
      }
    }
    // the project's other roofs, as solid blocks
    for (const r of others) {
      for (let d = 3; d <= 150; d += 0.5) {
        const p = { x: eye.x + dir.x * d, y: eye.y + dir.y * d };
        if (!pointInPolygon(p, r.polygon)) continue;
        const ang = (Math.atan2(r.heightM - eyeH, d) * 180) / Math.PI;
        if (ang > best) best = ang;
        break;
      }
    }
    // obstructions on the array's roof: a box seen from the eye
    for (const o of obstructions) {
      const roof = o.roofId ? roofOf(o.roofId) : undefined;
      const base = roof?.heightM ?? 0;
      const half = o.shape === 'circle' ? o.diameterM / 2 : Math.max(o.lengthM, o.widthM) / 2;
      const dx = o.center.x - eye.x;
      const dy = o.center.y - eye.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) continue;
      const toward = Math.atan2(dx, dy); // image-frame bearing of the obstruction
      const bearing = az;
      let dAng = Math.abs(((toward - bearing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const halfSpan = Math.atan2(half, dist);
      if (dAng > halfSpan) continue;
      const near = Math.max(0.5, dist - half);
      const ang = (Math.atan2(base + o.heightM - eyeH, near) * 180) / Math.PI;
      if (ang > best) best = ang;
    }
    elev[i] = Math.max(0, Math.min(89, best));
  }
  return {
    stepDeg,
    elevDeg: elev,
    sources: { surround: !!grid, obstructions: obstructions.length, otherRoofs: others.length },
  };
}

export function horizonAt(profile: HorizonProfile, azDeg: number): number {
  const i = Math.round((((azDeg % 360) + 360) % 360) / profile.stepDeg) % profile.elevDeg.length;
  return profile.elevDeg[i];
}

/** The solar hours of a day where the sun is above the horizon but behind the site's skyline. */
export function shadeWindows(curve: SunSample[], profile: HorizonProfile): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let open: number | null = null;
  for (const s of curve) {
    const shaded = s.altDeg < horizonAt(profile, s.azDeg);
    if (shaded && open === null) open = s.hour;
    if (!shaded && open !== null) {
      out.push({ from: open, to: s.hour });
      open = null;
    }
  }
  if (open !== null && curve.length) out.push({ from: open, to: curve[curve.length - 1].hour });
  return out;
}
