// ─── Headless shading engine: per-panel solar access without a renderer ─────
// Raycasts each panel against the project's REAL shadow casters (roofs,
// parapets, casting obstructions, and since Phase 8 the modules themselves)
// across an irradiance-weighted year of sun positions. Runs on plain three.js
// math — no WebGL, no mounted scene — so it can execute after ANY 2D edit and
// keep energy results fresh (audit R3). Decorative context buildings are
// deliberately excluded (audit R6).
//
// ┌───────────────────────────────────────────────────────────────────────────
// │ ENGINEER VALIDATION REQUIRED — before any customer-binding yield guarantee
// │
// │ This module is the SOLE shading authority for the whole product: obstruction
// │ shading AND inter-row self-shading, feeding every panel's solarAccess and
// │ therefore the energy report, the proposal and the financials. Validate it
// │ against a PVsyst (or equivalent) reference layout. It previously carried a
// │ Tier-1 analytical GCR derate whose curve bore this same flag; Tier-2
// │ raycasting replaced that model in Phase 8 — the flag travels with the
// │ physics, not with the file (plan §7, §9 gate 3).
// │
// │ KNOWN MODEL LIMITS a validator must weigh:
// │  · POWER IS LINEAR IN UNSHADED AREA. Real modules have bypass diodes and
// │    sit in series strings: a partially shaded module can lose FAR more than
// │    its shaded fraction, and it drags its string with it. We model neither
// │    the diode cliff nor string mismatch, so partial-shade losses are
// │    OPTIMISTIC. (Inherited from the Tier-1 model; unchanged by Tier-2.)
// │  · 3 sample points along module depth ⇒ partial shade resolves to ~1/3 of
// │    a module; finer detail is averaged away.
// │  · 288 sun samples/year (12 months × the daylight window at 0.5 h) is a
// │    quadrature of the real integral, not the real integral.
// │  · Beam only — the diffuse share is floored in the energy model, so a
// │    fully beam-shaded module still collects diffuse light.
// │  · Obstructions are bounding solids (exact for tanks/boxes, conservative
// │    for trees — a bare canopy shades less than its bounding cylinder).
// │  · Structure members are excluded (their modules overhang them — see
// │    three/StructureInstanced.tsx for the geometric argument and its expiry).
// └───────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { PanelSpec, PlacedPanel, Project, Roof } from '../types';
import { panelPose, panelSampleHeightM } from './panel-pose';
import { solarHourDate, sunPosition } from './solar';
import { buildShadowCasters, disposeGroup } from './scene-model';
import { computeEaveRefs, surfaceHeightAt } from './roof-plane';

/** Sample dates (21st of EVERY month) — full seasonal coverage, aligned with
 *  the heatmap's month set (the old 5-month subset under-weighted shoulders). */
const SAMPLE_MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
/**
 * Solar-hour sampling — DELIBERATELY IDENTICAL to the roof heatmap's
 * (`buildMonthlySamples`): the full daylight window at the same cadence,
 * weighted by the same beam proxy. Phase 4 unified what "access" MEANS
 * (diffuse-floored beam fraction); this unifies what it is measured OVER.
 *
 * The old grid sampled 08:00–17:00 at ~1.5 h with a max(0.05, sinα) weight
 * FLOOR. Two consequences, both wrong in the same direction:
 *   · sunrise→08:00 and 17:00→sunset were invisible to the engine, so a panel
 *     shaded only in the early morning reported 100% access while the scrubbed
 *     scene plainly showed it in shadow — the exact scrub/engine disagreement
 *     this task exists to remove;
 *   · that blind spot is precisely where inter-row shading lives (low sun,
 *     long shadows), so Tier-2 row losses were systematically under-counted.
 * The floor also over-weighted near-horizon sun relative to the heatmap.
 */
const SAMPLE_HOUR_FROM = 4;
const SAMPLE_HOUR_TO = 20;
const SAMPLE_HOUR_STEP = 0.5;

export interface ShadingSample {
  dir: THREE.Vector3;
  weight: number;
}

export function buildSunSamples(
  lat: number,
  lng: number,
  northOffsetDeg = 0,
): ShadingSample[] {
  const samples: ShadingSample[] = [];
  const y = new Date().getFullYear();
  // the traced geometry lives in the IMAGE frame; when true north is rotated
  // northOffsetDeg clockwise from image-up (site calibration), the sun's
  // image-frame azimuth shifts by the same amount
  const offset = (northOffsetDeg * Math.PI) / 180;
  for (const m of SAMPLE_MONTHS) {
    for (let h = SAMPLE_HOUR_FROM; h <= SAMPLE_HOUR_TO + 1e-9; h += SAMPLE_HOUR_STEP) {
      // sample by the site's local solar time (from longitude), not the
      // viewer's clock — TZ-independent, correct for out-of-timezone projects
      const d = solarHourDate(y, m, 21, h, lng);
      const s = sunPosition(d, lat, lng);
      if (s.altitude <= 0) continue; // below the horizon carries no beam
      const az = s.azimuth + offset;
      samples.push({
        dir: new THREE.Vector3(
          Math.cos(s.altitude) * Math.sin(az),
          Math.sin(s.altitude),
          -Math.cos(s.altitude) * Math.cos(az),
        ),
        // beam-irradiance proxy × the hour it stands for — the heatmap's
        // exact quadrature, so the two surfaces integrate the same year
        weight: Math.max(0, Math.sin(s.altitude)) * SAMPLE_HOUR_STEP,
      });
    }
  }
  return samples;
}

/**
 * Ray origins for one module: points ON its real plane (§A0 canonical pose),
 * lifted by RAY_EPS_M off the glass.
 *
 * WHY MORE THAN ONE (Phase 8): with the modules themselves casting (Tier-2),
 * the dominant partial shade is a row shadow sweeping ALONG the module's depth
 * axis. A single centre ray turns that ramp into a step — the back row reads
 * 100% clear until the shadow crosses its midline, then 100% shaded — which
 * both mis-times and mis-sizes the loss. Sampling along depth recovers the
 * fraction of the plate in shadow, which is what the linear-power model wants.
 * Width is sampled at the centre line only: side shading (a chimney beside the
 * array) is not the partial-shade case this budget is for, and each extra point
 * multiplies the whole engine's cost.
 */
const DEPTH_SAMPLE_FRACTIONS = [-0.35, 0, 0.35];

function panelRayOrigins(
  project: Project,
  panel: PlacedPanel,
  spec: PanelSpec | null,
  roof: Roof | undefined,
  surfaceY: number,
): THREE.Vector3[] {
  const baseY = surfaceY + panelSampleHeightM(project, panel, spec, roof, surfaceY);
  if (!spec) return [new THREE.Vector3(panel.center.x, baseY, -panel.center.y)];
  const pose = panelPose(project, panel, spec, roof, surfaceY);
  const sinT = Math.sin(pose.tiltRad);
  const cosT = Math.cos(pose.tiltRad);
  const sinY = Math.sin(pose.yawRad);
  const cosY = Math.cos(pose.yawRad);
  // local depth offset (0,0,t·d) through Rx(−tilt) then Ry(yaw) — the exact
  // transform PanelsInstanced composes, so the points lie on the drawn glass
  return DEPTH_SAMPLE_FRACTIONS.map((f) => {
    const t = f * pose.d;
    return new THREE.Vector3(
      panel.center.x + t * cosT * sinY,
      baseY + t * sinT,
      -panel.center.y + t * cosT * cosY,
    );
  });
}

/**
 * Per-panel solar access ∈ [0,1]: irradiance-weighted fraction of the sampled
 * year during which the panel's plane has a clear line to the sun, averaged
 * over its sample points (partial shade ⇒ fractional access).
 */
export function computeSolarAccess(project: Project): Map<string, number> {
  const access = new Map<string, number>();
  const loc = project.location;
  if (!loc || project.panels.length === 0) return access;

  const samples = buildSunSamples(
    loc.latLng.lat,
    loc.latLng.lng,
    project.calibration?.northOffsetDeg ?? 0,
  );
  if (samples.length === 0) return access;
  const totalW = samples.reduce((s, x) => s + x.weight, 0);

  // Tier-2 (Phase 8): the modules are casters too — row-on-row self-shading is
  // real delivered-energy loss and the scene already draws those shadows.
  const { group, meshes } = buildShadowCasters(project, { includePanels: true });
  const eaveRefs = computeEaveRefs(project.roofs);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 250;

  try {
    const spec = project.components.panel;
    for (const p of project.panels) {
      const roof = project.roofs.find((r) => r.id === p.roofId);
      const surfaceY = roof ? surfaceHeightAt(roof, p.center, eaveRefs.get(roof.id)) : 3;
      const origins = panelRayOrigins(project, p, spec, roof, surfaceY);

      // The module's own outward normal, in the sample frame (x=E, y=up, z=-N).
      const tRad = (p.tiltDeg * Math.PI) / 180;
      const aRad = (p.azimuthDeg * Math.PI) / 180;
      const nx = Math.sin(tRad) * Math.sin(aRad);
      const ny = Math.cos(tRad);
      const nz = -Math.sin(tRad) * Math.cos(aRad);

      let clearW = 0;
      let panelW = 0; // beam-available weight for THIS module
      for (const s of samples) {
        // BEHIND THE PLANE ⇒ no beam on this module at all. The self-exclusion
        // below already says this is incidence rather than shade, but it only
        // excluded the module's own PLATE — its own ROOF solid still swallowed
        // the descending ray and scored the hour as shaded. solar.ts then
        // multiplies by poaBeamRatio, which has ALREADY zeroed these hours, so
        // the same physics was priced twice. Worst on a gable's north face,
        // which this tool produces on every gable.
        if (nx * s.dir.x + ny * s.dir.y + nz * s.dir.z <= 0) continue;
        panelW += s.weight;
        let clearPts = 0;
        for (const origin of origins) {
          raycaster.set(origin, s.dir);
          // SELF-EXCLUSION by id, never by geometry: when the sun is behind a
          // tilted module its own plate lies across the ray. That is not shade
          // — it is incidence, already priced by the POA transposition
          // (poaBeamRatio). Counting it here would derate the same physics twice.
          const hits = raycaster.intersectObjects(meshes, false);
          if (!hits.some((h) => h.object.userData.panelId !== p.id)) clearPts++;
        }
        clearW += (s.weight * clearPts) / origins.length;
      }
      // Denominator is the module's OWN beam-available weight: solarAccess is
      // "of the hours that could light this module, how many are unshaded".
      // Orientation is poaBeamRatio's job, not this metric's.
      access.set(p.id, panelW > 0 ? clearW / panelW : 1);
    }
  } finally {
    disposeGroup(group);
  }
  return access;
}

// ─── Per-panel shade attribution (Phase 8 task 27c) ─────────────────────────

export interface ShadeBlocker {
  kind: 'panel' | 'obstruction' | 'roof' | 'parapet';
  id: string;
  label: string;
  /** share of the panel's ANNUAL beam budget this caster costs, 0..1 */
  lossFrac: number;
}

export interface PanelShadeDetail {
  /** identical definition & value as computeSolarAccess for this panel */
  access: number;
  /** every caster that took beam from it, worst first */
  blockers: ShadeBlocker[];
}

/**
 * Why is THIS panel shaded? Re-runs the panel's own rays and attributes each
 * blocked sample to the caster the ray hit FIRST — the thing physically
 * standing between the module and the sun. Costs one panel's rays (~250), so
 * it runs on demand when the inspector opens; nothing is persisted.
 *
 * Attribution is by nearest hit rather than "all hits": a tank behind a
 * parapet is not what's costing you the sun, and naming it would send the user
 * to move the wrong object.
 */
export function computePanelShadeDetail(
  project: Project,
  panelId: string,
): PanelShadeDetail | null {
  const loc = project.location;
  const panel = project.panels.find((p) => p.id === panelId);
  if (!loc || !panel) return null;
  const samples = buildSunSamples(
    loc.latLng.lat,
    loc.latLng.lng,
    project.calibration?.northOffsetDeg ?? 0,
  );
  if (samples.length === 0) return null;
  const totalW = samples.reduce((s, x) => s + x.weight, 0);

  const { group, meshes } = buildShadowCasters(project, { includePanels: true });
  const eaveRefs = computeEaveRefs(project.roofs);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 250;
  try {
    const spec = project.components.panel;
    const roof = project.roofs.find((r) => r.id === panel.roofId);
    const surfaceY = roof ? surfaceHeightAt(roof, panel.center, eaveRefs.get(roof.id)) : 3;
    const origins = panelRayOrigins(project, panel, spec, roof, surfaceY);
    const lossByCaster = new Map<string, ShadeBlocker>();

    // Same beam-availability rule as computeSolarAccess — the two readouts MUST
    // agree (a parity test enforces it), so the rule lives in both or neither.
    const tRad = (panel.tiltDeg * Math.PI) / 180;
    const aRad = (panel.azimuthDeg * Math.PI) / 180;
    const nx = Math.sin(tRad) * Math.sin(aRad);
    const ny = Math.cos(tRad);
    const nz = -Math.sin(tRad) * Math.cos(aRad);

    let clearW = 0;
    let panelW = 0;
    for (const s of samples) {
      if (nx * s.dir.x + ny * s.dir.y + nz * s.dir.z <= 0) continue;
      panelW += s.weight;
      for (const origin of origins) {
        raycaster.set(origin, s.dir);
        const hit = raycaster
          .intersectObjects(meshes, false)
          .find((h) => h.object.userData.panelId !== panel.id);
        if (!hit) {
          clearW += s.weight / origins.length;
          continue;
        }
        const d = hit.object.userData as {
          casterKind?: ShadeBlocker['kind'];
          casterId?: string;
          casterLabel?: string;
        };
        const key = `${d.casterKind ?? 'roof'}:${d.casterId ?? '?'}`;
        const prev = lossByCaster.get(key);
        // raw weight — normalised once panelW is final (dividing by a running
        // total made early samples count many times over)
        const share = s.weight / origins.length;
        if (prev) prev.lossFrac += share;
        else
          lossByCaster.set(key, {
            kind: d.casterKind ?? 'roof',
            id: d.casterId ?? '',
            label: d.casterLabel ?? 'Structure',
            lossFrac: share,
          });
      }
    }
    const norm = panelW > 0 ? panelW : 1;
    return {
      access: panelW > 0 ? clearW / panelW : 1,
      blockers: [...lossByCaster.values()]
        .map((b) => ({ ...b, lossFrac: b.lossFrac / norm }))
        .sort((a, b) => b.lossFrac - a.lossFrac),
    };
  } finally {
    disposeGroup(group);
  }
}

/** True when any panel's stored access differs materially from `fresh`. */
export function accessChanged(
  project: Project,
  fresh: Map<string, number>,
  tolerance = 0.005,
): boolean {
  return project.panels.some(
    (p) => Math.abs((fresh.get(p.id) ?? 1) - (p.solarAccess ?? 1)) > tolerance,
  );
}
