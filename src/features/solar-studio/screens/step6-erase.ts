// ─── Step 6 eraser hit-testing (pure, unit-tested) ──────────────────────────
// One resolver shared by the erase CLICK (delete) and the erase HOVER (red
// highlight), so what lights up is exactly what a click removes. Checked in
// priority order: panel → arrester → inverter → meter → walkway → rail —
// small point targets win over long strip targets that may pass under them.
import type { Project, XY } from '../types';
import { pointSegDist } from '../lib/geo';

export type EraseTarget =
  | { kind: 'panel'; id: string }
  | { kind: 'arrester'; id: string; pos: XY }
  | { kind: 'inverter'; id: string; pos: XY }
  | { kind: 'meter'; pos: XY }
  | { kind: 'walkway'; id: string }
  | { kind: 'rail'; id: string };

/** Hit radii / tolerances in plan metres. */
const PANEL_R = 1.3; // matches the editor's findPanelAt
const MARKER_R = 0.8; // arrester / inverter / meter point markers
const WALKWAY_SLOP = 0.3; // beyond the painted half-width
const RAIL_R = 0.4;

/** Plan position of an edge-mounted inverter placement (roof edge + 0..1 t). */
export function inverterPlacementPos(
  project: Project,
  ip: Project['inverterPlacements'][number],
): XY | null {
  const roof = project.roofs.find((r) => r.id === ip.roofId);
  if (!roof || roof.polygon.length === 0) return null;
  const a = roof.polygon[ip.edgeIndex];
  const b = roof.polygon[(ip.edgeIndex + 1) % roof.polygon.length];
  if (!a || !b) return null;
  return { x: a.x + (b.x - a.x) * ip.t, y: a.y + (b.y - a.y) * ip.t };
}

/** What the eraser at plan point `m` would remove, or null over empty roof. */
export function findEraseTargetAt(project: Project, m: XY): EraseTarget | null {
  const panel = project.panels.find(
    (p) => Math.hypot(m.x - p.center.x, m.y - p.center.y) < PANEL_R,
  );
  if (panel) return { kind: 'panel', id: panel.id };

  const la = project.arresters.find(
    (a) => Math.hypot(m.x - a.pos.x, m.y - a.pos.y) < MARKER_R,
  );
  if (la) return { kind: 'arrester', id: la.id, pos: la.pos };

  for (const ip of project.inverterPlacements) {
    const pos = inverterPlacementPos(project, ip);
    if (pos && Math.hypot(m.x - pos.x, m.y - pos.y) < MARKER_R)
      return { kind: 'inverter', id: ip.id, pos };
  }

  const gc = project.gridConnection;
  if (gc && Math.hypot(m.x - gc.pos.x, m.y - gc.pos.y) < MARKER_R)
    return { kind: 'meter', pos: gc.pos };

  const wk = project.walkways.find(
    (w) => pointSegDist(m, w.a, w.b).d < w.widthMm / 2000 + WALKWAY_SLOP,
  );
  if (wk) return { kind: 'walkway', id: wk.id };

  const rl = project.rails.find((r) => pointSegDist(m, r.a, r.b).d < RAIL_R);
  if (rl) return { kind: 'rail', id: rl.id };

  return null;
}
