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
import type { ArraySegment, PanelSpec, PlacedPanel, Project, Roof } from '../types';
import { isSloped, surfaceHeightAt } from './roof-plane';
import { panelFootprintM, roofGridAngle } from './layout';
import { MODULE_STANDOFF_M, resolveRacking } from './structure';
import { measuredRowPitchM, resolveTrackerAxis, trackerPose, type TrackerAxis } from './energy/tracker';

/** Where the sun is, for the one racking kind whose geometry depends on it. */
export interface SunAngles {
  altitudeDeg: number;
  /** degrees from north, going east — the project-wide convention */
  azimuthDeg: number;
}

/**
 * The tracker axis a module is carried on, or null when it is on anything
 * else. Resolve this ONCE per module and pass the cheap per-sample sun into
 * `trackerPose`; `panelPose` itself is called in hot loops.
 */
export function trackerAxisFor(
  project: Project,
  panel: PlacedPanel,
  spec: PanelSpec,
  roof: Roof | undefined,
): TrackerAxis | null {
  if (!roof || isSloped(roof)) return null;
  const seg: ArraySegment | undefined = panel.segmentId
    ? project.segments.find((s) => s.id === panel.segmentId)
    : undefined;
  if (!seg || seg.racking.kind !== 'tracker_hsat') return null;
  // The pitch is MEASURED off where the modules stand, never read from the
  // racking's declared field: switching a table to a tracker widens the
  // declared pitch, but until the rows are actually re-spaced they are still
  // where they were — and backtracking computed from a pitch the design does
  // not have would hide the very row-to-row shading it exists to prevent.
  // The energy engine measures it the same way, so the two cannot disagree.
  const centres = project.panels.filter((p) => p.enabled && p.segmentId === seg.id).map((p) => p.center);
  const pitchM = measuredRowPitchM(centres, panel.azimuthDeg) ?? seg.racking.rowPitchM;
  return resolveTrackerAxis({ ...seg.racking, rowPitchM: pitchM }, panelFootprintM(spec, panel.orientation).h, seg.azimuthDeg);
}

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
  /** where the sun is — only a tracker's pose depends on it; omit for its rest position */
  sun?: SunAngles,
  /** the tube this module rides, when the caller already resolved it (hot loops) */
  axis?: TrackerAxis | null,
): PanelPose {
  const sloped = roof ? isSloped(roof) : false;
  const seg = panel.segmentId
    ? project.segments.find((s) => s.id === panel.segmentId)
    : undefined;
  const racking = seg && roof ? resolveRacking(project, roof, seg, spec) : null;
  const foot = panelFootprintM(spec, panel.orientation);
  const d = foot.h;

  // A TRACKER'S plate is where the sun put it. The tube carries the modules'
  // centres, so they turn about the axis without rising or falling — which is
  // why its height below is the tube's, with no tilt term.
  const tube = sun && racking?.kind === 'tracker_hsat' ? (axis ?? trackerAxisFor(project, panel, spec, roof)) : null;
  const tracked = tube && sun ? trackerPose(tube, sun.altitudeDeg, sun.azimuthDeg) : null;
  const tiltRad = tracked ? (tracked.tiltDeg * Math.PI) / 180 : (panel.tiltDeg * Math.PI) / 180;

  // flush on a slope: face down-slope. Tilted on a flat roof: face the panel's
  // OWN azimuth — the same direction the energy engine assumes. Untilted flat
  // panels have no facing; align the footprint to the roof grid.
  const yawRad = tracked
    ? -((tracked.azimuthDeg * Math.PI) / 180)
    : sloped
      ? -((roof!.slopeAzimuthDeg * Math.PI) / 180)
      : panel.tiltDeg > 0
        ? -((panel.azimuthDeg * Math.PI) / 180)
        : ((roof ? roofGridAngle(roof) : 0) * Math.PI) / 180;

  const heightAboveSurfaceM = sloped
    ? FLUSH_STANDOFF_M
    : racking
      ? racking.kind === 'tracker_hsat'
        ? racking.frontLegM + MODULE_STANDOFF_M
        : racking.frontLegM + (d * Math.sin(tiltRad)) / 2 + MODULE_STANDOFF_M
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
