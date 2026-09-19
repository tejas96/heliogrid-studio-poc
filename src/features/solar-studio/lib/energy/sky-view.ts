// ─── The diffuse sky each module actually sees ──────────────────────────────
//
// Two errors lived in the hourly engine's diffuse half. The sky-view factor
// was 1 − mean(sin β): for a uniform skyline at elevation β the isotropic sky
// a horizontal plane sees is cos²β — at 30° the truth is 0.75, that gave
// 0.50 — with a 0.3 floor under it, so an enclosed courtyard stopped
// responding to its walls at all. And it was ONE number for the whole array,
// taken from the array's centre, so a module hard against a parapet and one
// in the open middle of the deck got identical diffuse. In monsoon India
// diffuse is 50–70% of the resource; this is not a rounding error.
//
// Each module now gets its own skyline, raycast against the shading engine's
// own caster group with the same rays the sun chart draws (lib/sun-chart
// skylineOf), and two factors from it: the isotropic sky view, cos²β averaged
// over azimuth, and the horizon-band view, the share of the Perez horizon
// strip still open. Cached on the shading fingerprint: the rays cost a few
// milliseconds a module and the report is asked for far more often than the
// design changes.
import type { Project } from '../../types';
import { shadingFp } from '../fingerprints';
import { computeEaveRefs } from '../roof-plane';
import { buildShadowCasters, disposeGroup } from '../scene-model';
import { moduleRayEye, skylineOf } from '../sun-chart';
import { peekSurroundHeights } from '../surround';

export interface SkyViewFactors {
  /** the isotropic sky the module sees, 0..1 (1 = open sky) */
  skyView: number;
  /** the share of the Perez horizon band still open, 0..1 */
  horizonView: number;
}

/** Azimuth step of a module's skyline — coarse on purpose: both factors are means over azimuth. */
const SKY_AZ_STEP_DEG = 30;
/** Elevation search of a module's skyline: 6° steps, one bisection ⇒ 3°. */
const SKY_SCAN = { scanDeg: 6, refine: 1 };
/** Perez's horizon brightening lives in a strip this deep above the horizon. */
const HORIZON_BAND_DEG = 6.5;
/** A module farther than this cannot lift a neighbour's skyline by more than ~6°. */
const NEAR_PLATE_M = 8;
/**
 * Tilt from which a module's diffuse view is computed for its REAL plane rather
 * than for a horizontal one.
 *
 * 60° is chosen to catch the vertical case and nothing else. Below it the two
 * treatments agree within a couple of percent; at 90° the horizontal form
 * under-reports diffuse by about a factor of two, because it averages the
 * skyline over the 180° behind the module — which on a facade is the wall.
 */
const PLANE_AWARE_TILT_DEG = 60;

/**
 * The plane a module's diffuse view is measured FOR.
 *
 * Only supplied for a module whose plane is steep enough that treating it as
 * horizontal is not an approximation but an error — see `PLANE_AWARE_TILT_DEG`.
 */
export interface SkyPlane {
  tiltDeg: number;
  azimuthDeg: number;
  /** azimuth spacing of the skyline samples, degrees (sample i is at i·step) */
  azStepDeg: number;
}

/** Elevation steps in the per-azimuth view integral. Coarse: both outputs are means. */
const PLANE_ELEV_STEPS = 45;

/**
 * How much diffuse sky a plane sees from ONE azimuth, above elevation `fromDeg`.
 *
 * ∫ max(0, n·ŝ)·cos θ dθ over the elevations still open in that direction. This
 * is the quantity BOTH factors below are really ratios of, and writing it
 * explicitly is what makes a vertical plane come out right:
 *
 *  - horizontal (tilt 0): the integral is ∫ sinθ cosθ dθ = cos²β / 2, so the
 *    open/total ratio per azimuth is exactly cos²β and the mean over azimuths is
 *    exactly the closed form this file has always used. The generalisation is
 *    not a different model, it is the same one written out.
 *  - vertical (tilt 90): n·ŝ ∝ cos(φ − A), so the 180° BEHIND the plane weigh
 *    nothing at all. That is the whole point. A wall sees half a sky dome, and
 *    the hourly engine's (1 + cos tilt)/2 term already accounts for that half —
 *    averaging the skyline over the full circle as well would count the
 *    building the modules are bolted to as something shading them, and halve a
 *    facade's diffuse a second time.
 */
function planeBinView(
  tiltDeg: number,
  azimuthDeg: number,
  azDeg: number,
  fromDeg: number,
): number {
  const t = (tiltDeg * Math.PI) / 180;
  const c = Math.cos(((azDeg - azimuthDeg) * Math.PI) / 180);
  const ct = Math.cos(t);
  const st = Math.sin(t);
  const lo = (Math.max(0, Math.min(90, fromDeg)) * Math.PI) / 180;
  const dz = (Math.PI / 2 - lo) / PLANE_ELEV_STEPS;
  if (dz <= 0) return 0;
  let sum = 0;
  for (let k = 0; k < PLANE_ELEV_STEPS; k++) {
    const th = lo + (k + 0.5) * dz;
    const v = ct * Math.sin(th) + st * c * Math.cos(th);
    if (v > 0) sum += v * Math.cos(th) * dz;
  }
  return sum;
}

/**
 * Isotropic sky-view factor under a skyline: cos²β averaged over azimuth for a
 * horizontal plane, and the true normal-weighted ratio when a `plane` is given.
 */
export function skyViewFromSkyline(elevDeg: number[], plane?: SkyPlane): number {
  if (elevDeg.length === 0) return 1;
  if (!plane) {
    let sum = 0;
    for (const e of elevDeg) {
      const c = Math.cos((Math.max(0, Math.min(90, e)) * Math.PI) / 180);
      sum += c * c;
    }
    return sum / elevDeg.length;
  }
  let open = 0;
  let total = 0;
  for (let i = 0; i < elevDeg.length; i++) {
    const az = i * plane.azStepDeg;
    total += planeBinView(plane.tiltDeg, plane.azimuthDeg, az, 0);
    open += planeBinView(plane.tiltDeg, plane.azimuthDeg, az, elevDeg[i]);
  }
  return total > 0 ? Math.min(1, open / total) : 1;
}

/**
 * How much of the horizon band is still open: a skyline at β hides β / band of
 * it in that direction. With a `plane`, each azimuth is weighted by how much of
 * that plane's view comes from it — so the band behind a wall is not averaged in.
 */
export function horizonBandView(elevDeg: number[], plane?: SkyPlane): number {
  if (elevDeg.length === 0) return 1;
  if (!plane) {
    let sum = 0;
    for (const e of elevDeg) sum += Math.max(0, 1 - Math.max(0, e) / HORIZON_BAND_DEG);
    return sum / elevDeg.length;
  }
  let num = 0;
  let den = 0;
  for (let i = 0; i < elevDeg.length; i++) {
    const w = planeBinView(plane.tiltDeg, plane.azimuthDeg, i * plane.azStepDeg, 0);
    den += w;
    num += w * Math.max(0, 1 - Math.max(0, elevDeg[i]) / HORIZON_BAND_DEG);
  }
  return den > 0 ? num / den : 1;
}

let cache: { key: string; factors: Map<string, SkyViewFactors> } | null = null;

/**
 * Sky-view and horizon-band factors for every enabled module, by id. Empty
 * when there is nothing to see from (no site, no roof, no module).
 */
export function moduleSkyViews(project: Project): Map<string, SkyViewFactors> {
  const out = new Map<string, SkyViewFactors>();
  const enabled = project.panels.filter((p) => p.enabled);
  if (!project.location || enabled.length === 0 || project.roofs.length === 0) return out;
  const surround = project.ignoreSurround ? null : peekSurroundHeights(project.surround);
  // the grid may land on this thread after the first report — it is part of the key
  const key = `${shadingFp(project)}|grid:${surround ? 1 : 0}`;
  if (cache && cache.key === key) return cache.factors;

  const spec = project.components?.panel ?? null;
  const eaveRefs = computeEaveRefs(project.roofs);
  const offset = ((project.calibration?.northOffsetDeg ?? 0) * Math.PI) / 180;
  const { group, meshes, panelPlates } = buildShadowCasters(project, { includePanels: true, surround });
  try {
    // rails are left to the beam engine, as in the chart: a skyline is solid
    // below its line and a guardrail is not
    const fixed = meshes.filter((m) => m.userData.casterKind !== 'rail' && m.userData.casterKind !== 'panel');
    const plates = [...panelPlates.entries()];
    for (const p of enabled) {
      const eye = moduleRayEye(project, p, spec, eaveRefs);
      // the row in front hides sky from the module behind it; a table across
      // the deck does not — keep each module's ray budget small
      const near = plates
        .filter(([id, m]) => id !== p.id && Math.hypot(m.position.x - eye.origin.x, m.position.z - eye.origin.z) <= NEAR_PLATE_M)
        .map(([, m]) => m);
      const sky = skylineOf([...fixed, ...near], eye, SKY_AZ_STEP_DEG, offset, SKY_SCAN);
      // A module STEEP enough that "what would a horizontal plane see?" is no
      // longer an approximation gets the real normal-weighted answer. Applied by
      // tilt and not by roof type on purpose — it is a property of the plane, so
      // any future steep surface inherits it without being listed.
      //
      // Deliberately NOT applied to ordinary rooftop tilts. At 10–20° the two
      // agree closely, and switching them over would move the stored energy
      // figure of every project in the system inside a slice about facades.
      // That is a change worth making on its own, with its own verification.
      const plane =
        p.tiltDeg >= PLANE_AWARE_TILT_DEG
          ? { tiltDeg: p.tiltDeg, azimuthDeg: p.azimuthDeg, azStepDeg: SKY_AZ_STEP_DEG }
          : undefined;
      out.set(p.id, {
        skyView: skyViewFromSkyline(sky, plane),
        horizonView: horizonBandView(sky, plane),
      });
    }
  } finally {
    disposeGroup(group);
  }
  cache = { key, factors: out };
  return out;
}
