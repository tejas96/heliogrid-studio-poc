// ─── One selection model for the plan editor and the scene ──────────────────
//
// Selection used to be three different things. The 2D editor had a rectangle
// that collected modules by centre, Shift (or the Add toggle) that added, and
// nothing that subtracted — "all this bay except the four under the AC" was a
// box, then four Shift-taps. Tables had no gesture at all: a tap on a module
// was one module, and "set these three tables to 12°" could not be said in
// plan view. And the 3D box hard-coded `additive: true` into a bridge that
// TOGGLED, so a second identical box silently deselected the whole block.
//
// Everything below is pure and shared. A gesture yields a REGION (box or
// lasso) or a TAP, the target says whether modules or whole tables are meant,
// and the mode says what to do with the result: replace, add or subtract.
// Add and subtract are idempotent — the same region twice is the same
// selection — so no view can drift into toggling again.
import type { PlacedPanel, XY } from '../types';
import { pointInPolygon } from './geo';

export type SelectMode = 'replace' | 'add' | 'subtract';
export type SelectTarget = 'panels' | 'tables';
export type SelectRegion = { kind: 'box'; a: XY; b: XY } | { kind: 'lasso'; points: XY[] };

/** A click that has travelled less than this, in plan metres, is a tap on empty canvas. */
const REGION_MIN_M = 0.3;
/** A lasso keeps a new point only after this much travel — enough to draw, few enough to test. */
const LASSO_STEP_M = 0.15;

/** Every module of the table `id` sits in — or just `id` when it is loose. */
export function tableOf(panels: readonly PlacedPanel[], id: string): string[] {
  const me = panels.find((p) => p.id === id);
  if (!me?.segmentId) return me ? [id] : [];
  const seg = me.segmentId;
  return panels.filter((p) => p.segmentId === seg).map((p) => p.id);
}

/** Widen a set of module ids to every module of every table any of them sits in. */
function wholeTables(panels: readonly PlacedPanel[], ids: readonly string[]): string[] {
  const want = new Set(ids);
  const segs = new Set<string>();
  for (const p of panels) if (want.has(p.id) && p.segmentId) segs.add(p.segmentId);
  const out = new Set(ids);
  for (const p of panels) if (p.segmentId && segs.has(p.segmentId)) out.add(p.id);
  return [...out];
}

function inRegion(c: XY, region: SelectRegion): boolean {
  if (region.kind === 'box') {
    return (
      c.x >= Math.min(region.a.x, region.b.x) &&
      c.x <= Math.max(region.a.x, region.b.x) &&
      c.y >= Math.min(region.a.y, region.b.y) &&
      c.y <= Math.max(region.a.y, region.b.y)
    );
  }
  return region.points.length >= 3 && pointInPolygon(c, region.points);
}

/**
 * Modules whose centre lies inside the region. With target 'tables', every
 * module of each table the region touched — a lasso that clips one corner of
 * a table takes the table.
 */
export function panelsInRegion(
  panels: readonly PlacedPanel[],
  region: SelectRegion,
  target: SelectTarget = 'panels',
): string[] {
  const inside = panels.filter((p) => inRegion(p.center, region)).map((p) => p.id);
  return target === 'tables' ? wholeTables(panels, inside) : inside;
}

/** True when the region is too small to mean anything but a tap on empty canvas. */
export function regionIsTap(region: SelectRegion): boolean {
  if (region.kind === 'box') {
    return Math.abs(region.b.x - region.a.x) < REGION_MIN_M && Math.abs(region.b.y - region.a.y) < REGION_MIN_M;
  }
  return region.points.length < 3;
}

/** A lasso grows only when the pointer has travelled: no thousand-point polygons. */
export function extendLasso(points: XY[], m: XY, minStepM = LASSO_STEP_M): XY[] {
  const last = points[points.length - 1];
  if (last && Math.hypot(m.x - last.x, m.y - last.y) < minStepM) return points;
  return [...points, m];
}

/** The next selection after a REGION: add and subtract are idempotent, replace replaces. */
export function applySelection(current: readonly string[], ids: readonly string[], mode: SelectMode): string[] {
  if (mode === 'replace') return [...ids];
  if (mode === 'subtract') {
    const drop = new Set(ids);
    return current.filter((id) => !drop.has(id));
  }
  return [...new Set([...current, ...ids])];
}

/**
 * The next selection after a TAP on `ids` (one module, or its whole table).
 * Add mode toggles the tapped set — tapping a module you already have takes it
 * back out; replace mode clears when you tap exactly what is selected.
 */
export function tapSelection(current: readonly string[], ids: readonly string[], mode: SelectMode): string[] {
  if (mode === 'subtract') return applySelection(current, ids, 'subtract');
  const have = new Set(current);
  const allIn = ids.length > 0 && ids.every((id) => have.has(id));
  if (mode === 'add') return allIn ? applySelection(current, ids, 'subtract') : applySelection(current, ids, 'add');
  return allIn && current.length === ids.length ? [] : [...ids];
}

/** What a gesture asks for: Alt subtracts, Shift adds, otherwise the sticky mode. */
export function gestureMode(sticky: SelectMode, e: { shiftKey?: boolean; altKey?: boolean }): SelectMode {
  if (e.altKey) return 'subtract';
  if (e.shiftKey) return sticky === 'subtract' ? 'subtract' : 'add';
  return sticky;
}
