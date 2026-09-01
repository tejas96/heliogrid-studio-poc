// ─── Design bounds in three.js coordinates (x east, y up, z = −north) ───────
// One answer to "where is the design and how big is it", used to fit the
// camera on open, to frame a selection, and to size the shadow frustum so a
// 300 m site stops losing its shadows past the old fixed ±60 m box.
import type { Project, Roof } from '../types';

export interface SceneBounds {
  /** centre of the design (three coordinates) */
  cx: number;
  cy: number;
  cz: number;
  /** half of the larger horizontal extent, plus a margin */
  r: number;
  /** lowest and highest y in the design */
  yMin: number;
  yMax: number;
}

const FALLBACK: SceneBounds = { cx: 0, cy: 3, cz: 0, r: 30, yMin: 0, yMax: 6 };

/** Bounds over the given roofs (default: every roof) and the modules on them. */
export function designBounds(project: Project, roofs: Roof[] = project.roofs): SceneBounds {
  if (roofs.length === 0) return FALLBACK;
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let hMax = 0;
  for (const r of roofs) {
    for (const p of r.polygon) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
    // a pitched face rises above its eave; the ridge is what the camera must see
    const rise = r.pitchDeg > 0 ? Math.tan((r.pitchDeg * Math.PI) / 180) * 12 : 0;
    hMax = Math.max(hMax, r.heightM + rise + 2.5);
  }
  const ids = new Set(roofs.map((r) => r.id));
  for (const p of project.panels) {
    if (!ids.has(p.roofId)) continue;
    if (p.center.x < xMin) xMin = p.center.x;
    if (p.center.x > xMax) xMax = p.center.x;
    if (p.center.y < yMin) yMin = p.center.y;
    if (p.center.y > yMax) yMax = p.center.y;
  }
  if (!Number.isFinite(xMin)) return FALLBACK;
  const cx = (xMin + xMax) / 2;
  const cz = -(yMin + yMax) / 2;
  const r = Math.max(8, Math.max(xMax - xMin, yMax - yMin) / 2 + 4);
  return { cx, cy: hMax / 2, cz, r, yMin: 0, yMax: hMax };
}
