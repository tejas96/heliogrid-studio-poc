// ─── Foundation assemblies (Phase 22a / plan §2.2–2.3) ──────────────────────
// Every leg lands on SOMETHING, and until now the app drew nothing at all —
// `StructureInstanced` iterates members only, and the rooftop default
// (`anchor`) is a bare 8 mm plate, so even rendering nodes would have left the
// base looking empty. This module builds the complete sub-assembly per
// FoundationKind so a table reads as a buildable thing.
//
// ⚠️ SIZES ARE ASSUMED, NEVER COMPUTED. A pedestal's real dimensions follow
// from wind uplift and overturning, which this app does not calculate (§F).
// Everything here comes from rule config and must stay labelled `assumed`
// wherever a quantity derived from it is shown.
//
// ⚠️ THE HEIGHT CONTRACT (plan D15). `frontLegM` measures from the ROOF SURFACE
// to the MODULE UNDERSIDE, and the foundation occupies the BOTTOM of that
// dimension:
//
//     module underside  ── frontLegM ──┐
//                                      │  steel leg  = frontLegM − heightM
//     foundation top    ───────────────┤
//                                      │  foundation = heightM
//     roof surface      ───────────────┘
//
// Chosen so that switching foundation kind never moves the module plane — the
// alternative silently changes shading, energy and every stored capture — and
// so "Walk-under 2.2 m" keeps meaning 2.2 m of usable clearance.
import type { FoundationKind, FoundationShape } from '../types';
import { resolveRules, type FoundationGeometryRule } from '../data/rules/india';

const MM = 0.001;

export interface FoundationPart {
  /** which instanced bucket this belongs to */
  bucket: 'pedestal' | 'ballast' | 'pile' | 'plate' | 'bolt' | 'grout';
  geometry: 'box' | 'cylinder';
  /** metres, relative to the leg base (roof surface at the leg centre) */
  size: { x: number; y: number; z: number };
  offset: { x: number; y: number; z: number };
}

export interface FoundationAssembly {
  kind: FoundationKind;
  parts: FoundationPart[];
  /** height consumed above the deck, m — subtract from the steel leg (D15) */
  heightM: number;
  /** concrete volume per foundation, m³ — 0 for anchor. ASSUMED. */
  concreteM3: number;
  /** mass added to the roof per foundation, kg. ASSUMED. */
  deadLoadKg: number;
}

/**
 * Nominal geometry for a foundation kind, with an optional SHAPE override.
 *
 * Only a cast pedestal genuinely has a choice of form — ballast blocks are
 * precast rectangular and a pile is driven round — so the override is ignored
 * for every other kind rather than silently producing a shape that cannot be
 * built. When a square rule is asked to go circular the plan size carries over
 * as the diameter (and vice versa), which is what an installer means by
 * "same size, round shuttering".
 */
export function ruleFor(kind: FoundationKind, shape?: FoundationShape): FoundationGeometryRule {
  const f = resolveRules().foundations;
  const base =
    kind === 'concrete' ? f.pedestal : kind === 'ballast' ? f.ballast : kind === 'pile' ? f.pile : f.anchor;
  if (kind !== 'concrete' || !shape || shape === base.shape) return base;
  return shape === 'circular'
    ? { ...base, shape, d: base.d ?? base.l ?? 0, l: undefined, w: undefined }
    : { ...base, shape, l: base.l ?? base.d ?? 0, w: base.w ?? base.d ?? 0, d: undefined };
}

/**
 * Concrete volume for one foundation, m³.
 *
 * The shape branch is the whole point: a 300 square and a 300 diameter differ
 * by 21%, and this figure feeds both the BOM concrete line and the dead-load
 * warning. Getting it wrong under-buys concrete and under-reports roof load.
 */
export function foundationVolumeM3(r: FoundationGeometryRule): number {
  if (r.heightMm <= 0) return 0;
  const h = r.heightMm * MM;
  if (r.shape === 'circular') {
    const d = (r.d ?? 0) * MM;
    return Math.PI * (d / 2) ** 2 * h;
  }
  return (r.l ?? 0) * MM * ((r.w ?? r.l ?? 0) * MM) * h;
}

/** Mass one foundation adds to the roof, kg. ASSUMED — engineer to confirm. */
export function foundationDeadLoadKg(kind: FoundationKind, shape?: FoundationShape): number {
  // A pile is driven into the ground, not stood on a slab: no roof load.
  if (kind === 'pile' || kind === 'anchor') return 0;
  const { concreteDensityKgM3 } = resolveRules().foundations;
  return foundationVolumeM3(ruleFor(kind, shape)) * concreteDensityKgM3;
}

/** Steel leg length above the foundation, m (D15). May go non-positive. */
export function legAboveFoundationM(frontLegM: number, kind: FoundationKind): number {
  return frontLegM - ruleFor(kind).heightMm * MM;
}

/** True when the chosen foundation leaves no buildable steel leg (D15 → DRC). */
export function foundationTooTall(frontLegM: number, kind: FoundationKind): boolean {
  return legAboveFoundationM(frontLegM, kind) < resolveRules().foundations.minLegAboveFoundationM;
}

const BOLT_D = 0.012; // M12 anchor bolt, m
const BOLT_PROUD = 0.026; // how far it stands above the plate, m
const GROUT_MM = 12; // levelling grout bed under the plate

/**
 * The complete sub-assembly for one leg base, in the leg's local frame with
 * y = 0 at the roof surface and +y up.
 */
export function foundationAssembly(
  kind: FoundationKind,
  shape?: FoundationShape,
): FoundationAssembly {
  const r = ruleFor(kind, shape);
  const parts: FoundationPart[] = [];
  const h = r.heightMm * MM;
  const plate = r.plateMm * MM;
  const plateT = r.plateThkMm * MM;

  if (kind === 'concrete' || kind === 'ballast') {
    const bucket = kind === 'concrete' ? 'pedestal' : 'ballast';
    parts.push({
      bucket,
      geometry: r.shape === 'circular' ? 'cylinder' : 'box',
      size:
        r.shape === 'circular'
          ? { x: (r.d ?? 0) * MM, y: h, z: (r.d ?? 0) * MM }
          : { x: (r.l ?? 0) * MM, y: h, z: (r.w ?? r.l ?? 0) * MM },
      offset: { x: 0, y: h / 2, z: 0 },
    });
    if (kind === 'concrete') {
      // levelling bed the plate actually sits on
      parts.push({
        bucket: 'grout',
        geometry: 'box',
        size: { x: plate * 1.05, y: GROUT_MM * MM, z: plate * 1.05 },
        offset: { x: 0, y: h + (GROUT_MM * MM) / 2, z: 0 },
      });
    }
  }

  if (kind === 'pile') {
    const d = (r.d ?? 0) * MM;
    const embed = (r.embedMm ?? 0) * MM;
    parts.push({
      bucket: 'pile',
      geometry: 'cylinder',
      // spans from below grade up to the plate
      size: { x: d, y: embed + h, z: d },
      offset: { x: 0, y: h - (embed + h) / 2, z: 0 },
    });
  }

  // every kind gets a base plate
  const plateY = kind === 'concrete' ? h + GROUT_MM * MM : h;
  parts.push({
    bucket: 'plate',
    geometry: 'box',
    size: { x: plate, y: plateT, z: plate },
    offset: { x: 0, y: plateY + plateT / 2, z: 0 },
  });

  // anchor bolts — cast-in for a pedestal, drilled for a chemical anchor
  if (kind === 'concrete' || kind === 'anchor') {
    const g = plate * 0.34;
    for (const dx of [-g, g]) {
      for (const dz of [-g, g]) {
        parts.push({
          bucket: 'bolt',
          geometry: 'cylinder',
          size: { x: BOLT_D, y: BOLT_PROUD, z: BOLT_D },
          offset: { x: dx, y: plateY + plateT + BOLT_PROUD / 2 - plateT / 2, z: dz },
        });
      }
    }
  }

  return {
    kind,
    parts,
    heightM: plateY + plateT,
    concreteM3: kind === 'concrete' ? foundationVolumeM3(r) : 0,
    deadLoadKg: foundationDeadLoadKg(kind, shape),
  };
}


/**
 * Which foundation a leg base represents, read back from the hardware it
 * carries. `anchorSpec` in structure.ts is the only place that decides this, so
 * the renderer, the DRC and the BOM count can never drift apart (§A0).
 */
export function foundationKindOfSpec(spec: {
  ballast?: number;
  piles?: number;
  pedestals?: number;
}): FoundationKind {
  if ((spec.ballast ?? 0) > 0) return 'ballast';
  if ((spec.piles ?? 0) > 0) return 'pile';
  if ((spec.pedestals ?? 0) > 0) return 'concrete';
  return 'anchor';
}
