// ─── Cable routing: the length you actually buy ─────────────────────────────
// Cable is sold by the metre along a path that exists on a roof. The old
// estimator never had a path: it summed every module-to-module distance, added
// a flat 15 m per string, doubled the lot, floored it at 30 m, and printed
// "(+15% slack incl.)" on the quote — a slack it never applied (audit finding
// 6). This module replaces the guess with geometry.
//
// What is actually bought, and what is not:
//   · module → module inside a row: NOTHING. Modules ship with leads long
//     enough to reach their neighbour. Charging for those links is the single
//     biggest reason the old number ran high.
//   · a hop LONGER than the leads reach (row to row, across a roof gap): the
//     excess, and only the excess.
//   · the two HOME RUNS from a string's two ends back to the DCDB/inverter —
//     positive and negative. This is the bulk of a real DC bill of quantity.
//   · plus the vertical drop to the inverter, and installation slack.
//
// ENGINEER VALIDATION REQUIRED (plan §7): lead reach, slack and the drop are
// installation practice, not physics — they live in data/rules so they can be
// argued with per market (see CableRules).
import type {
  CableRoute,
  PanelSpec,
  Project,
  Roof,
  StringDef,
  ValidationIssue,
  XY,
} from '../types';
import { pointInPolygon, polygonCentroid } from './geo';
import { roofGridAngle } from './layout';
import { resolveCapabilities } from './capabilities';
import { resolveRules } from '../data/rules/india';

/**
 * How far a run drops vertically, FROM THE MODEL — not a constant.
 *   DC: array plane (roof height) down the wall to the inverter.
 *   AC: inverter down to the meter at grade.
 * The old flat 3 m under-counted a 7 m roof and over-counted a 3 m one, while
 * `Roof.heightM` and `InverterPlacement.heightM` sat right there (plan §F2:
 * "vertical drops at roof edges (from Roof.heightM)").
 */
export function dropForRunM(project: Project, kind: 'dc' | 'ac'): number {
  const pl = project.inverterPlacements[0];
  if (!pl) return resolveRules().cable.defaultVerticalDropM;
  const roofH = project.roofs.find((r) => r.id === pl.roofId)?.heightM ?? 0;
  const invH = pl.heightM;
  return kind === 'dc' ? Math.max(0, roofH - invH) : Math.max(0, invH);
}

/** World position of a wall-mounted inverter, in the plan frame. */
export function inverterWorldPos(project: Project, placementIndex = 0): XY | null {
  const pl = project.inverterPlacements[placementIndex] ?? project.inverterPlacements[0];
  if (!pl) return null;
  const roof = project.roofs.find((r) => r.id === pl.roofId);
  if (!roof || roof.polygon.length < 2) return null;
  const a = roof.polygon[pl.edgeIndex % roof.polygon.length];
  const b = roof.polygon[(pl.edgeIndex + 1) % roof.polygon.length];
  return { x: a.x + (b.x - a.x) * pl.t, y: a.y + (b.y - a.y) * pl.t };
}

/** Plan-frame length of a polyline (m). */
export function polylineLengthM(pts: XY[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return total;
}

/** Total conductor metres for a route: path + drop, plus slack. */
export function routeLengthM(route: CableRoute): number {
  return (polylineLengthM(route.waypoints) + route.verticalDropM) * (1 + route.slackPct);
}

/**
 * Footprints a cable may not cross: objects that must stay clear (a chimney's
 * flue, a hatch that must open). Bridgeable obstructions are NOT blockers —
 * cable runs under a raised array happily.
 */
export function routeBlockers(project: Project, roof: Roof): XY[][] {
  const out: XY[][] = [];
  for (const o of project.obstructions) {
    if (o.roofId !== roof.id) continue;
    if (!resolveCapabilities(o).mustRemainOpenToSky) continue;
    const r = o.shape === 'circle' ? o.diameterM / 2 : Math.max(o.lengthM, o.widthM) / 2;
    out.push([
      { x: o.center.x - r, y: o.center.y - r },
      { x: o.center.x + r, y: o.center.y - r },
      { x: o.center.x + r, y: o.center.y + r },
      { x: o.center.x - r, y: o.center.y + r },
    ]);
  }
  for (const k of project.keepouts ?? []) {
    if (k.roofId === roof.id && k.shape.length >= 3) out.push(k.shape);
  }
  return out;
}

function blocked(p: XY, blockers: XY[][]): boolean {
  return blockers.some((b) => pointInPolygon(p, b));
}

/**
 * A path from `from` to `to` that avoids `blockers`.
 *
 * Straight line first — the overwhelmingly common case on a clear roof, and
 * exact. Otherwise a shortest path over a VISIBILITY GRAPH of the blockers'
 * padded corners. A grid A* would quantise the length (you would quote cable to
 * the cell size) and cost far more for the handful of convex obstacles a roof
 * actually has; corner-to-corner visibility gives the true shortest polyline.
 *
 * Single-corner detours are NOT enough and the first version was wrong to try:
 * a box straddling the direct line needs to be rounded — two corners at least —
 * so every one-corner candidate got rejected and it fell back to a straight
 * line THROUGH the obstacle. Silently.
 */
/** A run cable can follow cheaply: a roof edge, an array aisle, a tray. */
export interface Corridor {
  pts: XY[];
  /** true = a ring (last joins first), e.g. a perimeter */
  closed?: boolean;
}

export function routePath(
  from: XY,
  to: XY,
  blockers: XY[][],
  /** preferred runs; omit for a bare shortest path */
  corridors?: Corridor[],
  /** array footprint a run must not be dragged across (module glass) */
  footprint?: XY[],
): XY[] {
  const rules = resolveRules().cable;
  const direct = !segmentHitsAny(from, to, blockers);
  // No corridor to follow ⇒ the straight line IS the answer when it is clear.
  if (!corridors || corridors.length === 0) {
    if (blockers.length === 0 || direct) return [from, to];
  }

  const PAD = 0.4; // keep the run off the object itself
  const nodes: XY[] = [from, to];
  // which corridor each node belongs to, and where along it (-1 = free node)
  const cPoly: number[] = [-1, -1];
  const cVert: number[] = [-1, -1];
  for (const b of blockers) {
    const c = polygonCentroid(b);
    for (const v of b) {
      const dx = v.x - c.x;
      const dy = v.y - c.y;
      const m = Math.hypot(dx, dy) || 1;
      const corner = { x: v.x + (dx / m) * PAD, y: v.y + (dy / m) * PAD };
      if (!blocked(corner, blockers)) {
        nodes.push(corner);
        cPoly.push(-1);
        cVert.push(-1);
      }
    }
  }
  (corridors ?? []).forEach((c, ci) => {
    c.pts.forEach((v, vi) => {
      if (blocked(v, blockers)) return;
      nodes.push(v);
      cPoly.push(ci);
      cVert.push(vi);
    });
  });

  const n = nodes.length;
  /** consecutive vertices of the SAME corridor = a real run: no penalty */
  const isCorridorEdge = (i: number, j: number) => {
    if (cPoly[i] < 0 || cPoly[i] !== cPoly[j]) return false;
    const c = corridors![cPoly[i]];
    const len = c.pts.length;
    const d = Math.abs(cVert[i] - cVert[j]);
    return d === 1 || (!!c.closed && len > 2 && d === len - 1);
  };

  const adj: Array<Array<{ to: number; w: number }>> = nodes.map(() => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (segmentHitsAny(nodes[i], nodes[j], blockers)) continue;
      const len = Math.hypot(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y);
      // WEIGHT ≠ LENGTH: the penalty steers the path, it never inflates the
      // metres quoted (those are re-measured from the returned polyline).
      // Corridor runs (aisles, the array ring, the perimeter) are free; every
      // other edge pays the penalty ONLY for the metres it actually drags
      // across the array field — a short connector along a row barely touches
      // it, a diagonal to a far inverter crosses most of it.
      let w = len;
      if (!isCorridorEdge(i, j)) {
        const crossM = footprint
          ? crossingLengthM(nodes[i], nodes[j], footprint)
          : len; // no footprint ⇒ treat the whole edge as field (legacy)
        w = len + crossM * (rules.crossFieldPenalty - 1);
      }
      adj[i].push({ to: j, w });
      adj[j].push({ to: i, w });
    }
  }

  const dist = new Array(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const seen = new Array(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!seen[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity || u === 1) break;
    seen[u] = true;
    for (const e of adj[u]) {
      if (dist[u] + e.w < dist[e.to]) {
        dist[e.to] = dist[u] + e.w;
        prev[e.to] = u;
      }
    }
  }
  if (dist[1] === Infinity) return [from, to]; // fully enclosed: say so honestly
  const path: XY[] = [];
  for (let at = 1; at !== -1; at = prev[at]) path.unshift(nodes[at]);
  return dedupeCollinear(path);
}

/** Drop points that add nothing: three collinear waypoints are one run. */
function dedupeCollinear(pts: XY[]): XY[] {
  if (pts.length < 3) return pts;
  const out: XY[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > 1e-3) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** The roof-edge corridor a run should prefer: the polygon, pulled inboard. */
export function roofCorridor(roof: Roof): Corridor {
  const inset = resolveRules().cable.corridorInsetM;
  const c = polygonCentroid(roof.polygon);
  return {
    closed: true,
    pts: roof.polygon.map((v) => {
      const dx = c.x - v.x;
      const dy = c.y - v.y;
      const m = Math.hypot(dx, dy) || 1;
      return { x: v.x + (dx / m) * inset, y: v.y + (dy / m) * inset };
    }),
  };
}

/**
 * The corridors INSIDE an array: cable leaves a module along its own ROW (the
 * rail run), reaches the array's edge, and only then crosses to the perimeter.
 *
 * Without these the perimeter alone never wins: a short diagonal beats any
 * detour, so every run came out as a straight line across live modules
 * (measured: 26/26 routes straight, 21.9 m direct ⇒ weighted 39.5 vs a longer
 * perimeter loop). Penalising the rail leg identically to crossing the field
 * was the modelling error — not the penalty's size.
 *
 * Rows are found in the ROOF GRID frame, the frame the fill placed them in
 * (audit finding 11 — the same trap the shading serpentine fell into).
 */
export function arrayCorridors(project: Project, roof: Roof): Corridor[] {
  const mine = project.panels.filter((p) => p.enabled && p.roofId === roof.id);
  if (mine.length < 2) return [];
  const rad = (-roofGridAngle(roof) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const toGrid = (q: XY) => ({ u: q.x * cos - q.y * sin, v: q.x * sin + q.y * cos });
  const toPlan = (u: number, v: number) => ({
    x: u * cos + v * sin,
    y: -u * sin + v * cos,
  });
  const proj = mine.map((p) => ({ ...toGrid(p.center) }));

  // cluster rows on v (same 0.5 m tolerance the stringer uses)
  const sorted = [...proj].sort((a, b) => a.v - b.v);
  const rows: Array<typeof proj> = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].v - it.v) <= 0.5) row.push(it);
    else rows.push([it]);
  }

  const out: Corridor[] = [];
  const us: number[] = [];
  const vs: number[] = [];
  for (const row of rows) {
    const uMin = Math.min(...row.map((r) => r.u));
    const uMax = Math.max(...row.map((r) => r.u));
    const v = row[0].v;
    us.push(uMin, uMax);
    vs.push(v);
    if (uMax - uMin > 0.5) out.push({ pts: [toPlan(uMin, v), toPlan(uMax, v)] });
  }
  // the ring around the array: how a run crosses between rows without walking
  // over modules
  const u0 = Math.min(...us);
  const u1 = Math.max(...us);
  const v0 = Math.min(...vs);
  const v1 = Math.max(...vs);
  out.push({
    closed: true,
    pts: [toPlan(u0, v0), toPlan(u1, v0), toPlan(u1, v1), toPlan(u0, v1)],
  });
  return out;
}

/**
 * The array's footprint polygon — the region cable must NOT be dragged across
 * (that is running a conductor over module glass, which is not done). Returned
 * with a small outward margin so a run hugging the array edge is not counted as
 * crossing it.
 */
export function arrayFootprint(project: Project, roof: Roof): XY[] {
  const mine = project.panels.filter((p) => p.enabled && p.roofId === roof.id);
  if (mine.length < 3) return [];
  const rad = (-roofGridAngle(roof) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const gs = mine.map((p) => ({ u: p.center.x * cos - p.center.y * sin, v: p.center.x * sin + p.center.y * cos }));
  const M = 0.6; // margin (m): edge-hugging runs don't read as crossing
  const u0 = Math.min(...gs.map((g) => g.u)) - M;
  const u1 = Math.max(...gs.map((g) => g.u)) + M;
  const v0 = Math.min(...gs.map((g) => g.v)) - M;
  const v1 = Math.max(...gs.map((g) => g.v)) + M;
  return [
    { x: u0 * cos + v0 * sin, y: -u0 * sin + v0 * cos },
    { x: u1 * cos + v0 * sin, y: -u1 * sin + v0 * cos },
    { x: u1 * cos + v1 * sin, y: -u1 * sin + v1 * cos },
    { x: u0 * cos + v1 * sin, y: -u0 * sin + v1 * cos },
  ];
}

/** Length of segment a→b that lies inside `poly` (sampled — exact enough here). */
function crossingLengthM(a: XY, b: XY, poly: XY[]): number {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0 || poly.length < 3) return 0;
  const steps = Math.max(2, Math.ceil(len / 0.4));
  let inside = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (pointInPolygon(q, poly)) inside += len / steps;
  }
  return inside;
}

function segmentHitsAny(a: XY, b: XY, blockers: XY[][]): boolean {
  // sample the segment: exact enough at rooftop scale and far simpler than
  // polygon clipping, which we would only be re-deriving here
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(2, Math.ceil(len / 0.25));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (blocked({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, blockers)) return true;
  }
  return false;
}

/**
 * Extra cable needed INSIDE a string: only the hops whose distance exceeds what
 * the modules' own leads reach. On a tidy row this is zero.
 */
export function intraStringExtraM(s: StringDef, project: Project): number {
  const byId = new Map(project.panels.map((p) => [p.id, p]));
  const reach = resolveRules().cable.moduleLeadReachM;
  let extra = 0;
  for (let i = 1; i < s.panelIds.length; i++) {
    const a = byId.get(s.panelIds[i - 1]);
    const b = byId.get(s.panelIds[i]);
    if (!a || !b) continue;
    const d = Math.hypot(b.center.x - a.center.x, b.center.y - a.center.y);
    if (d > reach) extra += d - reach;
  }
  return extra;
}

/**
 * Route every string's two home runs to the inverter. Pure: returns what the
 * routes SHOULD be; the caller commits them. Hand-edited routes are preserved.
 */
export function autoRouteStrings(project: Project): CableRoute[] {
  const rules = resolveRules().cable;
  const target = inverterWorldPos(project);
  const byId = new Map(project.panels.map((p) => [p.id, p]));
  // Keep hand-routed runs — but ONLY while the string they serve still exists.
  // autoStringPlan mints a NEW id per string on every run, so after a re-string
  // a hand-routed run's fromRef points at nothing: it would survive as an
  // ORPHAN, still summed into the cable BOM (measured live: 27 → 28 routes on a
  // second Auto string), while its "the user owns this string" protection
  // silently stopped matching. Re-stringing IS a redesign: the old conductor
  // paths belong to strings that no longer exist, so they go with them.
  const aliveStrings = new Set(project.strings.map((s) => s.id));
  const kept = (project.cableRoutes ?? []).filter(
    (r) => r.manual && r.kind === 'string_homerun' && aliveStrings.has(r.fromRef),
  );
  if (!target) return kept;
  const out: CableRoute[] = [...kept];

  for (const s of project.strings) {
    if (kept.some((r) => r.fromRef === s.id)) continue; // user owns this one
    const ends = [s.panelIds[0], s.panelIds[s.panelIds.length - 1]]
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p);
    if (ends.length === 0) continue;
    const roof = project.roofs.find((r) => r.id === ends[0].roofId);
    const blockers = roof ? routeBlockers(project, roof) : [];
    const corridor = roof ? [roofCorridor(roof), ...arrayCorridors(project, roof)] : undefined;
    const footprint = roof ? arrayFootprint(project, roof) : undefined;
    // a string needs BOTH conductors home: + from one end, − from the other
    ends.forEach((end, i) => {
      out.push({
        id: `${s.id}/hr/${i}`,
        kind: 'string_homerun',
        fromRef: s.id,
        toRef: 'inverter',
        waypoints: routePath(end.center, target, blockers, corridor, footprint),
        verticalDropM: dropForRunM(project, 'dc'),
        slackPct: rules.slackPct,
      });
    });
  }
  return out;
}

/**
 * Route the inverter → meter run. Returns [] when no service entry is placed:
 * the length is then genuinely unknown, and the BOM says so instead of guessing.
 */
export function autoRouteAc(project: Project): CableRoute[] {
  const rules = resolveRules().cable;
  const from = inverterWorldPos(project);
  const to = project.gridConnection?.pos;
  if (!from || !to) return [];
  const kept = (project.cableRoutes ?? []).filter((r) => r.kind === 'inverter_ac' && r.manual);
  if (kept.length > 0) return kept;
  const roof = project.roofs.find((r) => r.id === project.inverterPlacements[0]?.roofId);
  return [
    {
      id: 'ac/main',
      kind: 'inverter_ac',
      fromRef: 'inverter',
      toRef: 'grid',
      waypoints: routePath(from, to, roof ? routeBlockers(project, roof) : []),
      verticalDropM: dropForRunM(project, 'ac'),
      slackPct: rules.slackPct,
    },
  ];
}

/** AC conductor metres: routed when a service entry exists, else null. */
export function acCableFromRoutes(project: Project): { meters: number; routed: boolean } {
  const ac = (project.cableRoutes ?? []).filter((r) => r.kind === 'inverter_ac');
  if (ac.length === 0) return { meters: 0, routed: false };
  return { meters: Math.round(ac.reduce((s, r) => s + routeLengthM(r), 0)), routed: true };
}

/**
 * Voltage drop on each routed DC home run.
 *
 *   Vdrop = 2 · L · I · ρ / A     (2 = out and back on the conductor pair)
 *
 * Reported against the string's Vmp at STC. Long runs on thin cable quietly
 * burn yield the energy model never sees — the plan asked for this check
 * precisely because a routed length finally makes it computable.
 *
 * ENGINEER VALIDATION REQUIRED: the LIMIT is policy (industry ~1–2% DC; the
 * binding figure is whatever the DISCOM/consultant adopts) — see CableRules.
 */
export function routeIssues(project: Project, panel: PanelSpec | null): ValidationIssue[] {
  const rules = resolveRules().cable;
  const routes = (project.cableRoutes ?? []).filter((r) => r.kind === 'string_homerun');
  if (!panel || routes.length === 0) return [];
  const out: ValidationIssue[] = [];
  for (const s of project.strings) {
    const mine = routes.filter((r) => r.fromRef === s.id);
    if (mine.length === 0) continue;
    // the worst conductor of the pair governs the string
    const longest = Math.max(...mine.map((r) => polylineLengthM(r.waypoints) + r.verticalDropM));
    const vDrop =
      (2 * longest * panel.impA * rules.copperResistivity) / Math.max(0.1, rules.dcCableMm2);
    const vString = panel.vmpV * s.panelIds.length;
    const pct = vString > 0 ? (vDrop / vString) * 100 : 0;
    if (pct > rules.maxDcDropPct) {
      out.push({
        level: 'warn',
        code: 'dc_voltage_drop',
        message:
          `${s.name}: ${pct.toFixed(1)}% DC voltage drop over its ${Math.round(longest)} m run ` +
          `(${rules.dcCableMm2} sq.mm Cu) — above the ${rules.maxDcDropPct}% design limit. ` +
          `Shorten the run, move the inverter closer, or size the cable up.`,
        focusPanelIds: s.panelIds,
      });
    }
  }
  return out;
}

/** Total DC conductor metres to buy: home runs + long intra-string hops. */
export function dcCableFromRoutes(project: Project): {
  meters: number;
  homeRunM: number;
  intraM: number;
  /** DUCT metres: the physical path length, counted once however many
   *  conductors share it — conduit is bought per run, not per core */
  ductM: number;
  routed: boolean;
} {
  const routes = (project.cableRoutes ?? []).filter((r) => r.kind === 'string_homerun');
  if (routes.length === 0) return { meters: 0, homeRunM: 0, intraM: 0, ductM: 0, routed: false };
  const slack = 1 + resolveRules().cable.slackPct;
  // Round the PARTS, then sum — never round both independently. The BOM prints
  // the parts in its formula and the sum as the quantity; if they disagree by a
  // metre the line stops being auditable, which is the only thing it is for.
  const homeRunM = Math.round(routes.reduce((sum, r) => sum + routeLengthM(r), 0));
  const intraM = Math.round(
    project.strings.reduce((sum, s) => sum + intraStringExtraM(s, project), 0) * slack,
  );
  // a string's + and − follow the SAME path home, so the duct is the distinct
  // path length — here, one route per conductor pair end, halved
  const ductM = Math.round(
    routes.reduce((sum, r) => sum + polylineLengthM(r.waypoints), 0) / 2,
  );
  return { meters: homeRunM + intraM, homeRunM, intraM, ductM, routed: true };
}
