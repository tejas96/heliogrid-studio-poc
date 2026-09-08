// ─── Design bounds in three.js coordinates (x east, y up, z = −north) ───────
// One answer to "where is the design and how big is it", used to fit the
// camera on open, to frame a selection, and to size the shadow frustum so a
// 300 m site stops losing its shadows past the old fixed ±60 m box.
import type { Project, Roof } from '../types';
import { castsAnalyticalShadow } from '../lib/capabilities';

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
  // the sphere the camera fits must hold the design's HEIGHT too: a 75 m
  // tower framed by its footprint alone put the camera inside the next one
  const r = Math.max(8, Math.max(xMax - xMin, yMax - yMin) / 2 + 4, hMax / 2 + 4);
  return { cx, cy: hMax / 2, cz, r, yMin: 0, yMax: hMax };
}

/**
 * Bounds the SHADOW camera must cover: the design, plus every obstruction that
 * throws a shadow onto it. Fitted to roofs and panels alone, a neighbouring
 * tower fell outside the frustum and shaded nothing in the render — while the
 * engine went on charging the customer for that shade. The picture and the
 * numbers have to agree; this is what makes them.
 *
 * The CENTRE stays the design's, so the light target does not move: recentring
 * on design-plus-neighbour would spend half the map on empty ground. Only the
 * radius and the height grow, and only as far as a real caster reaches.
 *
 * Deliberately NOT folded into designBounds: that also frames the camera, and
 * a tree 30 m off the roof would zoom the design view out to the neighbourhood.
 */
export function shadowBounds(project: Project, roofs: Roof[] = project.roofs): SceneBounds {
  const b = designBounds(project, roofs);
  const ids = new Set(roofs.map((r) => r.id));
  const deck = new Map(roofs.map((r) => [r.id, r.heightM]));
  const cyProject = -b.cz; // designBounds stores the north axis negated
  let r = b.r;
  let top = b.yMax;
  for (const o of project.obstructions) {
    // a thing on a roof that is not being shown cannot shade what is
    if (o.roofId !== null && !ids.has(o.roofId)) continue;
    // an obstruction the user switched OFF shades nothing in either the engine
    // or the scene, so it has no claim on the map's texels
    if (!castsAnalyticalShadow(o)) continue;
    // any rotation of a rectangle fits inside its own diagonal
    const half = o.shape === 'circle' ? o.diameterM / 2 : Math.hypot(o.lengthM, o.widthM) / 2;
    const reach = Math.hypot(o.center.x - b.cx, o.center.y - cyProject) + half;
    if (reach > r) r = reach;
    const base = o.roofId !== null ? deck.get(o.roofId) ?? 0 : 0;
    if (base + o.heightM > top) top = base + o.heightM;
  }
  return { ...b, r, yMax: top };
}
