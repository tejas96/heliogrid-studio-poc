// ─── Where does a placed object stand? ──────────────────────────────────────
// ONE answer to "what is the surface height under this point", so the mesh, the
// shading proxy and the editor cannot each compute it differently.
//
// The bug this exists to prevent: an obstruction stored the roof it was first
// dropped on and never updated it. Dragging, arrow-nudging or duplicating moved
// the object but left the anchor behind, and `surfaceHeightAt` extrapolates its
// plane WITHOUT BOUND — so a stale anchor did not fail loudly, it silently
// returned the old roof's plane extended to the new position. On a pitched roof
// that plane keeps climbing, which is why turbine vents ended up hanging in the
// air above the surface actually drawn beneath them.
import type { Roof, XY } from '../types';
import { surfaceHeightAt } from './roof-plane';
import { pickRoofAt } from './roof-topology';

/** Anchor for an object at `p`: the roof under it, or null for open ground. */
export function resolveAnchorRoofId(p: XY, roofs: Roof[]): string | null {
  return pickRoofAt(p, roofs)?.id ?? null;
}

/**
 * Surface height at `p`, resolved from POSITION rather than from a stored id.
 * Falls back to grade when nothing is underneath.
 */
export function groundHeightAt(p: XY, roofs: Roof[], eaveRefs?: Map<string, number>): number {
  const roof = pickRoofAt(p, roofs);
  return roof ? surfaceHeightAt(roof, p, eaveRefs?.get(roof.id)) : 0;
}

/**
 * Base height for an obstruction — the Y its model's origin sits at.
 *
 * `roofId === null` is meaningful and is preserved: it says "this stands on the
 * ground", which is how a tree beside a building is distinguished from a vent
 * on top of one. Re-resolving those by position would lift any tree whose trunk
 * happens to fall inside a roof's footprint in plan onto the roof.
 *
 * A NON-null anchor is verified rather than trusted. If the object is no longer
 * over the roof it claims, the claim is stale — a saved project from before the
 * anchor was kept in sync — and the height comes from what is actually below.
 * That heals old data on load with no migration.
 */
export function obstructionBaseY(
  o: { center: XY; roofId: string | null },
  roofs: Roof[],
  eaveRefs?: Map<string, number>,
): number {
  if (o.roofId === null) return 0;

  const claimed = roofs.find((r) => r.id === o.roofId);
  const actual = pickRoofAt(o.center, roofs);
  // the claim holds only while the object is still standing on it
  const roof = claimed && actual?.id === claimed.id ? claimed : actual;
  return roof ? surfaceHeightAt(roof, o.center, eaveRefs?.get(roof.id)) : 0;
}
