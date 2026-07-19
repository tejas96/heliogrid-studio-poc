// ─── Leg-plan editing decisions (Phase 22m) ─────────────────────────────────
// Every decision the Legs (2D) editor makes lives here as a pure function, so
// the component renders and dispatches but decides nothing. Same split as
// lib/structure-view and lib/bom/view — and here it earns its keep twice over,
// because the gate demands that a KEYBOARD action and a MOUSE action produce
// an identical patch. They can only be identical if they call the same
// function, which is exactly what this module is.
//
// The frame is `segmentFrameAngle` (22i/E3). Points live in the segment's own
// local frame, so a rotated table's legs stay square to its panels. Deriving a
// second frame here is the bug farm the plan warns about.
import type { ArraySegment, PanelSpec, PlacedPanel, Project, Roof, XY } from '../types';
import { insetPolygonRobust, pointInPolygon, rotate } from './geo';
import { segmentFrameAngle } from './segment-ops';
import { panelFootprintM } from './layout';

/** Coarse nudge = the editor's visible grid; fine = Shift. */
export const NUDGE_M = 0.25;
export const NUDGE_FINE_M = 0.05;

export type LegPlanResult =
  | { ok: true; patch: { segments: ArraySegment[] }; announce: string }
  | { ok: false; reason: string };

/** The buildable region: the roof minus its setbacks — same inset the fill uses. */
export function buildableRegion(roof: Roof): XY[] {
  return (
    insetPolygonRobust(
      roof.polygon,
      roof.perEdgeSetbacksM ?? roof.polygon.map(() => roof.setbackM),
    )[0] ?? roof.polygon
  );
}

/**
 * E4: a leg must land inside the roof's buildable region.
 *
 * Checked in WORLD space against the inset polygon, not against the run
 * bounds — a point can sit happily on the run axis and still be over the
 * parapet. Rejection carries a reason, because a control that silently
 * refuses is indistinguishable from one that is broken.
 */
export function validateLegPoint(local: XY, roof: Roof, frameAngle: number): LegPlanResult | null {
  const world = rotate(local, frameAngle);
  if (!pointInPolygon(world, buildableRegion(roof))) {
    return {
      ok: false,
      reason: 'Outside the roof setback — a leg has to land on buildable roof.',
    };
  }
  return null;
}

function withPoints(
  project: Project,
  seg: ArraySegment,
  points: XY[],
  announce: string,
): LegPlanResult {
  const next: ArraySegment =
    points.length > 0
      ? { ...seg, legPlan: { points } }
      : // an empty plan is not "a plan supporting nothing" — it is AUTO. The
        // key is removed so the segment serialises as if never planned (22i).
        (() => {
          const { legPlan: _drop, ...rest } = seg;
          return rest as ArraySegment;
        })();
  return {
    ok: true,
    patch: { segments: project.segments.map((s) => (s.id === seg.id ? next : s)) },
    announce,
  };
}

/** Points the plan currently holds — empty when it is on AUTO. */
export function planPoints(seg: ArraySegment): XY[] {
  return seg.legPlan?.points ?? [];
}

/**
 * The AUTO stations, in local frame, so switching to CUSTOM starts from what
 * the user can already see rather than from an empty roof.
 */
export function autoSeedPoints(
  roof: Roof,
  seg: ArraySegment,
  panels: PlacedPanel[],
  legSpacingM: number,
  spec: PanelSpec,
): XY[] {
  const mine = panels.filter((p) => p.enabled && p.segmentId === seg.id);
  if (mine.length === 0) return [];
  const angle = segmentFrameAngle(roof, seg, mine);
  const locals = mine.map((p) => rotate(p.center, -angle));
  const xs = locals.map((l) => l.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const y = locals.reduce((s, l) => s + l.y, 0) / locals.length;

  // Mirror buildStructure's AUTO exactly: the run is the panel FOOTPRINT, not
  // the span between panel CENTRES, and stations divide that run. Seeding from
  // the centre span put the end legs half a module inboard, so the first
  // hand-placed leg made every other leg jump — the user would reasonably read
  // that as the editor having lost their table.
  const { w } = panelFootprintM(spec, seg.orientation);
  const runLen = mine.length * w + (mine.length - 1) * seg.moduleGapM;
  const midX = (lo + hi) / 2;
  const bays = Math.max(1, Math.ceil(runLen / Math.max(0.1, legSpacingM)));
  const stations = bays + 1;
  return Array.from({ length: stations }, (_, i) => ({
    x: +(midX + (i / bays) * runLen - runLen / 2).toFixed(3),
    y: +y.toFixed(3),
  }));
}

export function addLeg(
  project: Project,
  roof: Roof,
  seg: ArraySegment,
  panels: PlacedPanel[],
  local: XY,
  legSpacingM: number,
  spec: PanelSpec,
): LegPlanResult {
  const angle = segmentFrameAngle(roof, seg, panels);
  const bad = validateLegPoint(local, roof, angle);
  if (bad) return bad;
  // The first hand-placed leg converts the table from AUTO to CUSTOM. Seeding
  // from the automatic stations means the user adds to what they were looking
  // at instead of watching every other leg vanish.
  const base = seg.legPlan
    ? planPoints(seg)
    : autoSeedPoints(roof, seg, panels, legSpacingM, spec);
  const pts = [...base, { x: +local.x.toFixed(3), y: +local.y.toFixed(3) }];
  return withPoints(project, seg, pts, `Leg added. ${pts.length} legs on this table.`);
}

export function removeLeg(
  project: Project,
  seg: ArraySegment,
  index: number,
): LegPlanResult {
  const pts = planPoints(seg);
  if (index < 0 || index >= pts.length) return { ok: false, reason: 'No leg selected.' };
  const next = pts.filter((_, i) => i !== index);
  return withPoints(
    project,
    seg,
    next,
    next.length > 0
      ? `Leg removed. ${next.length} legs on this table.`
      : 'Last leg removed — this table is back to automatic spacing.',
  );
}

/**
 * Move one leg by a delta in the LOCAL frame.
 *
 * Drag and arrow-key both come through here, which is what makes "every mouse
 * action has a keyboard equivalent producing an identical patch" true by
 * construction rather than by two implementations agreeing.
 */
export function moveLeg(
  project: Project,
  roof: Roof,
  seg: ArraySegment,
  panels: PlacedPanel[],
  index: number,
  delta: XY,
): LegPlanResult {
  const pts = planPoints(seg);
  if (index < 0 || index >= pts.length) return { ok: false, reason: 'No leg selected.' };
  const moved = { x: +(pts[index].x + delta.x).toFixed(3), y: +(pts[index].y + delta.y).toFixed(3) };
  const angle = segmentFrameAngle(roof, seg, panels);
  const bad = validateLegPoint(moved, roof, angle);
  if (bad) return bad;
  const next = pts.map((p, i) => (i === index ? moved : p));
  return withPoints(project, seg, next, `Leg moved to ${moved.x.toFixed(2)} m along the table.`);
}

/** Drop the plan entirely — the table goes back to automatic spacing. */
export function resetToAuto(project: Project, seg: ArraySegment): LegPlanResult {
  return withPoints(project, seg, [], 'Leg plan cleared — automatic spacing restored.');
}

/** AUTO or CUSTOM, for the badge. */
export function planMode(seg: ArraySegment): 'auto' | 'custom' {
  return seg.legPlan ? 'custom' : 'auto';
}

/** Arrow-key delta in the local frame. Shift = fine. */
export function nudgeFor(key: string, shift: boolean): XY | null {
  const d = shift ? NUDGE_FINE_M : NUDGE_M;
  switch (key) {
    case 'ArrowLeft':
      return { x: -d, y: 0 };
    case 'ArrowRight':
      return { x: d, y: 0 };
    case 'ArrowUp':
      return { x: 0, y: d };
    case 'ArrowDown':
      return { x: 0, y: -d };
    default:
      return null;
  }
}
