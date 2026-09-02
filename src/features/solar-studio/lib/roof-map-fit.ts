// ─── What the aerial height map says a traced roof IS ───────────────────────
// Google's height map (lib/surround, 0.5 m grid, uncut) holds every roof at
// the site. When a roof is traced, its samples inside the polygon give the
// eave height, the pitch and the facing — MEASURED, not typed — and the
// things standing on it (tanks, stair rooms, AC units) as clusters rising
// above the fitted plane. Pure maths on the grid; worker-safe.
import type { Obstruction, ObstructionType, Roof, XY } from '../types';
import { fitPlane, type PlaneFit } from './roof-ai/plane-fit';
import { ROOF_READ_MIN_CELLS, type SurroundHeights } from './surround-geometry';
import { pointInPolygon } from './geo';

export interface RoofMapFit {
  /** eave (low-side) height above grade for a pitched roof, the median for a flat one — metres */
  heightM: number;
  /** median height over the polygon, metres above grade */
  medianM: number;
  pitchDeg: number;
  /** compass direction the surface slopes DOWN toward; null when flat (< 3°) */
  slopeAzimuthDeg: number | null;
  /** fit residual, metres: < 0.35 is a clean plane worth trusting for pitch */
  rmseM: number;
  cells: number;
  plane: PlaneFit;
}

/**
 * A pitch below this is a flat roof. A concrete deck drains at 1–3° and the
 * grid's edge cells add a degree or two of their own; calling that a pitched
 * roof would turn every flush table on it. Real pitched roofs start near 10°.
 */
export const FLAT_PITCH_DEG = 5;
/** Above this residual the plane is not trusted for pitch and facing (only the height is used). */
export const TRUSTED_RMSE_M = 0.35;
/** Cells this far above the plane are things ON the roof, not the roof. */
const RAISED_MIN_M = 0.6;
/** Raised clusters this close to the polygon edge are parapets, not objects. */
const EDGE_BAND_M = 0.75;
const MIN_OBJECT_CELLS = 4; // 1 m² at 0.5 m
const MAX_OBJECTS = 20;

interface Cell {
  c: number;
  r: number;
  x: number;
  y: number;
  h: number;
}

function cellsInside(g: SurroundHeights, polygon: XY[]): Cell[] {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const out: Cell[] = [];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const x = g.originEN.x + c * g.stepCol.x + r * g.stepRow.x;
      const y = g.originEN.y + c * g.stepCol.y + r * g.stepRow.y;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (!pointInPolygon({ x, y }, polygon)) continue;
      out.push({ c, r, x, y, h: g.heights[r * g.cols + c] });
    }
  }
  return out;
}

function planeAt(p: PlaneFit, x: number, y: number): number {
  return p.zAtCentroid + p.a * (x - p.centroidX) + p.b * (y - p.centroidY);
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * The roof as the height map sees it. Two passes: fit, drop what stands more
 * than 1 m off the plane (tanks, parapets, a stair room), fit again. Azimuths
 * come out in the design frame; `northOffsetDeg` turns them to the compass.
 */
export function roofMapFit(g: SurroundHeights, roof: Pick<Roof, 'polygon'>, northOffsetDeg = 0): RoofMapFit | null {
  if (roof.polygon.length < 3) return null;
  const cells = cellsInside(g, roof.polygon);
  if (cells.length < ROOF_READ_MIN_CELLS) return null;
  const fit = (cs: Cell[]) =>
    fitPlane(
      cs.map((k) => k.x),
      cs.map((k) => k.y),
      cs.map((k) => k.h),
    );
  let plane = fit(cells);
  if (!plane) return null;
  const kept = cells.filter((k) => Math.abs(k.h - planeAt(plane!, k.x, k.y)) <= 1.0);
  if (kept.length >= ROOF_READ_MIN_CELLS) {
    const again = fit(kept);
    if (again) plane = again;
  }
  const medianM = median((kept.length >= ROOF_READ_MIN_CELLS ? kept : cells).map((k) => k.h));
  const pitched = plane.pitchDeg >= FLAT_PITCH_DEG && plane.rmseM <= TRUSTED_RMSE_M;
  // a pitched roof's height is its eave: the plane at the lowest polygon corner
  const eaveM = pitched ? Math.min(...roof.polygon.map((p) => planeAt(plane!, p.x, p.y))) : medianM;
  const azFrame = plane.azimuthDeg;
  const slopeAzimuthDeg =
    pitched && azFrame !== null ? (((azFrame - northOffsetDeg) % 360) + 360) % 360 : null;
  return {
    heightM: Math.max(0, Math.round((pitched ? eaveM : medianM) * 10) / 10),
    medianM: Math.round(medianM * 10) / 10,
    pitchDeg: pitched ? Math.round(plane.pitchDeg) : 0,
    slopeAzimuthDeg: slopeAzimuthDeg === null ? null : Math.round(slopeAzimuthDeg),
    rmseM: Math.round(plane.rmseM * 100) / 100,
    cells: cells.length,
    plane,
  };
}

/**
 * The roof — and every roof standing ON it (a polygon inside this one: a
 * mumty, a stair room) — set to what the map measured, so a parent read at
 * 75 m does not leave its mumty at 14 m inside the building. Roofs the map
 * cannot read are left as they are.
 */
export function roofsWithMapFit(roofs: Roof[], g: SurroundHeights, roofId: string, northOffsetDeg = 0): Roof[] {
  const target = roofs.find((r) => r.id === roofId);
  if (!target) return roofs;
  const family = new Set(
    roofs
      .filter((r) => r.id === target.id || r.polygon.every((v) => pointInPolygon(v, target.polygon)))
      .map((r) => r.id),
  );
  return roofs.map((r) => {
    if (!family.has(r.id)) return r;
    const fit = roofMapFit(g, r, northOffsetDeg);
    if (!fit) return r;
    const next: Roof = { ...r, heightM: fit.heightM, heightSource: 'aerial_map' };
    if (fit.rmseM <= TRUSTED_RMSE_M) {
      next.pitchDeg = fit.pitchDeg;
      if (fit.slopeAzimuthDeg !== null) next.slopeAzimuthDeg = fit.slopeAzimuthDeg;
    }
    return next;
  });
}

export interface RaisedObject {
  center: XY;
  lengthM: number;
  widthM: number;
  /** above the roof plane, metres */
  heightM: number;
  cells: number;
}

function distToPolygon(p: XY, poly: XY[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/**
 * Things standing on the roof: 4-connected clusters of cells at least 0.6 m
 * above the fitted plane, 1 m² or more, not hugging the edge (that is the
 * parapet). Largest first, at most 20.
 */
export function roofRaisedObjects(g: SurroundHeights, roof: Pick<Roof, 'polygon'>, fit: RoofMapFit): RaisedObject[] {
  const cells = cellsInside(g, roof.polygon);
  const key = (c: number, r: number) => r * g.cols + c;
  const raised = new Map<number, Cell & { res: number }>();
  for (const k of cells) {
    const res = k.h - planeAt(fit.plane, k.x, k.y);
    if (res >= RAISED_MIN_M) raised.set(key(k.c, k.r), { ...k, res });
  }
  const seen = new Set<number>();
  const out: RaisedObject[] = [];
  for (const [id, start] of raised) {
    if (seen.has(id)) continue;
    const comp: (Cell & { res: number })[] = [];
    const stack = [start];
    seen.add(id);
    while (stack.length) {
      const k = stack.pop()!;
      comp.push(k);
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nid = key(k.c + dc, k.r + dr);
        const n = raised.get(nid);
        if (n && !seen.has(nid)) {
          seen.add(nid);
          stack.push(n);
        }
      }
    }
    if (comp.length < MIN_OBJECT_CELLS) continue;
    const onEdge = comp.filter((k) => distToPolygon(k, roof.polygon) < EDGE_BAND_M).length;
    if (onEdge / comp.length >= 0.5) continue; // a parapet, not an object
    const xs = comp.map((k) => k.x);
    const ys = comp.map((k) => k.y);
    const step = Math.hypot(g.stepCol.x, g.stepCol.y);
    out.push({
      center: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 },
      lengthM: Math.round((Math.max(...xs) - Math.min(...xs) + step) * 10) / 10,
      widthM: Math.round((Math.max(...ys) - Math.min(...ys) + step) * 10) / 10,
      heightM: Math.round(median(comp.map((k) => k.res)) * 10) / 10,
      cells: comp.length,
    });
  }
  return out.sort((a, b) => b.cells - a.cells).slice(0, MAX_OBJECTS);
}

/** A first guess at what a raised object is, from its size — the user can change it. */
export function guessObstructionType(o: RaisedObject): ObstructionType {
  const long = Math.max(o.lengthM, o.widthM);
  const short = Math.min(o.lengthM, o.widthM);
  if (long >= 3 && o.heightM >= 2.2) return 'elevated'; // stair room / lift machine room
  if (long <= 3 && short >= 1 && o.heightM >= 1) return 'tank';
  return 'other';
}

/** Raised objects that no drawn obstruction already stands on (centres 1.5 m apart or less count as the same). */
export function raisedObjectsNotDrawn(objects: RaisedObject[], drawn: Obstruction[]): RaisedObject[] {
  return objects.filter((o) => !drawn.some((d) => Math.hypot(d.center.x - o.center.x, d.center.y - o.center.y) <= 1.5));
}
