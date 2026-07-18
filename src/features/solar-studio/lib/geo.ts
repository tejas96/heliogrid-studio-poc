// ─── Geometry helpers: lat/lng ↔ local meters, polygon math ────────────────
import pc from 'polygon-clipping';
import type { LatLng, XY } from '../types';

const EARTH_R = 6378137;

/** Equirectangular projection around an origin — accurate enough at roof scale. */
export function makeProjector(origin: LatLng) {
  const latRad = (origin.lat * Math.PI) / 180;
  const mPerDegLat = (Math.PI / 180) * EARTH_R;
  const mPerDegLng = mPerDegLat * Math.cos(latRad);
  return {
    toXY(p: LatLng): XY {
      return {
        x: (p.lng - origin.lng) * mPerDegLng,
        y: (p.lat - origin.lat) * mPerDegLat,
      };
    },
    toLatLng(p: XY): LatLng {
      return {
        lat: origin.lat + p.y / mPerDegLat,
        lng: origin.lng + p.x / mPerDegLng,
      };
    },
  };
}

export function dist(a: XY, b: XY): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polygonArea(poly: XY[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Closed-ring perimeter in metres — fencing and earthing-ring quantities. */
export function polygonPerimeter(poly: XY[]): number {
  if (poly.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) sum += dist(poly[i], poly[(i + 1) % poly.length]);
  return sum;
}

export function polygonCentroid(poly: XY[]): XY {
  let cx = 0,
    cy = 0,
    a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) {
    const n = poly.length;
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      y: poly.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y,
      xj = poly[j].x,
      yj = poly[j].y;
    const hit =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** Signed area > 0 means counter-clockwise. */
export function isCCW(poly: XY[]): boolean {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += (b.x - a.x) * (b.y + a.y);
  }
  return s < 0;
}

/**
 * Robust polygon inset (setback band removal), safe for CONCAVE outlines.
 *
 * Instead of miter-offsetting edges (which self-intersects on reflex
 * vertices), we boolean-subtract the boundary band from the polygon:
 *   inset = poly − ∪( per-edge inward strips + per-vertex disks )
 * The result can legitimately be several disjoint regions (e.g. a U-shaped
 * roof pinched by its own setback), so an array of polygons is returned.
 */
export function insetPolygonRobust(poly: XY[], insets: number[]): XY[][] {
  // drop consecutive near-duplicate vertices (keeping each edge's inset
  // aligned) — they destabilise the clipper's sweep line for zero benefit
  const pts: XY[] = [];
  const ws: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1e-6) continue;
    pts.push(p);
    ws.push(insets[i] ?? insets[0] ?? 0);
  }
  if (
    pts.length > 1 &&
    Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6
  ) {
    pts.pop();
    ws.pop();
  }

  const n = pts.length;
  if (n < 3) return [];
  const maxInset = Math.max(0, ...ws);
  if (maxInset < 1e-4) return [pts.map((p) => ({ ...p }))];

  const ccw = isCCW(pts);
  const eps = 0.02; // small outward overhang so strips fully cover the edge
  // 0.1 mm grid: irrelevant dimensionally, but keeps the clipper's sweep line
  // away from the nearly-degenerate intersections a hand trace produces
  const snap = (v: number) => Math.round(v * 1e4) / 1e4;
  type Ring = [number, number][];
  const close = (r: Ring): Ring =>
    r.length > 0 ? [...r, [r[0][0], r[0][1]]] : r;
  const clips: Ring[] = [];

  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const inx = (ccw ? -dy : dy) / len; // inward normal
    const iny = (ccw ? dx : -dx) / len;
    const w = Math.max(0, ws[i]);
    if (w < 1e-4) continue;
    clips.push(
      close([
        [snap(a.x - inx * eps), snap(a.y - iny * eps)],
        [snap(b.x - inx * eps), snap(b.y - iny * eps)],
        [snap(b.x + inx * w), snap(b.y + iny * w)],
        [snap(a.x + inx * w), snap(a.y + iny * w)],
      ]),
    );
  }
  // vertex disks close the corner gaps between adjacent strips
  for (let i = 0; i < n; i++) {
    const prevW = ws[(i + n - 1) % n];
    const w = Math.max(prevW, ws[i]);
    if (w < 1e-4) continue;
    const c = pts[i];
    const disk: Ring = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      disk.push([snap(c.x + Math.cos(a) * w), snap(c.y + Math.sin(a) * w)]);
    }
    clips.push(close(disk));
  }

  const subject: Ring = close(pts.map((p) => [snap(p.x), snap(p.y)] as [number, number]));
  let result: [number, number][][][];
  try {
    result = pc.difference(
      [subject],
      ...clips.map((r) => [[r]] as [Ring[]]),
    ) as [number, number][][][];
  } catch {
    // polygon-clipping's sweep line can crash on nearly-collinear input
    // ("Unable to find segment … in SweepLine tree"). Returning [] here used
    // to read as "fully consumed by the setback" and hard-blocked valid roofs.
    // Recover by carving the strips one at a time, skipping any single strip
    // that still crashes — that edge's setback momentarily relaxes instead of
    // the whole roof being rejected.
    let acc = [[subject]] as [number, number][][][];
    for (const r of clips) {
      try {
        acc = pc.difference(
          acc as [number, number][][][],
          [[r]] as [Ring[]],
        ) as [number, number][][][];
      } catch {
        continue;
      }
      if (acc.length === 0) break;
    }
    result = acc;
  }

  const regions: XY[][] = [];
  for (const polygon of result) {
    const outer = polygon[0]; // holes inside a setback region can't hold panels anyway
    if (!outer) continue;
    const ring = outer.map(([x, y]) => ({ x, y }));
    // drop the closing duplicate vertex if present
    if (
      ring.length > 1 &&
      Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 1e-9
    ) {
      ring.pop();
    }
    if (ring.length >= 3 && polygonArea(ring) >= 0.5) regions.push(ring);
  }
  return regions;
}

/** pc rings are closed (last point repeats the first) — convert and unclose. */
function ringToXY(ring: [number, number][]): XY[] {
  const r = ring.map(([x, y]) => ({ x, y }));
  if (
    r.length > 1 &&
    Math.hypot(r[0].x - r[r.length - 1].x, r[0].y - r[r.length - 1].y) < 1e-9
  ) {
    r.pop();
  }
  return r;
}

/**
 * Robust polygon OUTSET (dilation) — the mirror of insetPolygonRobust:
 *   outset = poly ∪ ( per-edge outward strips + per-vertex disks )
 * Per-edge widths supported (width 0 = edge not dilated). Used for outward
 * parapet bands: band = outset outer ring with the original polygon as hole.
 */
export function outsetPolygonRobust(poly: XY[], outsets: number[]): XY[][] {
  const pts: XY[] = [];
  const ws: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1e-6) continue;
    pts.push(p);
    ws.push(outsets[i] ?? outsets[0] ?? 0);
  }
  if (
    pts.length > 1 &&
    Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6
  ) {
    pts.pop();
    ws.pop();
  }

  const n = pts.length;
  if (n < 3) return [];
  const maxOut = Math.max(0, ...ws);
  if (maxOut < 1e-4) return [pts.map((p) => ({ ...p }))];

  const ccw = isCCW(pts);
  const eps = 0.02; // small inward overhang so strips weld onto the polygon
  const snap = (v: number) => Math.round(v * 1e4) / 1e4;
  type Ring = [number, number][];
  const close = (r: Ring): Ring => (r.length > 0 ? [...r, [r[0][0], r[0][1]]] : r);
  const clips: Ring[] = [];

  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ox = (ccw ? dy : -dy) / len; // outward normal
    const oy = (ccw ? -dx : dx) / len;
    const w = Math.max(0, ws[i]);
    if (w < 1e-4) continue;
    clips.push(
      close([
        [snap(a.x - ox * eps), snap(a.y - oy * eps)],
        [snap(b.x - ox * eps), snap(b.y - oy * eps)],
        [snap(b.x + ox * w), snap(b.y + oy * w)],
        [snap(a.x + ox * w), snap(a.y + oy * w)],
      ]),
    );
  }
  for (let i = 0; i < n; i++) {
    const prevW = ws[(i + n - 1) % n];
    const w = Math.max(prevW, ws[i]);
    if (w < 1e-4) continue;
    const c = pts[i];
    const disk: Ring = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      disk.push([snap(c.x + Math.cos(a) * w), snap(c.y + Math.sin(a) * w)]);
    }
    clips.push(close(disk));
  }

  const subject: Ring = close(pts.map((p) => [snap(p.x), snap(p.y)] as [number, number]));
  let result: [number, number][][][];
  try {
    result = pc.union([subject], ...clips.map((r) => [[r]] as [Ring[]])) as [
      number,
      number,
    ][][][];
  } catch {
    // same sweep-line crash recovery as the inset: weld strips one at a time
    let acc = [[subject]] as [number, number][][][];
    for (const r of clips) {
      try {
        acc = pc.union(acc as [number, number][][][], [[r]] as [Ring[]]) as [
          number,
          number,
        ][][][];
      } catch {
        continue;
      }
    }
    result = acc;
  }

  const regions: XY[][] = [];
  for (const polygon of result) {
    const outer = polygon[0];
    if (!outer) continue;
    const ring = ringToXY(outer);
    if (ring.length >= 3) regions.push(ring);
  }
  return regions;
}

/**
 * Overlap of two segments that lie (nearly) on the same line — used to detect
 * shared walls between adjacent roofs. Returns the overlap length and the
 * covered parameter interval on segment A, or null when not collinear enough.
 */
export function collinearOverlap(
  a1: XY,
  a2: XY,
  b1: XY,
  b2: XY,
  distTolM = 0.05,
  angTolDeg = 2,
): { lenM: number; tA0: number; tA1: number } | null {
  const vax = a2.x - a1.x;
  const vay = a2.y - a1.y;
  const la = Math.hypot(vax, vay);
  if (la < 1e-9) return null;
  const vbx = b2.x - b1.x;
  const vby = b2.y - b1.y;
  const lb = Math.hypot(vbx, vby);
  if (lb < 1e-9) return null;
  const sinAng = Math.abs(vax * vby - vay * vbx) / (la * lb);
  if (Math.asin(Math.min(1, sinAng)) > (angTolDeg * Math.PI) / 180) return null;
  const perp = (p: XY) => Math.abs((p.x - a1.x) * vay - (p.y - a1.y) * vax) / la;
  if (perp(b1) > distTolM || perp(b2) > distTolM) return null;
  const proj = (p: XY) => ((p.x - a1.x) * vax + (p.y - a1.y) * vay) / (la * la);
  let t0 = proj(b1);
  let t1 = proj(b2);
  if (t0 > t1) [t0, t1] = [t1, t0];
  const s0 = Math.max(0, t0);
  const s1 = Math.min(1, t1);
  if (s1 - s0 <= 1e-9) return null;
  return { lenM: (s1 - s0) * la, tA0: s0, tA1: s1 };
}

/** Does a convex quad (panel rect) intersect a polygon at all? */
export function rectIntersectsPolygon(corners: XY[], poly: XY[]): boolean {
  if (poly.length < 3) return false;
  if (corners.some((c) => pointInPolygon(c, poly))) return true;
  if (poly.some((p) => pointInPolygon(p, corners))) return true;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    for (let j = 0; j < poly.length; j++) {
      if (segmentsIntersect(a, b, poly[j], poly[(j + 1) % poly.length], 1e-9)) return true;
    }
  }
  return false;
}

/** Total footprint area of polygons WITHOUT double-counting overlaps. */
export function polygonsUnionArea(polys: XY[][]): number {
  const valid = polys.filter((p) => p.length >= 3);
  if (valid.length === 0) return 0;
  try {
    const geoms = valid.map((p) => [p.map((q) => [q.x, q.y] as [number, number])]);
    const u = pc.union(geoms[0], ...geoms.slice(1)) as [number, number][][][];
    let area = 0;
    for (const polygon of u) {
      polygon.forEach((ring, idx) => {
        const a = polygonArea(ringToXY(ring));
        area += idx === 0 ? a : -a;
      });
    }
    return area;
  } catch {
    // clipper crash — plain sum is the least-wrong fallback
    return valid.reduce((s, p) => s + polygonArea(p), 0);
  }
}

/**
 * Boolean difference `subject − clips`, returned as clean polygons each with
 * its own holes. Unlike hand-building a THREE.Shape with holes, the clipper
 * guarantees the holes never touch the outer boundary, so the result always
 * triangulates without spurious spanning faces (the parapet-band artifact).
 */
export function differencePolygons(
  subject: XY[],
  clips: XY[][],
): Array<{ outer: XY[]; holes: XY[][] }> {
  if (subject.length < 3) return [];
  const valid = clips.filter((c) => c.length >= 3);
  if (valid.length === 0) return [{ outer: subject.map((p) => ({ ...p })), holes: [] }];
  try {
    const subj = [subject.map((p) => [p.x, p.y] as [number, number])];
    const clipGeoms = valid.map((c) => [c.map((p) => [p.x, p.y] as [number, number])]);
    const res = pc.difference(subj, ...clipGeoms) as [number, number][][][];
    return res
      .map((polygon) => ({
        outer: ringToXY(polygon[0] ?? []),
        holes: polygon.slice(1).map(ringToXY).filter((h) => h.length >= 3),
      }))
      .filter((b) => b.outer.length >= 3);
  } catch {
    // clipper crash — fall back to the raw shape+holes (still renders)
    return [{ outer: subject.map((p) => ({ ...p })), holes: valid }];
  }
}

/** Intersection of two polygons (outer rings only). */
export function intersectPolygons(a: XY[], b: XY[]): XY[][] {
  if (a.length < 3 || b.length < 3) return [];
  try {
    const res = pc.intersection(
      [a.map((p) => [p.x, p.y] as [number, number])],
      [b.map((p) => [p.x, p.y] as [number, number])],
    ) as [number, number][][][];
    return res
      .map((polygon) => ringToXY(polygon[0] ?? []))
      .filter((r) => r.length >= 3);
  } catch {
    return [];
  }
}

export function rotate(p: XY, deg: number): XY {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r),
    s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function add(a: XY, b: XY): XY {
  return { x: a.x + b.x, y: a.y + b.y };
}
export function sub(a: XY, b: XY): XY {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Rectangle corners for a panel/obstruction footprint. */
export function rectCorners(
  center: XY,
  lengthM: number,
  widthM: number,
  rotationDeg: number,
): XY[] {
  const hw = lengthM / 2;
  const hh = widthM / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((c) => add(rotate(c, rotationDeg), center));
}

export function rectsOverlap(a: XY[], b: XY[]): boolean {
  // SAT for convex quads
  const polys = [a, b];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const nx = p2.y - p1.y;
      const ny = p1.x - p2.x;
      let minA = Infinity,
        maxA = -Infinity,
        minB = Infinity,
        maxB = -Infinity;
      for (const p of a) {
        const proj = p.x * nx + p.y * ny;
        minA = Math.min(minA, proj);
        maxA = Math.max(maxA, proj);
      }
      for (const p of b) {
        const proj = p.x * nx + p.y * ny;
        minB = Math.min(minB, proj);
        maxB = Math.max(maxB, proj);
      }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

/** Distance from point to segment, and the closest t (0..1). */
export function pointSegDist(
  p: XY,
  a: XY,
  b: XY,
): { d: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby || 1;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return { d: Math.hypot(p.x - cx, p.y - cy), t };
}

export interface PolygonValidation {
  valid: boolean;
  reason?: string;
}

function orientation(a: XY, b: XY, c: XY): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: XY, b: XY, p: XY, epsilon: number): boolean {
  return (
    Math.abs(orientation(a, b, p)) <= epsilon &&
    p.x >= Math.min(a.x, b.x) - epsilon &&
    p.x <= Math.max(a.x, b.x) + epsilon &&
    p.y >= Math.min(a.y, b.y) - epsilon &&
    p.y <= Math.max(a.y, b.y) + epsilon
  );
}

function segmentsIntersect(a: XY, b: XY, c: XY, d: XY, epsilon: number): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (
    ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
    ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))
  ) {
    return true;
  }
  return (
    onSegment(a, b, c, epsilon) ||
    onSegment(a, b, d, epsilon) ||
    onSegment(c, d, a, epsilon) ||
    onSegment(c, d, b, epsilon)
  );
}

/** Validate a roof ring before handing it to setbacks, layout, or Three.js. */
export function validateRoofPolygon(
  poly: XY[],
  { minEdgeM = 0.15, minAreaM2 = 0.5 }: { minEdgeM?: number; minAreaM2?: number } = {},
): PolygonValidation {
  if (poly.length < 3) return { valid: false, reason: 'A roof needs at least 3 corners.' };
  if (poly.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    return { valid: false, reason: 'Every roof point must have a valid coordinate.' };
  }
  for (let i = 0; i < poly.length; i++) {
    if (dist(poly[i], poly[(i + 1) % poly.length]) < minEdgeM) {
      return { valid: false, reason: `Roof edges must be at least ${minEdgeM} m long.` };
    }
  }
  const epsilon = 1e-8;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    for (let j = i + 1; j < poly.length; j++) {
      const nextI = (i + 1) % poly.length;
      const nextJ = (j + 1) % poly.length;
      if (i === j || nextI === j || nextJ === i) continue;
      if (segmentsIntersect(a, b, poly[j], poly[nextJ], epsilon)) {
        return { valid: false, reason: 'Roof edges cannot cross or touch each other.' };
      }
    }
  }
  if (polygonArea(poly) < minAreaM2) {
    return { valid: false, reason: `Roof area must be at least ${minAreaM2} m².` };
  }
  return { valid: true };
}

/** Dominant edge azimuth of a polygon (deg from north, for panel alignment). */
export function dominantEdgeAngle(poly: XY[]): number {
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = dist(a, b);
    if (len > bestLen) {
      bestLen = len;
      best = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    }
  }
  return best;
}

export function fmtM(m: number): string {
  return `${m.toFixed(2)} m`;
}

let idCounter = 0;
/**
 * Collision-safe entity id. The old timestamp+counter scheme collided across
 * tabs/devices (counter resets per session) — a real risk now that projects
 * from two tabs can merge via storage events. UUID when available; the legacy
 * scheme stays as a fallback for non-secure contexts.
 */
export function genId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}
