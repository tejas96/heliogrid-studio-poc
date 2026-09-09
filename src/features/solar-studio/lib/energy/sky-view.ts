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

/** Isotropic sky-view factor of a horizontal plane under a skyline: cos²β, averaged over azimuth. */
export function skyViewFromSkyline(elevDeg: number[]): number {
  if (elevDeg.length === 0) return 1;
  let sum = 0;
  for (const e of elevDeg) {
    const c = Math.cos((Math.max(0, Math.min(90, e)) * Math.PI) / 180);
    sum += c * c;
  }
  return sum / elevDeg.length;
}

/** How much of the horizon band is still open: a skyline at β hides β / band of it in that direction. */
export function horizonBandView(elevDeg: number[]): number {
  if (elevDeg.length === 0) return 1;
  let sum = 0;
  for (const e of elevDeg) sum += Math.max(0, 1 - Math.max(0, e) / HORIZON_BAND_DEG);
  return sum / elevDeg.length;
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
      out.set(p.id, { skyView: skyViewFromSkyline(sky), horizonView: horizonBandView(sky) });
    }
  } finally {
    disposeGroup(group);
  }
  cache = { key, factors: out };
  return out;
}
