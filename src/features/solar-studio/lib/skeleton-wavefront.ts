// ─── Straight-skeleton wavefront simulation (Phase 21c) ─────────────────────
// Shrinks the footprint inward at unit speed and records the polygon each wall
// sweeps out — that swept region IS the roof face for that wall.
//
// Two event types change the wavefront's topology, both solved by the single
// concurrency system in skeleton-events.ts:
//   edge event   a wall shrinks to nothing and drops out of the ring
//   split event  a reflex corner reaches the wall opposite and cuts the ring
//                in two (the L-shaped roof's valley)
//
// A split leaves TWO live wavefront edges carrying the same original wall.
// They are emitted as two faces rather than stitched into one forked polygon:
// both are coplanar with identical pitch and azimuth, so they describe exactly
// the same roof plane, and the rest of the app already handles adjacent faces.
import type { XY } from '../types';
import {
  concurrencyEvent,
  edgeLines,
  pointInRing,
  type EdgeLine,
} from './skeleton-events';

const EPS = 1e-7;
const MAX_EVENTS = 400; // hard stop: a runaway loop must never hang the editor

interface WEdge {
  id: number;
  /** index of the original wall this came from */
  orig: number;
  /** positions of the vertex at this edge's START, oldest first */
  leftTrace: XY[];
  /** positions of the vertex at this edge's END, oldest first */
  rightTrace: XY[];
}

export interface SweptFace {
  /** original wall index — drives pitch/azimuth */
  orig: number;
  polygon: XY[];
}

export type WavefrontResult =
  | { ok: true; faces: SweptFace[] }
  | { ok: false; reason: string };

/** Where two inward-offset walls cross at time t. */
function vertexAt(a: EdgeLine, b: EdgeLine, t: number): XY | null {
  const det = a.n.x * b.n.y - a.n.y * b.n.x;
  if (Math.abs(det) < 1e-9) return null; // parallel walls never cross
  const ca = a.d + t;
  const cb = b.d + t;
  return { x: (ca * b.n.y - a.n.y * cb) / det, y: (a.n.x * cb - ca * b.n.x) / det };
}

/** Unit direction of a wall, pointing from its start vertex to its end vertex. */
function dirOf(e: EdgeLine): XY {
  return { x: e.n.y, y: -e.n.x };
}

/**
 * Does the reflex corner at `p` actually land ON the live span of wall `c`?
 *
 * The algebra only says three offset LINES are concurrent at time t. A real
 * split additionally requires the point to fall strictly BETWEEN wall c's two
 * current bounding vertices. When it lands on an endpoint the wall is not being
 * pierced at all — that is a corner/collapse event wearing a split's clothes,
 * and cutting the wall there slices off an inverted sliver and loses its area
 * (measured: the U-shape lost exactly one 18 m² face this way).
 */
function splitHitsLiveSpan(
  c: EdgeLine,
  prev: EdgeLine,
  next: EdgeLine,
  p: XY,
  t: number,
): boolean {
  const lv = vertexAt(prev, c, t);
  const rv = vertexAt(c, next, t);
  if (!lv || !rv) return false;
  const d = dirOf(c);
  const uL = lv.x * d.x + lv.y * d.y;
  const uR = rv.x * d.x + rv.y * d.y;
  const uP = p.x * d.x + p.y * d.y;
  return uP > Math.min(uL, uR) + 1e-9 && uP < Math.max(uL, uR) - 1e-9;
}

/** Is the corner between two consecutive walls reflex (a valley source)? */
function isReflexPair(a: EdgeLine, b: EdgeLine): boolean {
  // walls turn clockwise at a reflex corner: cross of inward normals flips
  return a.n.x * b.n.y - a.n.y * b.n.x < -1e-9;
}

/**
 * Run the wavefront and return each wall's swept face.
 * Returns a refusal rather than approximate geometry when the simulation does
 * not converge — the caller's area-tiling gate is the second safety net.
 */
export function sweepFaces(poly: XY[]): WavefrontResult {
  const lines = edgeLines(poly);
  const n = poly.length;
  if (n < 3) return { ok: false, reason: 'A roof needs at least 3 corners' };

  let nextId = 0;
  const dead: WEdge[] = [];

  // one loop per connected wavefront; each is an ordered ring of live walls
  let loops: WEdge[][] = [
    poly.map((_, i) => ({
      id: nextId++,
      orig: i,
      // at t=0 the wall spans its own two endpoints
      leftTrace: [poly[i]],
      rightTrace: [poly[(i + 1) % n]],
    })),
  ];

  let t = 0;
  for (let guard = 0; guard < MAX_EVENTS; guard++) {
    // ── find the earliest event across every live loop ──────────────────────
    let best: {
      time: number;
      p: XY;
      loop: number;
      i: number;
      kind: 'edge' | 'split';
      j: number;
    } | null = null;

    for (let li = 0; li < loops.length; li++) {
      const loop = loops[li];
      const m = loop.length;
      if (m < 3) continue;

      for (let i = 0; i < m; i++) {
        const prev = lines[loop[(i - 1 + m) % m].orig];
        const cur = lines[loop[i].orig];
        const next = lines[loop[(i + 1) % m].orig];

        // edge event — this wall collapses between its neighbours
        const ee = concurrencyEvent(prev, cur, next);
        // NOTE: >= t, not > t. A square's four corners collapse at the SAME
        // instant; skipping simultaneous events stalls the wavefront and
        // leaves faces open. Progress is structural — every edge event removes
        // an edge, every split shrinks both rings — so this cannot spin.
        if (ee && ee.t >= t - EPS && pointInRing(ee.p, poly))
          if (!best || ee.t < best.time)
            best = { time: ee.t, p: ee.p, loop: li, i, kind: 'edge', j: -1 };

        // split event — the corner AFTER this wall is reflex and may reach
        // some non-adjacent wall
        const bEdge = lines[loop[(i + 1) % m].orig];
        if (!isReflexPair(cur, bEdge)) continue;
        for (let j = 0; j < m; j++) {
          if (j === i || j === (i + 1) % m) continue;
          const cLine = lines[loop[j].orig];
          const se = concurrencyEvent(cur, bEdge, cLine);
          if (!se || se.t < t - EPS || !pointInRing(se.p, poly)) continue;
          // the struck wall must really be pierced, not merely touched at a
          // corner — see splitHitsLiveSpan
          if (
            !splitHitsLiveSpan(
              cLine,
              lines[loop[(j - 1 + m) % m].orig],
              lines[loop[(j + 1) % m].orig],
              se.p,
              se.t,
            )
          )
            continue;
          if (!best || se.t < best.time)
            best = { time: se.t, p: se.p, loop: li, i, kind: 'split', j };
        }
      }
    }

    if (!best) break; // nothing left to happen
    t = best.time;
    const loop = loops[best.loop];
    const m = loop.length;


    if (best.kind === 'edge') {
      const l = loop[(best.i - 1 + m) % m];
      const cur = loop[best.i];
      const r = loop[(best.i + 1) % m];
      // the collapsing wall's two bounding vertices have arrived at p
      l.rightTrace.push(best.p);
      cur.leftTrace.push(best.p);
      cur.rightTrace.push(best.p);
      r.leftTrace.push(best.p);
      dead.push(cur);
      loop.splice(best.i, 1);
      if (loop.length < 3) {
        // the remnant closes up here
        for (const e of loop) {
          e.leftTrace.push(best.p);
          e.rightTrace.push(best.p);
          dead.push(e);
        }
        loops.splice(best.loop, 1);
      }
    } else {
      // split: the reflex corner between loop[i] and loop[i+1] reaches loop[j]
      const a = loop[best.i];
      const b = loop[(best.i + 1) % m];
      const c = loop[best.j];
      a.rightTrace.push(best.p);
      b.leftTrace.push(best.p);

      // The struck wall becomes two walls, and the region it has ALREADY swept
      // must be partitioned between them — not given to one (which truncates
      // the other, the ~3% loss on an asymmetric L) and not given to both
      // (which double-counts, the 17% over-count before that).
      //
      // The seam is the perpendicular dropped from the split point back onto
      // the original wall. The split point sits exactly `t` from wall c along
      // its inward normal, so its foot on the wall is p − n·t. That segment
      // (foot → split point) cleanly bisects everything c has swept so far, so
      // each half takes its own side and nothing is lost or duplicated.
      const cLine = lines[c.orig];
      const foot: XY = {
        x: best.p.x - cLine.n.x * best.time,
        y: best.p.y - cLine.n.y * best.time,
      };
      const c1: WEdge = {
        id: nextId++,
        orig: c.orig,
        leftTrace: [...c.leftTrace],
        rightTrace: [foot, best.p],
      };
      const c2: WEdge = {
        id: nextId++,
        orig: c.orig,
        leftTrace: [foot, best.p],
        rightTrace: [...c.rightTrace],
      };

      // walk the ring from b up to c (exclusive) → loop 1; from c to a → loop 2
      const ring1: WEdge[] = [];
      for (let k = (best.i + 1) % m; k !== best.j; k = (k + 1) % m) ring1.push(loop[k]);
      ring1.push(c1);
      const ring2: WEdge[] = [c2];
      for (let k = (best.j + 1) % m; k !== (best.i + 1) % m; k = (k + 1) % m)
        ring2.push(loop[k]);

      loops.splice(best.loop, 1);
      for (const ring of [ring1, ring2]) {
        if (ring.length >= 3) loops.push(ring);
        else
          for (const e of ring) {
            e.leftTrace.push(best.p);
            e.rightTrace.push(best.p);
            dead.push(e);
          }
      }
    }

    if (loops.length === 0) break;
  }

  // Anything still alive never collapsed. Pushing it straight to `dead` left
  // its face TRUNCATED at whatever event it last took part in — measured as a
  // ~3% under-count on an asymmetric L. Close each survivor at the front it
  // actually reached: its two bounding vertices at the final time.
  for (const loop of loops) {
    const m = loop.length;
    for (let k = 0; k < m; k++) {
      const e = loop[k];
      const prev = lines[loop[(k - 1 + m) % m].orig];
      const next = lines[loop[(k + 1) % m].orig];
      const lp = vertexAt(prev, lines[e.orig], t);
      const rp = vertexAt(lines[e.orig], next, t);
      if (lp) e.leftTrace.push(lp);
      if (rp) e.rightTrace.push(rp);
      dead.push(e);
    }
  }

  const faces: SweptFace[] = [];
  for (const e of dead) {
    // swept region: up the left boundary, back down the right
    const ring = [...e.leftTrace, ...[...e.rightTrace].reverse()];
    const cleaned = dedupe(ring);
    if (cleaned.length >= 3) faces.push({ orig: e.orig, polygon: cleaned });
  }
  if (faces.length === 0) return { ok: false, reason: 'Could not build roof faces' };
  return { ok: true, faces };
}

/** Drop repeated/near-identical consecutive points (events coincide often). */
function dedupe(ring: XY[], tol = 0.05): XY[] {
  const out: XY[] = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > tol) out.push(p);
  }
  while (
    out.length > 1 &&
    Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= tol
  )
    out.pop();
  return out;
}
