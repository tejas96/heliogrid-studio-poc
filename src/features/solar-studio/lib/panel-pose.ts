// ─── Canonical panel pose: the ONE placement of a module in 3D (§A0) ────────
// Where a module physically sits is engineering data, not a render detail:
// the visual mesh, the analytical shadow slab (Tier-2 casters) and the shading
// engine's ray origin must all describe the SAME plate in space, or the scene
// and the numbers describe different systems (audit finding 11/12 class).
//
// Height sources, in canonical order (§A0 — parametric racking wins):
//   sloped roof  → flush on the roof plane (+ standoff)
//   structured   → roof + frontLegM + rise/2 + MODULE_STANDOFF_M
//   loose/flat   → roof + LOOSE_STANDOFF_M (no member model to consult)
import type { PanelSpec, PlacedPanel, Project, Roof } from '../types';
import { isSloped, surfaceHeightAt } from './roof-plane';
import { panelFootprintM, roofGridAngle } from './layout';
import { MODULE_STANDOFF_M, resolveRacking } from './structure';

/** Flush-on-slope glass offset above the roof plane (rail + clamp stack). */
export const FLUSH_STANDOFF_M = 0.06;
/** Loose panel on a flat roof with no structure model — legacy render height. */
export const LOOSE_STANDOFF_M = 0.18;

export interface PanelPose {
  /** module-centre world position in three's frame: (x, y, -planY) */
  position: [number, number, number];
  /** height of the module centre ABOVE the roof surface below it */
  heightAboveSurfaceM: number;
  yawRad: number;
  tiltRad: number;
  /** module width along local x (m) */
  w: number;
  /** module depth along local z (m) — the slant length of the plate */
  d: number;
  /** lies flat on the surface: no legs, no tilt stand */
  flush: boolean;
  /** true when a parametric structure carries it (real legs are drawn) */
  structured: boolean;
}

/**
 * The pose of one placed panel. `surfaceY` is the roof-surface height under
 * the panel centre; pass it when the caller already has eave refs (hot loops),
 * otherwise it is derived from the roof.
 */
export function panelPose(
  project: Project,
  panel: PlacedPanel,
  spec: PanelSpec,
  roof: Roof | undefined,
  surfaceY?: number,
): PanelPose {
  const sloped = roof ? isSloped(roof) : false;
  const seg = panel.segmentId
    ? project.segments.find((s) => s.id === panel.segmentId)
    : undefined;
  const racking = seg && roof ? resolveRacking(project, roof, seg, spec) : null;
  const foot = panelFootprintM(spec, panel.orientation);
  const d = foot.h;
  const tiltRad = (panel.tiltDeg * Math.PI) / 180;

  // flush on a slope: face down-slope. Tilted on a flat roof: face the panel's
  // OWN azimuth — the same direction the energy engine assumes. Untilted flat
  // panels have no facing; align the footprint to the roof grid.
  const yawRad = sloped
    ? -((roof!.slopeAzimuthDeg * Math.PI) / 180)
    : panel.tiltDeg > 0
      ? -((panel.azimuthDeg * Math.PI) / 180)
      : ((roof ? roofGridAngle(roof) : 0) * Math.PI) / 180;

  const heightAboveSurfaceM = sloped
    ? FLUSH_STANDOFF_M
    : racking
      ? racking.frontLegM + (d * Math.sin(tiltRad)) / 2 + MODULE_STANDOFF_M
      : LOOSE_STANDOFF_M;

  const baseY =
    surfaceY ?? (roof ? surfaceHeightAt(roof, panel.center) : 3);

  return {
    position: [panel.center.x, baseY + heightAboveSurfaceM, -panel.center.y],
    heightAboveSurfaceM,
    yawRad,
    tiltRad,
    w: foot.w,
    d,
    flush: sloped,
    structured: !!racking,
  };
}

/** Ray origins start just off the glass so the module's own slab never self-hits. */
export const RAY_EPS_M = 0.05;

/**
 * Height above the roof surface for the shading engine's ray origin: the REAL
 * module plane plus a small epsilon. A walk-under array bridging a tank sits
 * ABOVE it — a fixed offset read those panels as shaded (user bug, 2026-07-16).
 */
export function panelSampleHeightM(
  project: Project,
  panel: PlacedPanel,
  spec: PanelSpec | null,
  roof?: Roof,
  surfaceY?: number,
): number {
  if (!spec) return LOOSE_STANDOFF_M + RAY_EPS_M;
  const r = roof ?? project.roofs.find((x) => x.id === panel.roofId);
  return panelPose(project, panel, spec, r, surfaceY).heightAboveSurfaceM + RAY_EPS_M;
}
