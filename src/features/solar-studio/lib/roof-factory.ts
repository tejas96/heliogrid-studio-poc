// ─── Roof/Obstruction factory: ONE construction path for every source ───────
// Hand-drawn (Step 2/3), duplicated, and AI-imported entities must all pass
// the same sanitization and carry the same defaults, or downstream engines
// (setback insets, layout fill, 3D, BOM) meet shapes they were never tested
// on. Extracted from Step2Roof.normalisedPolygon / finishRoof and
// Step3Obstructions.place so the AI importer (Phase 5) can never drift from
// the manual pipeline.
import { CAPABILITY_PRESETS } from './capabilities';
import type {
  EntityProvenance,
  LatLng,
  Obstruction,
  ObstructionType,
  Project,
  Roof,
  RoofType,
  XY,
} from '../types';
import { genId, isCCW, insetPolygonRobust, validateRoofPolygon } from './geo';
import { resolveRules } from '../data/rules/india';

export const MIN_ROOF_EDGE_M = 0.15;
export const MIN_ROOF_AREA_M2 = 0.5;
/** fixed probe: a roof must keep SOME usable area at the standard setback */
const INSET_PROBE_M = 0.3;

// ─── Polygon sanitization ────────────────────────────────────────────────────

/**
 * Pre-clean a ring from an AI detector before validation: drop a closing
 * duplicate vertex, merge vertices closer than the minimum edge, and remove
 * near-collinear points. Returns a NEW array; never mutates.
 */
export function preCleanRing(points: XY[]): XY[] {
  if (points.length === 0) return [];
  let ring = [...points];
  // closing duplicate (first == last)
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && Math.hypot(last.x - first.x, last.y - first.y) < 1e-6) {
    ring = ring.slice(0, -1);
  }
  // merge too-close consecutive vertices
  const merged: XY[] = [];
  for (const p of ring) {
    const prev = merged[merged.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= MIN_ROOF_EDGE_M) merged.push(p);
  }
  // wrap-around closeness
  while (
    merged.length > 3 &&
    Math.hypot(
      merged[0].x - merged[merged.length - 1].x,
      merged[0].y - merged[merged.length - 1].y,
    ) < MIN_ROOF_EDGE_M
  ) {
    merged.pop();
  }
  // collapse near-collinear vertices (< ~2° turn)
  const out: XY[] = [];
  for (let i = 0; i < merged.length; i++) {
    const a = merged[(i + merged.length - 1) % merged.length];
    const b = merged[i];
    const c = merged[(i + 1) % merged.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    const cross = abx * bcy - aby * bcx;
    const dot = abx * bcx + aby * bcy;
    const turn = Math.abs(Math.atan2(cross, dot));
    if (turn > (2 * Math.PI) / 180) out.push(b);
  }
  return out.length >= 3 ? out : merged;
}

export type PolygonResult = { ok: true; polygon: XY[] } | { ok: false; reason: string };

/**
 * The canonical roof-polygon gate (exactly Step 2's rules): CCW winding,
 * validateRoofPolygon (finite, min edge 0.15 m, no self-intersection,
 * area ≥ 0.5 m²), and a non-empty 0.3 m inset probe.
 */
export function sanitizeRoofPolygon(points: XY[]): PolygonResult {
  if (points.length < 3) return { ok: false, reason: 'A roof needs at least 3 corners' };
  const polygon = isCCW(points) ? points : [...points].reverse();
  const validation = validateRoofPolygon(polygon, {
    minEdgeM: MIN_ROOF_EDGE_M,
    minAreaM2: MIN_ROOF_AREA_M2,
  });
  if (!validation.valid) {
    return { ok: false, reason: validation.reason ?? 'That roof shape is not valid.' };
  }
  const usable = insetPolygonRobust(
    polygon,
    polygon.map(() => INSET_PROBE_M),
  );
  if (usable.length === 0) {
    return { ok: false, reason: 'This roof has no usable area after the 0.3 m edge setback.' };
  }
  return { ok: true, polygon };
}

// ─── Roof construction ───────────────────────────────────────────────────────

/** Next auto-name following Step 2's counters (Roof N / Mumty N). */
export function nextRoofName(existing: Roof[], isMumty: boolean): string {
  if (isMumty) {
    return `Mumty ${existing.filter((r) => r.name.startsWith('Mumty')).length + 1}`;
  }
  return `Roof ${existing.length + 1}`;
}

/** A Roof with exactly the manual-draw defaults (Step 2 finishRoof). */
export function makeRoof(opts: {
  polygon: XY[];
  existing: Roof[];
  parent?: Roof | null;
  heightM?: number;
  pitchDeg?: number;
  slopeAzimuthDeg?: number;
  /**
   * The COVERING to build with. Defaults to 'rcc_flat', which is exactly what
   * this factory always produced — so every existing caller is unchanged. The
   * pitched-roof factories (gable/hip/skeleton) pass the SOURCE roof's covering
   * through, so converting a metal shed to a gable yields metal-shed faces
   * instead of silently re-cladding them in concrete and re-pricing the BOM.
   */
  roofType?: RoofType;
  provenance?: EntityProvenance;
}): Roof {
  const { polygon, existing, parent } = opts;
  return {
    id: genId('roof'),
    name: nextRoofName(existing, !!parent),
    polygon,
    roofType: opts.roofType ?? 'rcc_flat',
    heightM: opts.heightM ?? (parent ? parent.heightM + 2.2 : 3),
    pitchDeg: opts.pitchDeg ?? 0,
    slopeAzimuthDeg: opts.slopeAzimuthDeg ?? 180,
    setbackM: resolveRules().defaults.roofSetbackM,
    perEdgeSetbacksM: null,
    parapet: {
      enabled: false,
      direction: 'inward',
      heightM: 1,
      widthM: 0.3,
      perEdge: null,
      suppressSharedEdges: true,
    },
    ...(opts.provenance ? { provenance: opts.provenance } : {}),
  };
}

/**
 * A free-field array area at grade. Deliberately built through the same shape
 * as `makeRoof` so every downstream pipeline (fill, setbacks, shading, strings,
 * routing, BOM) treats it identically — the differences are only these:
 *   heightM 0        it IS the ground; obstruction/​caster bases already use 0
 *   parapet disabled a boundary is not a parapet (fencing is a BOM line, 20c)
 *   setback          boundary offset, typically larger than a roof edge setback
 * v1 assumes FLAT terrain: a slope would change row spacing, which is real
 * math and is deferred rather than approximated.
 */
export function makeGroundSurface(opts: {
  polygon: XY[];
  existing: Roof[];
  setbackM?: number;
  provenance?: EntityProvenance;
}): Roof {
  const base = makeRoof({
    polygon: opts.polygon,
    existing: opts.existing,
    heightM: 0,
    ...(opts.provenance ? { provenance: opts.provenance } : {}),
  });
  const rules = resolveRules().defaults;
  return {
    ...base,
    name: nextGroundName(opts.existing),
    roofType: 'ground',
    setbackM: opts.setbackM ?? rules.groundSetbackM,
    parapet: { ...base.parapet, enabled: false },
  };
}

/** Ground areas are named "Array Area A/B/…" — calling one "Roof 3" is a lie. */
export function nextGroundName(existing: Roof[]): string {
  const n = existing.filter((r) => r.roofType === 'ground').length;
  return `Array Area ${String.fromCharCode(65 + (n % 26))}`;
}

// ─── Obstruction construction ────────────────────────────────────────────────

/** Per-type presets — moved verbatim from Step 3 (label code + L/W/H meters). */
export const OBSTRUCTION_PRESETS: Record<
  ObstructionType,
  { code: string; size: [number, number, number] }
> = {
  tank: { code: 'WT', size: [2, 1.5, 1.2] },
  dish: { code: 'DS', size: [1, 1, 1.2] },
  chimney: { code: 'CH', size: [0.8, 0.8, 2] },
  tree: { code: 'TR', size: [3, 3, 5] },
  elevated: { code: 'EL', size: [3, 2.5, 2.6] },
  building: { code: 'BL', size: [8, 6, 9] },
  solar_wh: { code: 'SW', size: [2, 1.2, 1.5] },
  ladder: { code: 'LD', size: [0.6, 1.5, 3] },
  windmill: { code: 'WM', size: [1.8, 1.8, 3.5] },
  turbine_vent: { code: 'TV', size: [0.4, 0.4, 0.5] },
  other: { code: 'OB', size: [1.5, 1.5, 1] },
};

export const MIN_OBSTRUCTION_DIM_M = 0.3;

/**
 * An Obstruction with exactly the manual-place defaults (Step 3 place()).
 * `existing` drives the CODE+count label; pass ALL current obstructions
 * (including ones being imported in the same batch) to avoid duplicates.
 */
export function makeObstruction(opts: {
  type: ObstructionType;
  center: XY;
  existing: Obstruction[];
  roofId: string | null;
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  rotationDeg?: number;
  provenance?: EntityProvenance;
}): Obstruction {
  const preset = OBSTRUCTION_PRESETS[opts.type];
  const count = opts.existing.filter((o) => o.type === opts.type).length + 1;
  const L = Math.max(MIN_OBSTRUCTION_DIM_M, opts.lengthM ?? preset.size[0]);
  const W = Math.max(MIN_OBSTRUCTION_DIM_M, opts.widthM ?? preset.size[1]);
  return {
    id: genId('ob'),
    type: opts.type,
    label: `${preset.code}${count}`,
    roofId: opts.roofId,
    center: opts.center,
    shape: opts.type === 'tree' || opts.type === 'windmill' ? 'circle' : 'rect',
    lengthM: L,
    widthM: W,
    diameterM: L,
    heightM: Math.max(0.1, opts.heightM ?? preset.size[2]),
    rotationDeg: opts.rotationDeg ?? 0,
    setbackM: 0.5,
    // NEW objects get the full preset EXPLICITLY (visible + editable in the
    // inspector); legacy objects resolve conservatively from their booleans
    capabilities: { ...CAPABILITY_PRESETS[opts.type] },
    castsShadow: true,
    blocksPlacement: true,
    ...(opts.provenance ? { provenance: opts.provenance } : {}),
  };
}

/** Pin guard shared with the artifact validator. */
export function latLngClose(a: LatLng, b: LatLng, tolDeg: number): boolean {
  return Math.abs(a.lat - b.lat) <= tolDeg && Math.abs(a.lng - b.lng) <= tolDeg;
}

/**
 * §26e: turn an obstruction into a STACKED ROOF at its own top height so
 * panels can mount directly on it (tight-space scenario). The obstruction is
 * removed — the platform takes over its blocking/shading role through the
 * normal roof pipeline (stacking, casters, BOM). Circles become a 12-gon.
 * Returns null when the top is too small to be a usable roof.
 */
export function obstructionToPlatform(
  project: Project,
  obstructionId: string,
): { roofs: Roof[]; obstructions: Obstruction[] } | null {
  const o = project.obstructions.find((x) => x.id === obstructionId);
  if (!o) return null;
  const base = o.roofId ? project.roofs.find((r) => r.id === o.roofId) : undefined;
  const baseH = base?.heightM ?? 0;
  const rad = (o.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const polygon: XY[] =
    o.shape === 'circle'
      ? Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return {
            x: o.center.x + (o.diameterM / 2) * Math.cos(a),
            y: o.center.y + (o.diameterM / 2) * Math.sin(a),
          };
        })
      : [
          { x: -o.lengthM / 2, y: -o.widthM / 2 },
          { x: o.lengthM / 2, y: -o.widthM / 2 },
          { x: o.lengthM / 2, y: o.widthM / 2 },
          { x: -o.lengthM / 2, y: o.widthM / 2 },
        ].map((pt) => ({
          x: o.center.x + pt.x * cos - pt.y * sin,
          y: o.center.y + pt.x * sin + pt.y * cos,
        }));
  const check = sanitizeRoofPolygon(polygon);
  if (!check.ok) return null; // top too small/degenerate for a usable roof
  const roof: Roof = {
    ...makeRoof({
      polygon: check.polygon,
      existing: project.roofs,
      parent: base ?? null,
      heightM: baseH + o.heightM,
    }),
    name: `${o.label} platform`,
  };
  return {
    roofs: [...project.roofs, roof],
    obstructions: project.obstructions.filter((x) => x.id !== obstructionId),
  };
}
