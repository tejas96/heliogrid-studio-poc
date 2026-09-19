// ─── The wall a facade array hangs on: one frame, read by everybody ──────────
//
// A facade is the only mounting surface in this app whose height is NOT a
// function of its plan position (see RoofType 'facade'). In plan it is a LINE;
// in elevation it is a rectangle. So two questions that every other roof
// answers from its polygon alone have to be answered here instead, once:
//
//   which EDGE of the footprint is the live face?   → `facadeFace`
//   where does the clad band start and stop?        → `facadeSillM` / `facadeBandM`
//
// Five consumers need the same answer — the fill that places the courses, the
// structure builder that hangs rails on brackets, the DRC that must compare
// modules in ELEVATION rather than in plan, the BOM that buys the brackets, and
// the validator. Deriving it five times is how a facade ends up with its rails
// on one face and its modules on another.
import type { Roof, XY } from '../types';
import { resolveRules } from '../data/rules/india';

/**
 * Plan depth a facade module occupies: the laminate plus the bracket and rail
 * that hold it clear of the wall.
 *
 * ASSUMED. A real rail-and-bracket stack is a vendor dimension, and nothing in
 * the model measures it. It is a real number rather than zero because a
 * vertical plate's true plan projection is a line, and a line is invisible in
 * the 2D editor and degenerate in every overlap test.
 */
export const FACADE_PLAN_DEPTH_M = 0.12;

/** How far short of the wall's corners the cladding stops, m. ASSUMED. */
export const FACADE_EDGE_CLEARANCE_M = 0.15;

/** The live face of a facade: the stretch of wall the modules hang on. */
export interface FacadeFace {
  /** the face's two ends, in plan */
  a: XY;
  b: XY;
  /** unit vector from a to b — "along the wall" */
  along: XY;
  /** unit outward normal — the direction the modules look */
  outward: XY;
  lengthM: number;
}

/**
 * Which footprint edge the modules hang on.
 *
 * Scored by `length × cos(gap to the facing)`, and both halves of that matter.
 * The facing alone would let a 230 mm end-cap of the wall strip win over the
 * 18 m face beside it whenever the user's typed azimuth happened to be nearer
 * the cap's normal — a facade whose whole array is three modules wide round the
 * corner. Length alone would ignore the azimuth the user set, which is the one
 * field that says which way the building looks.
 *
 * Returns null when the footprint has no edge facing anywhere near the stated
 * azimuth — that is a contradiction to report, not a face to guess at.
 */
export function facadeFace(roof: Roof): FacadeFace | null {
  const poly = roof.polygon;
  if (poly.length < 3) return null;
  const facing = ((roof.slopeAzimuthDeg % 360) + 360) % 360;
  let best: FacadeFace | null = null;
  let bestScore = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    // polygons are stored CCW, so (dy, −dx) points OUT of the footprint
    const outward = { x: dy / len, y: -dx / len };
    // bearing of that normal, in the project's 0 = north, clockwise convention
    const bearing = ((Math.atan2(outward.x, outward.y) * 180) / Math.PI + 360) % 360;
    const gap = Math.abs(((bearing - facing) % 360) + 360) % 360;
    const cos = Math.cos((Math.min(gap, 360 - gap) * Math.PI) / 180);
    if (cos <= 0) continue; // this edge faces away from the stated azimuth
    const score = len * cos;
    if (score > bestScore) {
      bestScore = score;
      best = { a, b, along: { x: dx / len, y: dy / len }, outward, lengthM: len };
    }
  }
  return best;
}

/**
 * Where the clad band starts above grade, m.
 *
 * Never 0 by default. A facade that starts at the pavement puts glass where it
 * gets hit by a reversing car, washed by a monsoon gutter and stolen, and no
 * Indian installer details one that way — so the fallback is a real ground-floor
 * height, and it is ASSUMED until the elevation drawing says otherwise.
 */
export function facadeSillM(roof: Roof): number {
  const fallback = resolveRules().facade.sillM;
  const sill = roof.facade?.sillM;
  return Math.max(0, Math.min(roof.heightM, sill ?? fallback));
}

/** Height of the clad band: sill → top of wall, m. 0 when there is no room. */
export function facadeBandM(roof: Roof): number {
  return Math.max(0, roof.heightM - facadeSillM(roof));
}

/**
 * How far along the live face a plan point lies, m.
 *
 * THE coordinate a facade's modules are actually distinguished by. Every
 * consumer that has to compare two facade modules must compare (this, height) —
 * comparing plan rectangles reports every course above the first as overlapping
 * the one below it, because in plan they are the same rectangle.
 */
export function facadeAlongM(face: FacadeFace, p: XY): number {
  return (p.x - face.a.x) * face.along.x + (p.y - face.a.y) * face.along.y;
}
