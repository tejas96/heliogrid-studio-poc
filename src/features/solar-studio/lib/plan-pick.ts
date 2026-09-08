// ─── Plan-view hit testing: which module is under this point ────────────────
// One resolver for every 2D tap that has to name a module — select, erase, and
// anything later that resolves a tap to its table.
//
// WHY THIS EXISTS. Both call sites used to be `panels.find(p => hypot(…) < 1.3)`,
// which returns the FIRST panel in array order that is merely within range, not
// the nearest one. Every module in `data/panels.ts` is 1048–1134 mm wide, so with
// the default 50 mm gap the short-axis pitch is 1.098–1.184 m — always inside the
// 1.3 m radius. That means roughly 60% of each module's width, always including
// its own centre, resolved to a NEIGHBOUR: the user tapped one module and
// selected (or erased) a different one. The direction was not even stable —
// `planCellM` swaps the lattice axes on a pitched roof and in landscape, so it
// was the previous column on some roofs and the previous row on others, and
// `layoutGroup` re-appends panels to the end of the array, which reorders it
// again.
//
// Nearest-centre is the right answer, not just a safer one: inside a lattice the
// nearest-centre cell IS the module's own footprint (a Voronoi cell of a regular
// grid is the grid cell). The radius stops being a tie-breaker and becomes what
// it reads as — how far outside the array you may tap and still catch the edge
// module.
import type { XY } from '../types';

/**
 * Hit radius in plan metres. Generous on purpose: a fingertip is ~9 mm and the
 * modules are ~1.1 m wide, so the radius only decides how far off the array a
 * tap still counts. Which module you get is decided by distance, not by this.
 */
export const PANEL_HIT_R = 1.3;

/**
 * The panel whose centre is nearest `m`, or undefined if the nearest is further
 * than `radiusM`. Ties keep the earlier array entry, so the answer is stable
 * across renders for a given project.
 */
export function nearestPanelAt<T extends { center: XY }>(
  panels: readonly T[],
  m: XY,
  radiusM: number = PANEL_HIT_R,
): T | undefined {
  let best: T | undefined;
  // compare squared distance — no sqrt in the inner loop, same ordering
  let bestD2 = radiusM * radiusM;
  for (const p of panels) {
    const dx = m.x - p.center.x;
    const dy = m.y - p.center.y;
    const d2 = dx * dx + dy * dy;
    // strict `<` keeps the FIRST of any exact tie, matching the old find()
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}
