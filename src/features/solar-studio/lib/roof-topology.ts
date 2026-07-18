// ─── Roof-to-roof relationships: shared walls, stacking, area union ─────────
// All derived on demand from geometry — nothing here is stored, so undoing a
// neighbour's edit automatically restores every dependent behaviour.
import type { Roof, XY } from '../types';
import {
  collinearOverlap,
  dist,
  intersectPolygons,
  pointInPolygon,
  polygonArea,
  polygonsUnionArea,
} from './geo';

/** Two roof tops within this vertical distance count as the same level. */
const LEVEL_TOL_M = 0.05;

export interface SharedEdge {
  edgeIndex: number;
  otherRoofId: string;
  otherRoofName: string;
  otherHeightM: number;
  /** fraction of THIS edge's length covered by the other roof's edge */
  coverage: number;
}

/** Per edge of `roof`, the best collinear overlap against every other roof. */
export function sharedEdges(roof: Roof, all: Roof[], tolM = 0.05): SharedEdge[] {
  const out: SharedEdge[] = [];
  const n = roof.polygon.length;
  for (let i = 0; i < n; i++) {
    const a = roof.polygon[i];
    const b = roof.polygon[(i + 1) % n];
    const edgeLen = dist(a, b);
    if (edgeLen < 1e-6) continue;
    let best: SharedEdge | null = null;
    for (const other of all) {
      if (other.id === roof.id) continue;
      const m = other.polygon.length;
      for (let j = 0; j < m; j++) {
        const c = other.polygon[j];
        const d = other.polygon[(j + 1) % m];
        const ov = collinearOverlap(a, b, c, d, tolM);
        if (!ov) continue;
        const coverage = ov.lenM / edgeLen;
        if (!best || coverage > best.coverage) {
          best = {
            edgeIndex: i,
            otherRoofId: other.id,
            otherRoofName: other.name,
            otherHeightM: other.heightM,
            coverage,
          };
        }
      }
    }
    if (best) out.push(best);
  }
  return out;
}

export interface EffectiveParapetEdge {
  enabled: boolean;
  heightM: number;
  /** auto-disabled because the edge is shared with an equal/higher roof */
  suppressed: boolean;
  sharedWith?: string;
}

/**
 * Resolve what the parapet actually does on each edge: the uniform settings,
 * per-edge overrides, and shared-wall suppression. Suppression rule: the edge
 * is ≥90% covered by another roof's edge AND that roof is higher (its wall IS
 * the boundary), or equal-height where the earlier roof in project order keeps
 * the wall (exactly one wall on a shared seam, deterministically).
 */
export function effectiveParapetEdges(roof: Roof, all: Roof[]): EffectiveParapetEdge[] {
  const n = roof.polygon.length;
  const p = roof.parapet;
  const shared = p.suppressSharedEdges ? sharedEdges(roof, all) : [];
  const myIndex = all.findIndex((r) => r.id === roof.id);

  return Array.from({ length: n }, (_, i) => {
    const on = p.perEdge?.[i] ?? true;
    const base: EffectiveParapetEdge = {
      enabled: p.enabled && on,
      heightM: p.heightM,
      suppressed: false,
    };
    if (!base.enabled) return base;
    const s = shared.find((e) => e.edgeIndex === i && e.coverage >= 0.9);
    if (!s) return base;
    const otherIndex = all.findIndex((r) => r.id === s.otherRoofId);
    const otherHigher = s.otherHeightM > roof.heightM + LEVEL_TOL_M;
    const equalAndOtherKeepsWall =
      Math.abs(s.otherHeightM - roof.heightM) <= LEVEL_TOL_M && otherIndex < myIndex;
    if (otherHigher || equalAndOtherKeepsWall) {
      return { ...base, enabled: false, suppressed: true, sharedWith: s.otherRoofName };
    }
    return base;
  });
}

/** Footprint intersections with every roof stacked ABOVE this one. */
export function higherOverlapFootprints(roof: Roof, all: Roof[]): XY[][] {
  const out: XY[][] = [];
  for (const other of all) {
    if (other.id === roof.id) continue;
    if (other.heightM <= roof.heightM + LEVEL_TOL_M) continue;
    out.push(...intersectPolygons(roof.polygon, other.polygon));
  }
  return out;
}

/** Project footprint area without double-counting stacked/overlapping roofs. */
export function roofsUnionAreaM2(roofs: Roof[]): number {
  return polygonsUnionArea(roofs.map((r) => r.polygon));
}

/**
 * Which roof does a canvas point refer to? The HIGHEST containing roof wins
 * (a mumty sits on top of its terrace), ties broken by smaller footprint.
 */
export function pickRoofAt(m: XY, roofs: Roof[]): Roof | undefined {
  const hits = roofs.filter((r) => pointInPolygon(m, r.polygon));
  if (hits.length <= 1) return hits[0];
  return hits.reduce((best, r) => {
    if (r.heightM > best.heightM + LEVEL_TOL_M) return r;
    if (
      Math.abs(r.heightM - best.heightM) <= LEVEL_TOL_M &&
      polygonArea(r.polygon) < polygonArea(best.polygon)
    ) {
      return r;
    }
    return best;
  });
}
