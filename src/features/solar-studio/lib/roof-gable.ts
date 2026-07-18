// ─── Pitched multi-plane roofs: the gable factory (Phase 21) ────────────────
// A gable is TWO planes meeting at a ridge. We model it as two adjacent Roof
// faces — NOT a new "faces" field — because every downstream engine (eave
// grouping, surfaceHeightAt, layout fill, shadow casters, BOM, 3D solid)
// already works per-Roof, and two opposite-facing adjacent Roofs meet exactly
// at the shared ridge (proven: symmetric halves, same pitch + eave, reach the
// same height along the ridge line). This keeps the whole pitched-roof
// capability additive and reuses the battle-tested single-plane pipeline.
//
// EPC note: the ridge runs along `ridgeAngleDeg`; each face slopes DOWN
// perpendicular to it, toward its own eave wall. Pitch and eave height are
// shared, so the ridge is level and the two faces are symmetric about it.
import type { Roof, RoofType, XY } from '../types';
import { makeRoof, sanitizeRoofPolygon } from './roof-factory';
import { polygonCentroid, dominantEdgeAngle } from './geo';
import { surfaceHeightAt } from './roof-plane';

/**
 * Ridge direction as a plan unit vector, in the MATH convention that
 * `dominantEdgeAngle` uses (0° = +x/East, CCW) — NOT a compass bearing. Keeping
 * the ridge geometry in one convention and converting to compass only for the
 * azimuth avoids the 90° trap (a real bug the ridge-meet test caught).
 */
function ridgeVec(deg: number): XY {
  const a = (deg * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** slopeAzimuthDeg for a desired downslope plan vector (inverse of slopeVector). */
export function azFromDownslope(d: XY): number {
  const deg = (Math.atan2(d.x, d.y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Clip a polygon to the half-plane where signed distance to the ridge line is
 * ≤ 0 (keep = 'neg') or ≥ 0 (keep = 'pos'), adding the two ridge intersection
 * points. Sutherland–Hodgman against a single edge — exact, no dependency.
 */
function clipHalf(poly: XY[], c: XY, n: XY, keep: 'pos' | 'neg'): XY[] {
  const s = (p: XY) => (p.x - c.x) * n.x + (p.y - c.y) * n.y;
  const inside = (v: number) => (keep === 'pos' ? v >= -1e-9 : v <= 1e-9);
  const out: XY[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = s(a);
    const sb = s(b);
    if (inside(sa)) out.push(a);
    if ((sa > 0) !== (sb > 0) && Math.abs(sa - sb) > 1e-12) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

export type GableResult =
  | { ok: true; faces: [Roof, Roof]; ridgeAngleDeg: number }
  | { ok: false; reason: string };

/**
 * Split a footprint into two gable faces sharing a level ridge.
 *
 * `ridgeAngleDeg` — MATH-convention angle (0=East, CCW; same as
 * dominantEdgeAngle) the ridge RUNS along. Default: the footprint's dominant
 * edge, i.e. the ridge parallels the long wall (how gables are almost always
 * built). Faces slope down perpendicular to it.
 */
export function gableFaces(opts: {
  footprint: XY[];
  existing: Roof[];
  ridgeAngleDeg?: number;
  pitchDeg?: number;
  eaveHeightM?: number;
  /**
   * The source roof's COVERING, carried onto both faces. A gable is a change of
   * SHAPE, not of cladding: converting a metal shed must yield metal-shed faces
   * so the BOM keeps clamp pricing instead of switching to roof hooks.
   * Defaults to makeRoof's 'rcc_flat'.
   */
  roofType?: RoofType;
  namePrefix?: string;
}): GableResult {
  const { footprint, existing } = opts;
  if (footprint.length < 3) return { ok: false, reason: 'A roof needs at least 3 corners' };
  const pitchDeg = opts.pitchDeg ?? 20;
  if (pitchDeg < 1 || pitchDeg > 60) return { ok: false, reason: 'Gable pitch must be 1–60°' };
  const eaveHeightM = opts.eaveHeightM ?? 3;
  // ridge parallels the dominant (long) edge unless told otherwise
  const ridgeAngleDeg = opts.ridgeAngleDeg ?? dominantEdgeAngle(footprint);

  const c = polygonCentroid(footprint);
  const ridge = ridgeVec(ridgeAngleDeg);
  const n: XY = { x: ridge.y, y: -ridge.x }; // ridge ⟂ (points to the 'pos' face)

  const posPoly = clipHalf(footprint, c, n, 'pos');
  const negPoly = clipHalf(footprint, c, n, 'neg');
  const posOk = sanitizeRoofPolygon(posPoly);
  const negOk = sanitizeRoofPolygon(negPoly);
  if (!posOk.ok || !negOk.ok) {
    return { ok: false, reason: 'Footprint is too small or narrow to split into a gable' };
  }

  // each face slopes DOWN away from the ridge, toward its own eave
  const posFace: Roof = {
    ...makeRoof({
      polygon: posOk.polygon,
      existing,
      heightM: eaveHeightM,
      pitchDeg,
      roofType: opts.roofType,
    }),
    slopeAzimuthDeg: azFromDownslope(n),
    // a pitched face carries no parapet — and never one on the ridge
    parapet: { enabled: false, direction: 'inward', heightM: 1, widthM: 0.3, perEdge: null, suppressSharedEdges: true },
  };
  const negFace: Roof = {
    ...makeRoof({
      polygon: negOk.polygon,
      existing: [...existing, posFace],
      heightM: eaveHeightM,
      pitchDeg,
      roofType: opts.roofType,
    }),
    slopeAzimuthDeg: azFromDownslope({ x: -n.x, y: -n.y }),
    parapet: { enabled: false, direction: 'inward', heightM: 1, widthM: 0.3, perEdge: null, suppressSharedEdges: true },
  };
  if (opts.namePrefix) {
    posFace.name = `${opts.namePrefix} (face A)`;
    negFace.name = `${opts.namePrefix} (face B)`;
  }
  // A gable is split on the CENTROID, which is the mid-span only when the
  // footprint is symmetric about the ridge. On anything else the two faces
  // climb different runs and meet the ridge at DIFFERENT heights — a roof that
  // cannot be built, and until now accepted silently. Measured at 25°/3 m:
  // a traced trapezoid stepped 0.16 m, a triangle 1.55 m.
  // Verify the invariant the header claims instead of asserting it.
  const peak = (f: Roof) =>
    f.polygon.reduce((hi, p) => Math.max(hi, surfaceHeightAt(f, p)), -Infinity);
  const step = Math.abs(peak(posFace) - peak(negFace));
  if (step > 0.05)
    return {
      ok: false,
      reason: `The two halves would meet the ridge ${step.toFixed(2)} m apart — this footprint is not symmetric about the ridge. Use Hip, which handles unequal spans.`,
    };

  return { ok: true, faces: [posFace, negFace], ridgeAngleDeg };
}
