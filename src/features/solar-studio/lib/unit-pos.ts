// ─── Where a placed unit stands ─────────────────────────────────────────────
// Inverters, battery cabinets and DCDB/ACDB boxes share one placement frame:
// a wall (roof edge + fraction along it) OR a free plan position — on a stand
// on the roof deck, or at ground level in the plant room beside the building.
// One helper for the position, one for the base height; the routes, the 2D
// markers, the 3D model and the BOM all read these.
import type { Project, XY } from '../types';

export interface PlacedUnit {
  roofId: string;
  edgeIndex: number;
  t: number;
  /** mounting height above the surface it stands on */
  heightM: number;
  pos?: XY;
  level?: 'roof' | 'ground';
}

/** Plan position: the free position when there is one, else the wall point. */
export function unitPlanPos(project: Project, u: PlacedUnit): XY | null {
  if (u.pos) return u.pos;
  const roof = project.roofs.find((r) => r.id === u.roofId);
  if (!roof || roof.polygon.length < 2) return null;
  const a = roof.polygon[u.edgeIndex % roof.polygon.length];
  const b = roof.polygon[(u.edgeIndex + 1) % roof.polygon.length];
  if (!a || !b) return null;
  return { x: a.x + (b.x - a.x) * u.t, y: a.y + (b.y - a.y) * u.t };
}

/** Height of the surface the unit stands on: the roof deck for a roof stand, else the ground. */
export function unitBaseY(project: Project, u: PlacedUnit): number {
  if (u.pos && u.level === 'roof') return project.roofs.find((r) => r.id === u.roofId)?.heightM ?? 0;
  return 0;
}

export function unitIsFree(u: PlacedUnit): boolean {
  return !!u.pos;
}

/** Plain words for the card: where it is. */
export function unitWhere(u: PlacedUnit): string {
  if (!u.pos) return 'on the wall';
  return u.level === 'roof' ? 'on a stand on the roof' : 'at ground level';
}
