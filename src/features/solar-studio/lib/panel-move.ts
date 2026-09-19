// ─── Moving placed panels (nudge / drag) ────────────────────────────────────
// Two rules govern every move, and they come straight from the canonical-model
// principle (§A0) rather than from UI convenience:
//
//   1. A panel that belongs to a SEGMENT does not move alone. Its table's
//      racking, legs and member model are generated from the segment, so
//      sliding one module out of the grid would visibly detach it from the
//      structure that holds it up. The whole segment moves instead — the same
//      partition `tiltSelected` already applies in Step6Editor.
//   2. A move is ALL-OR-NOTHING. If any moved panel would leave the setback,
//      hit an obstruction, enter a no-build zone or overlap another array, the
//      whole gesture is refused. A layout that is invalid mid-drag would flow
//      straight into capacity, energy and the BOM.
import type {
  ArraySegment,
  PanelSpec,
  PlacedPanel,
  Project,
  XY,
} from '../types';
import { panelFitsAt } from './layout';
import { isFacade, isSheetRoof, isSloped } from './roof-plane';

export type MoveResult =
  | { ok: true; panels: PlacedPanel[]; segments: ArraySegment[]; movedCount: number }
  | { ok: false; reason: string };

/**
 * The under-structure clearance a segment's table is allowed to bridge with.
 * Mirrors `fillRoofAsSegment`'s defaults chain exactly, so a walk-under array
 * that legitimately spans a tank can still be nudged across it.
 */
function bridgeClearanceFor(project: Project, roofId: string): number | undefined {
  const roof = project.roofs.find((r) => r.id === roofId);
  if (!roof) return undefined;
  if (isSloped(roof) || isSheetRoof(roof)) return undefined;
  return Math.max(
    0.3,
    roof.structureOverride?.clearanceM ?? project.structureDefaults?.clearanceM ?? 0,
  );
}

/**
 * Translate the selected panels by (dx, dy) metres in the project frame.
 * Segments represented in the selection move whole; loose panels move alone.
 */
export function movePanels(
  project: Project,
  spec: PanelSpec | null,
  selectedIds: string[],
  dx: number,
  dy: number,
): MoveResult {
  if (!spec) return { ok: false, reason: 'No panel selected in Step 4' };
  if (selectedIds.length === 0) return { ok: false, reason: 'Nothing selected' };

  const sel = new Set(selectedIds);
  const selPanels = project.panels.filter((p) => sel.has(p.id));
  if (selPanels.length === 0) return { ok: false, reason: 'Nothing selected' };

  // A FACADE module cannot be moved by a plan delta, and refusing it outright is
  // the honest answer rather than letting the drag run and land somewhere wrong.
  // (dx, dy) can only slide a module ALONG the wall — the course it sits in is a
  // height, and there is no height in a plan drag. Worse, sliding it off the
  // wall line would leave it hanging in mid-air beside the building while its
  // plan position still looked reasonable from above. Courses and columns are
  // changed by re-cladding the wall, which is what the fill is for.
  if (
    selPanels.some((p) => {
      const roof = project.roofs.find((r) => r.id === p.roofId);
      return roof ? isFacade(roof) : false;
    })
  )
    return {
      ok: false,
      reason:
        'A facade module cannot be dragged in plan — a drag has no height in it, and the course is a height. Re-fill the wall to change the courses or columns.',
    };

  // rule 1 — a touched segment moves in full, not just its selected modules
  const segIds = new Set(
    selPanels.map((p) => p.segmentId).filter((x): x is string => !!x),
  );
  const movingIds = new Set(selectedIds);
  for (const p of project.panels)
    if (p.segmentId && segIds.has(p.segmentId)) movingIds.add(p.id);

  const moved = project.panels.map((p) =>
    movingIds.has(p.id)
      ? { ...p, center: { x: p.center.x + dx, y: p.center.y + dy } }
      : p,
  );

  // rule 2 — validate against the layout WITHOUT the moving panels, so the
  // selection never collides with the copies of itself it is leaving behind
  const rest: Project = {
    ...project,
    panels: project.panels.filter((p) => !movingIds.has(p.id)),
  };
  for (const p of moved) {
    if (!movingIds.has(p.id)) continue;
    const roof = project.roofs.find((r) => r.id === p.roofId);
    if (!roof) return { ok: false, reason: 'Panel has no roof' };
    if (
      !panelFitsAt(
        rest,
        roof,
        spec,
        p.center,
        p.orientation,
        p.segmentId ? bridgeClearanceFor(project, p.roofId) : undefined,
        // validate the panel's OWN pose — the exact footprint DRC will judge
        // (panelFitsAt is the only frame derivation in a move; no second one)
        { tiltDeg: p.tiltDeg, azimuthDeg: p.azimuthDeg },
      )
    )
      return { ok: false, reason: "That move doesn't fit — setback, obstruction or another array is in the way" };
  }

  // A segment's `polygon` IS its table footprint — the region the member model
  // and racking are generated from. It has to travel with the modules, or the
  // structure would stay behind while the panels slide off it.
  const segments = project.segments.map((sg) =>
    segIds.has(sg.id)
      ? { ...sg, polygon: sg.polygon.map((v) => ({ x: v.x + dx, y: v.y + dy })) }
      : sg,
  );

  return { ok: true, panels: moved, segments, movedCount: movingIds.size };
}

/** Nudge step in metres: a fine tap, and a coarse one with Shift held. */
export const NUDGE_M = 0.1;
export const NUDGE_COARSE_M = 0.5;

/** Arrow key → (dx, dy) in project metres, or null for any other key. */
export function nudgeDelta(key: string, coarse: boolean): XY | null {
  const d = coarse ? NUDGE_COARSE_M : NUDGE_M;
  switch (key) {
    case 'ArrowLeft':
      return { x: -d, y: 0 };
    case 'ArrowRight':
      return { x: d, y: 0 };
    case 'ArrowUp':
      return { x: 0, y: -d };
    case 'ArrowDown':
      return { x: 0, y: d };
    default:
      return null;
  }
}
