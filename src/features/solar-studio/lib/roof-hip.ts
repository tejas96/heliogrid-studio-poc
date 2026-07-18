// ─── Pitched multi-plane roofs: the hip factory (Phase 21b) ─────────────────
// A hip roof is FOUR planes: two trapezoids along the long walls + two
// triangles along the short walls, all sloping down to their own eave and
// meeting at a central ridge (and four diagonal hips). Like the gable
// (roof-gable.ts) we model it as ordinary adjacent `Roof` objects — NOT a new
// "faces" field — so every downstream engine (eave grouping, surfaceHeightAt,
// layout fill, shadow casters, BOM, 3D solid) works unchanged. Each face has
// its OWN azimuth, so computeEaveRefs never groups them: each anchors its own
// eave wall, and because all four share one pitch their run to the ridge is the
// SAME (the short half-dimension), so they meet at one consistent ridge height.
//
// EPC note: this is the standard EQUAL-PITCH hip (45° hips in plan). The ridge
// runs along the long axis with length (long − short); a square footprint
// collapses the ridge to a point → a pyramidal hip (four triangles to an apex).
//
// SCOPE (v1, honest): the hip is built on the footprint's oriented bounding box
// (aligned to the dominant/long edge). We only accept footprints that ARE
// essentially rectangular (fill ≥ 95% of that box) — a true hip on an L-shaped
// or irregular plan needs a general straight-skeleton, deliberately deferred.
import type { Roof, RoofType, XY } from '../types';
import { makeRoof, sanitizeRoofPolygon } from './roof-factory';
import { polygonArea, polygonCentroid, dominantEdgeAngle, dist } from './geo';
import { azFromDownslope } from './roof-gable';

/** How well a footprint fills its oriented bounding box (1 = perfect rectangle). */
const RECT_FILL_MIN = 0.95;

/**
 * Drop consecutive near-coincident vertices. A (near-)square collapses the
 * ridge to a point, so the trapezoid faces gain two coincident ridge vertices
 * (a zero-length edge) — this folds them back to clean triangles (a pyramid).
 */
function dedupeRing(poly: XY[]): XY[] {
  const out: XY[] = [];
  for (const p of poly) {
    if (out.length === 0 || dist(out[out.length - 1], p) > 0.1) out.push(p);
  }
  if (out.length > 1 && dist(out[0], out[out.length - 1]) <= 0.1) out.pop();
  return out;
}

export type HipResult =
  | { ok: true; faces: [Roof, Roof, Roof, Roof]; ridgeAngleDeg: number }
  | { ok: false; reason: string };

/**
 * Split a rectangular footprint into four equal-pitch hip faces meeting at a
 * central ridge.
 *
 * `ridgeAngleDeg` — MATH-convention angle (0=East, CCW; same as
 * dominantEdgeAngle) the ridge RUNS along. Default: the footprint's dominant
 * (long) edge — the ridge parallels the long wall, as hips are built.
 */
export function hipFaces(opts: {
  footprint: XY[];
  existing: Roof[];
  ridgeAngleDeg?: number;
  pitchDeg?: number;
  eaveHeightM?: number;
  /** source roof's COVERING, carried onto all four faces (see gableFaces). */
  roofType?: RoofType;
  namePrefix?: string;
}): HipResult {
  const { footprint, existing } = opts;
  if (footprint.length < 3) return { ok: false, reason: 'A roof needs at least 3 corners' };
  const pitchDeg = opts.pitchDeg ?? 20;
  if (pitchDeg < 1 || pitchDeg > 60) return { ok: false, reason: 'Hip pitch must be 1–60°' };
  const eaveHeightM = opts.eaveHeightM ?? 3;

  // Oriented bounding box in the (long-axis u, short-axis v) frame. A hip ridge
  // ALWAYS runs along the long axis (ridge length = long − short > 0), so if the
  // requested angle lands on the short axis we rotate 90° — the ridge isn't a
  // free choice on a rectangle. This lets a "ridge across width" request (valid
  // for a gable) simply resolve to the one geometrically-valid hip.
  const c = polygonCentroid(footprint);
  const frame = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    const uu: XY = { x: Math.cos(a), y: Math.sin(a) };
    const vv: XY = { x: -Math.sin(a), y: Math.cos(a) };
    const su = footprint.map((q) => (q.x - c.x) * uu.x + (q.y - c.y) * uu.y);
    const sv = footprint.map((q) => (q.x - c.x) * vv.x + (q.y - c.y) * vv.y);
    return { uu, vv, su, sv };
  };
  let theta = opts.ridgeAngleDeg ?? dominantEdgeAngle(footprint);
  let f = frame(theta);
  if (Math.max(...f.su) - Math.min(...f.su) < Math.max(...f.sv) - Math.min(...f.sv)) {
    theta += 90; // requested axis is the short one — swing the ridge to the long axis
    f = frame(theta);
  }
  const u = f.uu; // long axis (ridge direction)
  const v = f.vv; // short axis (perpendicular)
  const umin = Math.min(...f.su);
  const umax = Math.max(...f.su);
  const vmin = Math.min(...f.sv);
  const vmax = Math.max(...f.sv);
  const hu = (umax - umin) / 2; // long half-extent
  const hv = (vmax - vmin) / 2; // short half-extent
  // box center (footprint may be off-centre from its centroid)
  const ou = (umin + umax) / 2;
  const ov = (vmin + vmax) / 2;
  const O: XY = { x: c.x + u.x * ou + v.x * ov, y: c.y + u.y * ou + v.y * ov };

  // only a genuine rectangle gets a clean hip; anything else needs a skeleton
  const boxArea = 4 * hu * hv;
  if (boxArea < 1e-6 || polygonArea(footprint) / boxArea < RECT_FILL_MIN) {
    return { ok: false, reason: 'Hip roofs need a rectangular footprint (try Gable, or reshape)' };
  }

  // (u,v) → XY about the box centre
  const P = (su: number, sv: number): XY => ({
    x: O.x + u.x * su + v.x * sv,
    y: O.y + u.y * su + v.y * sv,
  });
  const rEnd = hu - hv; // ridge runs from −rEnd..+rEnd (0 ⇒ pyramid)
  const cPP = P(hu, hv); // +u,+v corner
  const cPM = P(hu, -hv); // +u,−v
  const cMP = P(-hu, hv); // −u,+v
  const cMM = P(-hu, -hv); // −u,−v
  const rP = P(rEnd, 0); // ridge end toward +u
  const rM = P(-rEnd, 0); // ridge end toward −u

  // Four faces; sanitize normalizes winding/CCW. Each slopes toward its eave.
  const specs: { poly: XY[]; down: XY }[] = [
    { poly: [cMP, cPP, rP, rM], down: v }, // long face, eave at +v
    { poly: [cPM, cMM, rM, rP], down: { x: -v.x, y: -v.y } }, // long face, eave at −v
    { poly: [cPM, cPP, rP], down: u }, // short (triangle), eave at +u
    { poly: [cMP, cMM, rM], down: { x: -u.x, y: -u.y } }, // short (triangle), eave at −u
  ];

  const faces: Roof[] = [];
  for (const s of specs) {
    // a pyramid (rEnd≈0) coincides the two ridge vertices — fold to a triangle
    const clean = sanitizeRoofPolygon(dedupeRing(s.poly));
    if (!clean.ok) {
      return { ok: false, reason: 'Footprint is too small or narrow to split into a hip' };
    }
    const face: Roof = {
      ...makeRoof({
        polygon: clean.polygon,
        existing: [...existing, ...faces],
        heightM: eaveHeightM,
        pitchDeg,
        roofType: opts.roofType,
      }),
      slopeAzimuthDeg: azFromDownslope(s.down),
      // a pitched face carries no parapet — and never one on a ridge/hip
      parapet: {
        enabled: false,
        direction: 'inward',
        heightM: 1,
        widthM: 0.3,
        perEdge: null,
        suppressSharedEdges: true,
      },
    };
    faces.push(face);
  }

  if (opts.namePrefix) {
    const tags = ['face A', 'face B', 'face C', 'face D'];
    faces.forEach((f, i) => (f.name = `${opts.namePrefix} (${tags[i]})`));
  }

  return { ok: true, faces: faces as [Roof, Roof, Roof, Roof], ridgeAngleDeg: theta };
}
