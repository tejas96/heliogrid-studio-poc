// ─── Panel grouping: what may legally share a series string ─────────────────
// Modules in series carry ONE current — the weakest module throttles the whole
// string. So series-connecting modules that will never agree is a design error,
// not a preference:
//   · different ORIENTATION → their peaks happen at different hours; the string
//     tracks one MPP and both ends lose;
//   · different TILT → same problem, seasonally;
//   · different ROOF PLANE → the array can't be wired that way without absurd
//     cable, and separate planes usually differ in orientation anyway. NOTE:
//     "plane", not "Roof object" — this app models one pitched roof surface as
//     several adjacent Roof polygons (the straight-skeleton wavefront emits two
//     co-planar faces for one wall after a split), and those are physically ONE
//     surface. See `computePlaneIds`.
//   · different SHADE exposure → a shaded module drags its whole string down
//     for as long as the shadow sits on it.
//
// The old engine sorted EVERY enabled panel by a global Y coordinate and cut
// the list into strings (audit finding 7), so a south-facing roof and a
// west-facing roof could land in the same string. This module makes the legal
// partition explicit; autostring then works strictly inside one group.
import type { PlacedPanel, Project, Roof } from '../../types';
import { collinearOverlap } from '../geo';
import { roofGridAngle } from '../layout';

/**
 * Shade tiers use the SAME thresholds as the access tint on the modules in the
 * 3D view (>0.95 clear, >0.85 light, else heavy). Reusing them means the
 * grouping a user can SEE (green/amber/red modules) is the grouping the
 * stringer actually applies — no hidden second definition of "shaded".
 */
export type ShadeTier = 'clear' | 'light' | 'heavy';

export function shadeTierOf(solarAccess: number | undefined): ShadeTier {
  const a = solarAccess ?? 1;
  return a > 0.95 ? 'clear' : a > 0.85 ? 'light' : 'heavy';
}

export interface PanelGroup {
  /** stable, deterministic identity — never a random id */
  key: string;
  /**
   * Identity of the physical roof PLANE this group sits on (see
   * `computePlaneIds`). This — not `roofId` — is what constrains stringing.
   */
  planeId: string;
  /**
   * Representative roof of the group. A group may span several co-planar Roof
   * polygons; `orderGroup` walks the real per-panel roofIds, so this is only a
   * label / a hint for the single-face fast path.
   */
  roofId: string;
  /** representative orientation of the group (degrees, 0 = N) */
  azimuthDeg: number;
  tiltDeg: number;
  shadeTier: ShadeTier;
  panels: PlacedPanel[];
}

/** Tolerances: within these, modules track closely enough to share a string. */
export const AZIMUTH_TOL_DEG = 5;
export const TILT_TOL_DEG = 3;

/**
 * Bucket an angle to a tolerance band. Bucketing (rather than clustering) keeps
 * the result DETERMINISTIC and order-independent: the same project always
 * yields the same groups, which is what makes auto-stringing reproducible.
 * The cost is a hard edge — two panels 5.1° apart across a boundary split —
 * which is acceptable because real arrays are built from discrete segments
 * whose panels share an exact azimuth.
 */
function bucket(deg: number, tol: number): number {
  const size = tol * 2;
  return Math.round(deg / size) * size;
}

/**
 * Bucket a COMPASS angle. Same as `bucket`, but the result is normalised back
 * into [0, 360) so the wrap point is not a false boundary: 359° and 1° are 2°
 * apart on the compass and must land in one bucket, where plain arithmetic
 * reads them as 358° apart and splits a single north-facing plane into two
 * groups (and, downstream, two half-length strings).
 */
function bucketAzimuth(deg: number, tol: number): number {
  const size = tol * 2;
  const wrapped = ((deg % 360) + 360) % 360;
  return (Math.round(wrapped / size) * size) % 360;
}

/** Smallest absolute difference between two compass angles (0–180). */
function angleDeltaDeg(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

// ─── Plane identity ─────────────────────────────────────────────────────────
// Tolerances for deciding that two Roof polygons describe the SAME surface.
// Tighter than the panel tolerances above on purpose: these compare authored /
// generated roof geometry, where co-planar faces agree to float noise, not
// panel poses that legitimately vary a few degrees.
const PLANE_AZ_TOL_DEG = 1;
const PLANE_PITCH_TOL_DEG = 0.5;
const PLANE_HEIGHT_TOL_M = 0.15;

/** Height of the roof's own plane extrapolated to the plan origin. */
function planeDatum(roof: Roof): number {
  const pitch = roof.pitchDeg ?? 0;
  if (pitch < 0.5) return roof.heightM;
  const a = ((roof.slopeAzimuthDeg ?? 180) * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = Math.cos(a);
  const grad = Math.tan((pitch * Math.PI) / 180);
  // surfaceHeightAt(roof, {0,0}) with the roof's own eave: heightM + grad*eave
  const eave = Math.max(...roof.polygon.map((q) => q.x * dx + q.y * dy));
  return roof.heightM + grad * eave;
}

/** Do these two roofs lie on the same infinite plane (not merely parallel)? */
function coplanar(a: Roof, b: Roof): boolean {
  const pa = a.pitchDeg ?? 0;
  const pb = b.pitchDeg ?? 0;
  if (Math.abs(pa - pb) > PLANE_PITCH_TOL_DEG) return false;
  // a flat roof has no meaningful azimuth — only its height distinguishes it
  const bothFlat = pa < 0.5 && pb < 0.5;
  if (
    !bothFlat &&
    angleDeltaDeg(a.slopeAzimuthDeg ?? 180, b.slopeAzimuthDeg ?? 180) > PLANE_AZ_TOL_DEG
  ) {
    return false;
  }
  return Math.abs(planeDatum(a) - planeDatum(b)) <= PLANE_HEIGHT_TOL_M;
}

/** Do two roofs share a wall edge (any collinear overlap)? */
function roofsAdjacent(a: Roof, b: Roof): boolean {
  for (let i = 0; i < a.polygon.length; i++) {
    const a1 = a.polygon[i];
    const a2 = a.polygon[(i + 1) % a.polygon.length];
    for (let j = 0; j < b.polygon.length; j++) {
      const b1 = b.polygon[j];
      const b2 = b.polygon[(j + 1) % b.polygon.length];
      if (collinearOverlap(a1, a2, b1, b2, 0.1)) return true;
    }
  }
  return false;
}

/**
 * Map every roof id to the identity of the PHYSICAL PLANE it belongs to.
 *
 * WHY THIS EXISTS: grouping used to key on `roofId`, which is wrong here
 * because a pitched roof is modelled as several adjacent Roof objects. The
 * straight-skeleton wavefront legitimately emits TWO co-planar faces for one
 * wall after a split — identical pitch and azimuth, one physical plane (a real
 * L-shape produced 7 faces from 6 walls for exactly that reason). Keyed on
 * roofId those faces could never share a string, so a 6–8 face roof fragmented
 * into 6–8 groups, each shedding its own sub-minimum tail: orphaned panels,
 * extra strings and an inflated MPPT / inverter / combiner count in the BOM.
 *
 * A plane is defined by (bucketed azimuth, pitch, plane datum) — the datum
 * being the surface height extrapolated to the plan origin, which is what
 * separates two parallel-but-stepped surfaces from one continuous one. Azimuth
 * and pitch alone are NOT enough: they describe an orientation, not a plane.
 *
 * CROSS-BUILDING DECISION: two faces that are co-planar but NOT connected by a
 * shared wall edge stay SEPARATE. Merging on plane maths alone would fuse the
 * matching roofs of two neighbouring identical houses — or two detached wings —
 * into one group, and a string planned across them understates its cable run,
 * its voltage drop and its conduit. So plane identity is the CONNECTED
 * component of (co-planar AND edge-adjacent) roofs: physically one continuous
 * walkable surface, which is exactly the condition under which a series string
 * may run from one polygon to the next. This mirrors the adjacency rule
 * `computeEaveRefs` in roof-plane.ts already uses to give a split slope one
 * shared eave line.
 *
 * Component id = the smallest roof id in the component, so the result is
 * deterministic and independent of the roof array's order.
 */
export function computePlaneIds(roofs: Roof[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) {
      const next = parent.get(x)!;
      parent.set(x, r);
      x = next;
    }
    return r;
  };
  for (const r of roofs) parent.set(r.id, r.id);
  for (let i = 0; i < roofs.length; i++) {
    for (let j = i + 1; j < roofs.length; j++) {
      const a = roofs[i];
      const b = roofs[j];
      if (!coplanar(a, b) || !roofsAdjacent(a, b)) continue;
      const ra = find(a.id);
      const rb = find(b.id);
      if (ra === rb) continue;
      // union toward the lexicographically smaller root: stable, order-free
      if (ra < rb) parent.set(rb, ra);
      else parent.set(ra, rb);
    }
  }
  const out = new Map<string, string>();
  for (const r of roofs) out.set(r.id, find(r.id));
  return out;
}

/**
 * Partition a project's ENABLED panels into groups that may each be strung
 * independently. Disabled panels are excluded: they generate nothing and must
 * never occupy a string.
 */
export function groupPanels(project: Project): PanelGroup[] {
  const enabled = project.panels.filter((p) => p.enabled);
  // MLPE (per-module optimisers): every module tracks its own MPP, so the four
  // electrical reasons to split above simply do not apply — orientation, tilt
  // and shade stop constraining what may share a string. One group therefore
  // spans the whole array (including the separate faces of a hip roof, which is
  // exactly the case plain string wiring strands). The physical cable distance
  // is not gated here — the router prices the real runs.
  if ((project.components?.mlpe ?? 'none') === 'optimizer' && enabled.length > 0) {
    const first = enabled[0];
    return [
      {
        key: 'mlpe|all',
        planeId: 'mlpe|all',
        roofId: first.roofId,
        azimuthDeg: first.azimuthDeg,
        tiltDeg: first.tiltDeg,
        shadeTier: 'clear',
        panels: enabled,
      },
    ];
  }
  const planeIds = computePlaneIds(project.roofs ?? []);
  const byKey = new Map<string, PanelGroup>();
  for (const p of project.panels) {
    if (!p.enabled) continue;
    // A panel whose roof is not in the project (legacy / hand-authored data)
    // has no geometry to prove co-planarity with anything, so it keeps its own
    // plane: unknown stays isolated rather than being merged on faith.
    const planeId = planeIds.get(p.roofId) ?? p.roofId;
    const az = bucketAzimuth(p.azimuthDeg, AZIMUTH_TOL_DEG);
    const tilt = bucket(p.tiltDeg, TILT_TOL_DEG);
    const tier = shadeTierOf(p.solarAccess);
    const key = `${planeId}|az${az}|t${tilt}|${tier}`;
    const g = byKey.get(key);
    if (g) g.panels.push(p);
    else
      byKey.set(key, {
        key,
        planeId,
        roofId: p.roofId,
        azimuthDeg: az,
        tiltDeg: tilt,
        shadeTier: tier,
        panels: [p],
      });
  }
  // deterministic order: biggest groups first (they get the MPPT slots they
  // need before leftovers), ties broken by key so runs are reproducible
  return [...byKey.values()].sort(
    (a, b) => b.panels.length - a.panels.length || a.key.localeCompare(b.key),
  );
}

/**
 * Serpentine order WITHIN a group: row-major, alternating direction, so the
 * string's cable run follows the array instead of jumping across the building.
 *
 * The frame matters and there is only ONE right answer: the ROOF GRID
 * (`roofGridAngle`) — the frame `autoFillRoof` placed the panels in. Rows are
 * straight lines in that frame and nowhere else. Reasoning about the array in
 * any other frame is audit finding 11 all over again (Phase 3 unified this for
 * DRC/render/SLD): on a roof rotated even ~1° from the plan axes, a 50 m row
 * drifts ~0.7 m in plan-y, which is MORE than the row-clustering tolerance —
 * so rows fragment, interleave, and the walk hops the length of the roof
 * (measured: a 31.9 m jump between two "consecutive" modules of one string).
 */
/**
 * Serpentine a group that may SPAN ROOFS (the MLPE mega-group). Panels are
 * walked face-by-face — each roof's own grid frame, its own serpentine — and
 * the faces concatenated in a deterministic order. Without this a single grid
 * angle would be applied to every face and the "rows" of a hip roof would
 * interleave into a cable path that hops between planes (audit finding 11's
 * failure mode). A single-roof group behaves exactly as serpentine() does.
 */
export function orderGroup(group: PanelGroup, roofs: Roof[]): PlacedPanel[] {
  const byRoof = new Map<string, PlacedPanel[]>();
  for (const p of group.panels) {
    const list = byRoof.get(p.roofId);
    if (list) list.push(p);
    else byRoof.set(p.roofId, [p]);
  }
  if (byRoof.size <= 1) {
    return serpentine(group, roofs.find((r) => r.id === group.roofId));
  }
  // deterministic face order: the project's own roof order, then any stragglers
  const ids = [
    ...roofs.map((r) => r.id).filter((id) => byRoof.has(id)),
    ...[...byRoof.keys()].filter((id) => !roofs.some((r) => r.id === id)),
  ];
  const out: PlacedPanel[] = [];
  for (const id of ids) {
    const panels = byRoof.get(id)!;
    out.push(...serpentine({ ...group, roofId: id, panels }, roofs.find((r) => r.id === id)));
  }
  return out;
}

export function serpentine(group: PanelGroup, roof?: Roof): PlacedPanel[] {
  // fall back to the group's azimuth only when the roof is unavailable (the
  // legacy autoString shim); every real caller passes the roof
  const deg = roof ? roofGridAngle(roof) : group.azimuthDeg;
  const rad = (-deg * Math.PI) / 180; // rotate INTO the grid frame (fill uses -angle)
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // u runs along a row, v steps between rows
  const proj = group.panels.map((p) => ({
    p,
    u: p.center.x * cos - p.center.y * sin,
    v: p.center.x * sin + p.center.y * cos,
  }));
  // 0.5 m cleanly separates real rows (pitch ≥ ~1.2 m) while absorbing float drift
  const ROW_TOL_M = 0.5;
  const sortedV = [...proj].sort((a, b) => a.v - b.v);
  const rows: (typeof proj)[] = [];
  for (const item of sortedV) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].v - item.v) <= ROW_TOL_M) row.push(item);
    else rows.push([item]);
  }
  const out: PlacedPanel[] = [];
  rows.forEach((row, i) => {
    row.sort((a, b) => (i % 2 === 0 ? a.u - b.u : b.u - a.u));
    out.push(...row.map((x) => x.p));
  });
  return out;
}
