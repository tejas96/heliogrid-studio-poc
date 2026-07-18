// ─── Pitched roofs over any CONVEX footprint: the straight-skeleton hip (21c) ─
// Generalises roof-hip.ts (rectangles only) to ANY convex footprint — trapezoid,
// pentagon, hexagon, chamfered/angled plan — with an EXACT, event-free method:
//
//   For a convex polygon the equal-pitch straight skeleton is the "nearest
//   wall" partition. Every interior point sheds water to its perpendicular-
//   nearest edge, so the FACE of edge i = { p ∈ P : dist(p,line_i) ≤ dist(p,
//   line_j) ∀ j }. Each pairwise test is a half-plane (the angle bisector of two
//   edge lines), so face_i = P clipped by one bisector per other edge. Faces
//   meet exactly where dist_i = dist_j ⇒ equal height (eave + tanθ·dist) — the
//   hip/ridge lines are consistent by construction, no wavefront simulation and
//   none of its parallel-edge/ridge degeneracies.
//
// Each face becomes an ordinary adjacent Roof sloping down toward its wall — the
// same additive model as gable/hip, so the whole per-roof pipeline runs as-is.
//
// SCOPE (v1, honest): CONVEX footprints only. A reflex corner (L/T/cross) makes
// the nearest site a SEGMENT end, whose bisectors are parabolic arcs — that
// needs a genuine segment straight-skeleton and is refused here rather than
// approximated (wrong valley geometry would violate §A0).
import type { Roof, RoofType, XY } from '../types';
import { makeRoof, preCleanRing, sanitizeRoofPolygon } from './roof-factory';
import { sweepFaces } from './skeleton-wavefront';
import { polygonArea, dist } from './geo';
import { azFromDownslope } from './roof-gable';

// Merge clip vertices closer than this: a shared skeleton node can be produced
// twice (once per clipping edge) a few cm apart. The roof-factory's own minimum
// edge is 0.15 m, so collapsing sub-minimum gaps is both correct (it IS one
// node) and consistent with what sanitize would otherwise reject.
const NODE_SNAP_M = 0.13;

/** Drop consecutive (and wrap-around) near-coincident vertices left by clipping. */
function dedupeRing(poly: XY[]): XY[] {
  const out: XY[] = [];
  for (const p of poly) if (!out.length || dist(out[out.length - 1], p) > NODE_SNAP_M) out.push(p);
  while (out.length > 1 && dist(out[0], out[out.length - 1]) <= NODE_SNAP_M) out.pop();
  return out;
}

// A ring that REVERSES at a vertex (incoming and outgoing directions
// anti-parallel) has doubled back along its own path. cos ≈ −1 is the
// signature; cos ≈ +1 is a merely-straight vertex and is left alone.
const SPIKE_COS = -1 + 1e-4; // ≈ 179.2° or sharper counts as a reversal

/**
 * Collapse ZERO-AREA SPIKES out of a swept face ring.
 *
 * Where the wavefront splits, the two live edges carrying one original wall
 * are emitted as separate faces — but the vertex TRACE of the surviving edge
 * still records the excursion to the far lobe and back. That leaves a ring
 * like (18,6)(15,3)(3,3)(9,3)(12,6): the (15,3)→(3,3)→(9,3) leg runs out and
 * returns along the same line, enclosing nothing. `polygonArea` correctly
 * reports 18 m² (the spike contributes 0), but `sanitizeRoofPolygon` rejects
 * the ring as self-touching — so the face was DROPPED and its 18 m² went
 * missing, which is what made the T and plus footprints fail the tiling gate
 * while `sweepFaces` itself tiled them at 0.000%.
 *
 * Removing a reversal vertex is area-preserving BY CONSTRUCTION (an out-and-
 * back leg encloses zero area), so this recovers the real face instead of
 * loosening any threshold: the T's rejected ring becomes the trapezoid
 * (18,6)(15,3)(9,3)(12,6) — the same 18 m², now a valid simple polygon.
 * A face that is genuinely too small or too thin still fails sanitisation and
 * is still dropped, and the 1% gate still refuses the roof.
 */
function collapseSpikes(poly: XY[]): XY[] {
  const ring = [...poly];
  // each pass removes at least one vertex, so this cannot loop forever
  for (let guard = poly.length + 4; guard > 0 && ring.length >= 3; guard--) {
    let tip = -1;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i - 1 + ring.length) % ring.length];
      const b = ring[i];
      const c = ring[(i + 1) % ring.length];
      const ix = b.x - a.x;
      const iy = b.y - a.y;
      const ox = c.x - b.x;
      const oy = c.y - b.y;
      const li = Math.hypot(ix, iy);
      const lo = Math.hypot(ox, oy);
      if (li < 1e-9 || lo < 1e-9) continue; // duplicate vertex — dedupeRing's job
      if ((ix * ox + iy * oy) / (li * lo) < SPIKE_COS) {
        tip = i;
        break;
      }
    }
    if (tip < 0) break;
    ring.splice(tip, 1);
  }
  return ring;
}

/** Full clean-up for one swept face: snap coincident nodes, then de-spike. */
function cleanSweptRing(poly: XY[]): XY[] {
  return dedupeRing(collapseSpikes(dedupeRing(poly)));
}

export type SkeletonResult =
  | { ok: true; faces: Roof[] }
  | { ok: false; reason: string };

function signedArea(poly: XY[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** inward (left) unit normal of a CCW edge a→b */
function inwardNormal(a: XY, b: XY): XY {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  return { x: -dy / L, y: dx / L };
}

/** Keep the half-plane { p : p·(nx,ny) ≤ c } (Sutherland–Hodgman, one edge). */
function clipHalfPlane(poly: XY[], nx: number, ny: number, c: number): XY[] {
  const s = (p: XY) => p.x * nx + p.y * ny - c;
  const out: XY[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = s(a);
    const sb = s(b);
    if (sa <= 1e-9) out.push(a);
    if ((sa > 1e-9) !== (sb > 1e-9) && Math.abs(sa - sb) > 1e-12) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** Build equal-pitch hip faces over a convex footprint via the straight skeleton. */
export function skeletonFaces(opts: {
  footprint: XY[];
  existing: Roof[];
  pitchDeg?: number;
  eaveHeightM?: number;
  /** source roof's COVERING, carried onto every face (see gableFaces). */
  roofType?: RoofType;
  namePrefix?: string;
}): SkeletonResult {
  // PRE-CLEAN before splitting. The skeleton makes ONE face per edge, so every
  // vertex the footprint carries becomes a roof face. A traced or AI-detected
  // outline whose "straight" wall has a sub-degree kink would otherwise split
  // into two faces with near-identical azimuths, a spurious hip line between
  // them, and sliver Roof objects the fill/shading pipeline then has to carry.
  // preCleanRing is the same gate roof-factory applies on every other
  // construction path (closing duplicate, sub-0.15 m edges, turns < 2°) — this
  // path was simply skipping it. It is a CLEAN-UP, not a tolerance: a genuine
  // turn above 2° is preserved and still gets its own face.
  const raw = preCleanRing(opts.footprint);
  if (raw.length < 3) return { ok: false, reason: 'A roof needs at least 3 corners' };
  const pitchDeg = opts.pitchDeg ?? 20;
  if (pitchDeg < 1 || pitchDeg > 60) return { ok: false, reason: 'Pitch must be 1–60°' };
  const eaveHeightM = opts.eaveHeightM ?? 3;

  const poly = signedArea(raw) < 0 ? [...raw].reverse() : [...raw];
  const n = poly.length;

  // A reflex corner (L/U/T) breaks half-plane clipping: an interior point can
  // sit on the OUTER side of some wall's supporting line, so its signed
  // distance goes negative and the clipper hands the point to a wall on the
  // far side of the building. Those footprints go through the wavefront
  // simulation instead, which models the valley the reflex corner creates.
  const hasReflex = poly.some((_, i) => {
    const a = poly[(i - 1 + n) % n];
    const b = poly[i];
    const c = poly[(i + 1) % n];
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < -1e-6;
  });
  if (hasReflex)
    return reflexFaces(poly, {
      pitchDeg,
      eaveHeightM,
      existing: opts.existing,
      roofType: opts.roofType,
      namePrefix: opts.namePrefix,
    });

  // per-edge inward normal, a point on the edge, and downslope azimuth
  const normal: XY[] = [];
  const pt: XY[] = [];
  const az: number[] = [];
  const dot: number[] = []; // a_i · n_i  (the edge line's signed offset)
  for (let i = 0; i < n; i++) {
    const nn = inwardNormal(poly[i], poly[(i + 1) % n]);
    normal.push(nn);
    pt.push(poly[i]);
    az.push(azFromDownslope({ x: -nn.x, y: -nn.y })); // slopes DOWN toward the eave
    dot.push(poly[i].x * nn.x + poly[i].y * nn.y);
  }

  const faces: Roof[] = [];
  for (let i = 0; i < n; i++) {
    // face_i = P clipped by { dist_i ≤ dist_j } for every other edge j.
    // dist_k(p) = p·n_k − dot_k ; keep p·(n_i−n_j) ≤ dot_i − dot_j.
    let face: XY[] = poly;
    for (let j = 0; j < n && face.length >= 3; j++) {
      if (j === i) continue;
      face = clipHalfPlane(
        face,
        normal[i].x - normal[j].x,
        normal[i].y - normal[j].y,
        dot[i] - dot[j],
      );
    }
    const s = sanitizeRoofPolygon(dedupeRing(face));
    if (!s.ok) {
      return { ok: false, reason: 'Footprint too small/narrow to build a pitched roof' };
    }
    const roof: Roof = {
      ...makeRoof({
        polygon: s.polygon,
        existing: [...opts.existing, ...faces],
        heightM: eaveHeightM,
        pitchDeg,
        roofType: opts.roofType,
      }),
      slopeAzimuthDeg: az[i],
      parapet: { enabled: false, direction: 'inward', heightM: 1, widthM: 0.3, perEdge: null, suppressSharedEdges: true },
    };
    if (opts.namePrefix) roof.name = `${opts.namePrefix} (face ${i + 1})`;
    faces.push(roof);
  }

  // faces must tile the footprint (catches any numeric drift)
  const sum = faces.reduce((s, f) => s + polygonArea(f.polygon), 0);
  if (Math.abs(sum - polygonArea(poly)) / Math.max(1, polygonArea(poly)) > 0.03) {
    return { ok: false, reason: 'Could not build clean roof faces for this footprint' };
  }
  return { ok: true, faces };
}


/**
 * Pitched faces over a REFLEX footprint (L/U…) via the wavefront simulation.
 * The area-tiling gate is the arbiter: a shape the simulation cannot resolve
 * (two interacting reflex corners, e.g. a T) fails the tile check and is
 * refused rather than built wrong.
 */
function reflexFaces(
  poly: XY[],
  opts: {
    pitchDeg: number;
    eaveHeightM: number;
    existing: Roof[];
    roofType?: RoofType;
    namePrefix?: string;
  },
): SkeletonResult {
  const swept = sweepFaces(poly);
  if (!swept.ok) return { ok: false, reason: swept.reason };

  const n = poly.length;
  const faces: Roof[] = [];
  for (const f of swept.faces) {
    const nn = inwardNormal(poly[f.orig], poly[(f.orig + 1) % n]);
    // De-spike BEFORE sanitising: a post-split trace can double back on itself,
    // which reads as a self-touching ring even though the face it describes is
    // an ordinary trapezoid of full area (see collapseSpikes).
    const s = sanitizeRoofPolygon(cleanSweptRing(f.polygon));
    // Still unbuildable after clean-up ⇒ a genuine sliver (below the 0.15 m /
    // 0.5 m² minimums). It is dropped and the tiling gate below notices the
    // missing area and refuses the roof — the right outcome, and the reason we
    // do NOT relax either threshold to make a shape "work".
    if (!s.ok) continue;
    const roof: Roof = {
      ...makeRoof({
        polygon: s.polygon,
        existing: [...opts.existing, ...faces],
        heightM: opts.eaveHeightM,
        pitchDeg: opts.pitchDeg,
        roofType: opts.roofType,
      }),
      slopeAzimuthDeg: azFromDownslope({ x: -nn.x, y: -nn.y }),
      parapet: { enabled: false, direction: 'inward', heightM: 1, widthM: 0.3, perEdge: null, suppressSharedEdges: true },
    };
    if (opts.namePrefix) roof.name = `${opts.namePrefix} (face ${faces.length + 1})`;
    faces.push(roof);
  }
  if (faces.length < 3)
    return { ok: false, reason: 'Footprint too small/narrow to build a pitched roof' };

  // GATE THE FACES WE ACTUALLY RETURN — not the raw swept ones. Sanitising
  // drops slivers, so validating pre-sanitise geometry and then shipping the
  // post-sanitise set means checking something the user never receives. Caught
  // live: a plus/cross footprint passed the old gate and returned faces that
  // were 10% short of the footprint.
  //
  // 1%, not the convex path's 3%: the wavefront is exact when it is right
  // (square, rectangle, symmetric L and T all tile to 0.00%), so a
  // percent-level residual is a lost or duplicated region, not float drift.
  const total = Math.abs(polygonArea(poly));
  const sum = faces.reduce((s, f) => s + Math.abs(polygonArea(f.polygon)), 0);
  if (Math.abs(sum - total) / Math.max(1, total) > 0.01)
    return {
      ok: false,
      // Do NOT guess the cause. The gate fires whenever the faces fail to tile.
      reason:
        'Could not build clean pitched faces for this footprint — inside corners are only partly supported. Use Gable, or split it into simpler roof shapes.',
    };

  return { ok: true, faces };
}
