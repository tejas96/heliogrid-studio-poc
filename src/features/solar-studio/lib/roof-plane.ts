// ─── Sloped-roof plane math: one source of truth for surface height ─────────
// A roof surface is a plane. `heightM` is the EAVE (low-side) wall height; the
// surface rises from there toward the ridge along the up-slope direction, so a
// sloped roof never dips below its walls. Flat roofs (pitch 0) return heightM
// everywhere, keeping every downstream consumer identical to before.
import type { Roof, XY } from '../types';
import { collinearOverlap } from './geo';

const deg = (d: number) => (d * Math.PI) / 180;

export function isSloped(roof: Roof): boolean {
  return (roof.pitchDeg ?? 0) >= 0.5;
}

/** Downslope horizontal unit vector in plan (x=east, y=north) + gradient. */
export function slopeVector(roof: Roof): { dx: number; dy: number; grad: number } {
  const a = deg(roof.slopeAzimuthDeg ?? 180);
  return { dx: Math.sin(a), dy: Math.cos(a), grad: Math.tan(deg(roof.pitchDeg ?? 0)) };
}

/** Smallest angle between two compass bearings, honouring wraparound. */
function bearingGap(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
}

/**
 * Do two roofs lie on the SAME plane — not merely the same orientation?
 *
 * Two fixes here, both found in an EPC review:
 *  - Azimuth was compared with a raw subtraction, so 359.8° and 0.1° read as
 *    359.7° apart instead of 0.3°. A near-north slope split across polygons
 *    therefore failed to share an eave reference and stepped at the shared edge.
 *  - Orientation alone is not a plane. Two roofs can be parallel yet sit at
 *    different heights, and fusing their eave datum drops one of them onto the
 *    other's slope. The eave DATUM must match too — the surface height carried
 *    back to a common reference, which for equal pitch reduces to comparing
 *    heightM once the along-slope projection is accounted for by the caller.
 */
function sameSlope(a: Roof, b: Roof): boolean {
  if (Math.abs((a.pitchDeg ?? 0) - (b.pitchDeg ?? 0)) >= 0.5) return false;
  if (bearingGap(a.slopeAzimuthDeg ?? 180, b.slopeAzimuthDeg ?? 180) >= 0.5) return false;
  return Math.abs((a.heightM ?? 0) - (b.heightM ?? 0)) < 0.05;
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
 * Effective eave projection per roof: the max downslope projection over the
 * connected group of ADJACENT same-slope roofs. A slope split across several
 * polygons then shares ONE eave line → one continuous plane, instead of each
 * polygon anchoring its own eave and stepping at the shared edge. Keyed by id;
 * a lone sloped roof just gets its own projMax (unchanged behaviour).
 */
export function computeEaveRefs(roofs: Roof[]): Map<string, number> {
  const refs = new Map<string, number>();
  const sloped = roofs.filter(isSloped);
  const seen = new Set<string>();
  for (const start of sloped) {
    if (seen.has(start.id)) continue;
    const group: Roof[] = [];
    const stack = [start];
    seen.add(start.id);
    while (stack.length) {
      const r = stack.pop()!;
      group.push(r);
      for (const other of sloped) {
        if (seen.has(other.id)) continue;
        if (sameSlope(r, other) && roofsAdjacent(r, other)) {
          seen.add(other.id);
          stack.push(other);
        }
      }
    }
    const { dx, dy } = slopeVector(start);
    const projMax = Math.max(
      ...group.flatMap((r) => r.polygon.map((q) => q.x * dx + q.y * dy)),
    );
    for (const r of group) refs.set(r.id, projMax);
  }
  return refs;
}

/**
 * Height of the roof top surface at a plan point (flat → heightM everywhere).
 * Pass `eaveProj` (from computeEaveRefs) to keep adjacent same-slope roofs on
 * one continuous plane; omit it and the roof anchors to its own eave.
 */
export function surfaceHeightAt(roof: Roof, p: XY, eaveProj?: number): number {
  if (!isSloped(roof)) return roof.heightM;
  const { dx, dy, grad } = slopeVector(roof);
  const proj = (q: XY) => q.x * dx + q.y * dy; // larger = further downslope = lower
  const eave = eaveProj ?? Math.max(...roof.polygon.map(proj)); // eave line
  return roof.heightM + grad * (eave - proj(p));
}

/** Panels flush on the plane inherit its pitch (tilt) and aspect (azimuth). */
export function slopePanelPose(roof: Roof): { tiltDeg: number; azimuthDeg: number } {
  return { tiltDeg: roof.pitchDeg, azimuthDeg: roof.slopeAzimuthDeg };
}
