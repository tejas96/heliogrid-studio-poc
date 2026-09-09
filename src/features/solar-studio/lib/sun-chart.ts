// ─── Sun paths and the site's horizon, in numbers ───────────────────────────
// The sun chart PVsyst users know: azimuth across, altitude up, one curve per
// season, hour marks along each curve — and the site's own horizon drawn
// under them: every neighbour, tree and roof obstruction as the elevation
// angle it subtends from the array. Where a sun curve dips below that line
// the array is in shade. All pure maths; the panel only draws it.
import * as THREE from 'three';
import type { PanelSpec, PlacedPanel, Project, XY } from '../types';
import tzLookup from 'tz-lookup';
import { sunPosition } from './sun';
import { simTimeDate } from './sim-time';
import { peekSurroundHeights } from './surround';
import { buildShadowCasters, disposeGroup } from './scene-model';
import { panelSampleHeightM } from './panel-pose';
import { computeEaveRefs, surfaceHeightAt } from './roof-plane';
import { castsAnalyticalShadow } from './capabilities';

const zoneCache = new Map<string, string>();

/** The site's IANA time zone, from an offline table (tz-lookup) — Nepal is +5:45, not IST. */
function siteZone(p: { lat: number; lng: number }): string {
  const key = `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
  let z = zoneCache.get(key);
  if (!z) {
    try {
      z = tzLookup(p.lat, p.lng);
    } catch {
      z = 'Etc/UTC';
    }
    zoneCache.set(key, z);
  }
  return z;
}

/** The zone's offset from UTC in hours at `at` (daylight saving included). */
function zoneOffsetHours(zone: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at);
    const n = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
    const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
    return Math.round(((asUtc - at.getTime()) / 3_600_000) * 4) / 4;
  } catch {
    return 0;
  }
}

/**
 * Mean solar hour at `lng` → the hour the site's clock shows, in the site's
 * own time zone at the simulated date (so summer time is right too).
 */
export function clockHour(solarHour: number, lng: number, lat = 20, at: Date = new Date()): number {
  return solarHour - lng / 15 + zoneOffsetHours(siteZone({ lat, lng }), at);
}

/** What the hours on screen are: the zone's short name (IST, EDT) or its UTC offset. */
export function clockLabel(p: { lat: number; lng: number }, at: Date = new Date()): string {
  const zone = siteZone(p);
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(at)
      .find((x) => x.type === 'timeZoneName')?.value;
    if (name && !/^GMT|^UTC/.test(name)) return name;
  } catch {
    /* fall through to the offset */
  }
  const off = zoneOffsetHours(zone, at);
  const sign = off >= 0 ? '+' : '−';
  const h = Math.floor(Math.abs(off));
  const m = Math.round((Math.abs(off) - h) * 60);
  return `local time (UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''})`;
}

export interface SunSample {
  /** solar hour, e.g. 13.5 */
  hour: number;
  /** compass azimuth, degrees clockwise from north, 0..360 */
  azDeg: number;
  /** altitude, degrees above the horizon */
  altDeg: number;
}

/** The sun's path over one day, from the first to the last sample above the horizon. */
export function sunCurve(lat: number, lng: number, date: Date, stepH = 0.25): SunSample[] {
  const out: SunSample[] = [];
  for (let h = 3; h <= 21; h += stepH) {
    const s = sunPosition(simTimeDate(date, h, lng), lat, lng);
    if (s.altitude <= 0) continue;
    const az = ((s.azimuth * 180) / Math.PI + 360) % 360;
    out.push({ hour: Math.round(h * 100) / 100, azDeg: az, altDeg: (s.altitude * 180) / Math.PI });
  }
  return out;
}

/** The three days that bound the year: summer and winter solstice, equinox. */
export function seasonDates(year: number): { label: string; date: Date }[] {
  return [
    { label: '21 Jun', date: new Date(year, 5, 21, 12) },
    { label: '21 Mar / 23 Sep', date: new Date(year, 2, 21, 12) },
    { label: '21 Dec', date: new Date(year, 11, 21, 12) },
  ];
}

/** azimuth → the horizon's elevation angle (degrees), `stepDeg` apart, from north clockwise */
export interface HorizonProfile {
  stepDeg: number;
  /** length = 360 / stepDeg */
  elevDeg: number[];
  /** what was in the picture — the shading engine's own caster set */
  sources: {
    surround: boolean;
    obstructions: number;
    otherRoofs: number;
    parapets: number;
    masts: number;
    /** other modules (row in front) — 0 when nothing is placed */
    modules: number;
  };
}

/** Where a skyline is measured from, and which module it is — its own plate is not a blocker. */
export interface SkyEye {
  origin: THREE.Vector3;
  ownPanelId: string | null;
}

/** One eye of the chart's profile: a SkyEye that also knows its roof. */
interface Eye extends SkyEye {
  roofId: string | null;
}

/** The chart's skyline search: 2° steps down from the zenith, bisected three times to 0.25°. */
const CHART_SCAN = { scanDeg: 2, refine: 3 };

/**
 * The shading engine's ray origin for a module: on its glass, at its real
 * mounting height (the centre point of lib/shading's panelRayOrigins) — NOT
 * a fixed 1.2 m above the deck, which looked over every parapet.
 */
export function moduleRayEye(
  project: Project,
  panel: PlacedPanel,
  spec: PanelSpec | null,
  eaveRefs: Map<string, number>,
): SkyEye {
  const roof = project.roofs.find((r) => r.id === panel.roofId);
  const surfaceY = roof ? surfaceHeightAt(roof, panel.center, eaveRefs.get(roof.id)) : 3;
  const y = surfaceY + panelSampleHeightM(project, panel, spec, roof, surfaceY);
  return { origin: new THREE.Vector3(panel.center.x, y, -panel.center.y), ownPanelId: panel.id };
}

/**
 * One eye's skyline against a caster set: per compass azimuth (`stepDeg`
 * apart, from north clockwise), the highest elevation at which a ray from the
 * eye still hits a caster — a scan down from the zenith in `scanDeg` steps to
 * the first hit, then `refine` bisections of the last clear step. Shared by
 * the chart and the diffuse sky-view factors (lib/energy/sky-view), so the
 * picture and the number are the same rays.
 */
export function skylineOf(
  meshes: THREE.Object3D[],
  eye: SkyEye,
  stepDeg: number,
  /** compass → image frame (the calibration's north offset), radians */
  northOffsetRad: number,
  scan: { scanDeg: number; refine: number } = CHART_SCAN,
): number[] {
  const n = Math.round(360 / stepDeg);
  const elev = new Array<number>(n).fill(0);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 250; // as lib/shading
  const dir = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const az = ((i * stepDeg) * Math.PI) / 180 + northOffsetRad;
    const sinAz = Math.sin(az);
    const cosAz = Math.cos(az);
    // scene frame: x = east, y = up, z = −north (plan y)
    const blocked = (elevDeg: number): boolean => {
      const e = (elevDeg * Math.PI) / 180;
      dir.set(sinAz * Math.cos(e), Math.sin(e), -cosAz * Math.cos(e));
      raycaster.set(eye.origin, dir);
      // the eye's own plate lies across low rays uphill of it: incidence, not
      // shade — the same self-exclusion the engine applies, by id
      return raycaster.intersectObjects(meshes, false).some((h) => h.object.userData.panelId !== eye.ownPanelId);
    };
    let hi = -1;
    for (let e = 90 - scan.scanDeg; e >= 0; e -= scan.scanDeg) {
      if (blocked(e)) {
        hi = e;
        break;
      }
    }
    if (hi < 0) continue;
    let lo = hi;
    let clear = hi + scan.scanDeg;
    for (let k = 0; k < scan.refine; k++) {
      const mid = (lo + clear) / 2;
      if (blocked(mid)) lo = mid;
      else clear = mid;
    }
    elev[i] = Math.max(0, Math.min(89, lo));
  }
  return elev;
}

/**
 * The horizon as the array sees it, in every compass direction. A long array
 * has a different skyline at each end, so the profile is the WORST case over
 * its eyes — the module nearest the array's centre, or its four extreme
 * modules — each at the exact point the shading engine's rays leave from.
 * Plan geometry is in the image frame; compass azimuths are turned by the
 * calibration's north offset.
 *
 * WHY A RAYCAST, NOT A LIST OF SHAPES. This used to build its skyline from
 * three sources of its own — a march across the height map, the other roofs
 * as blocks, and obstructions as boxes — while the beam engine raycasts the
 * group lib/scene-model assembles, which also holds every PARAPET ring and
 * every lightning MAST. A 1.2 m RCC parapet is the commonest shading object
 * on an Indian roof, and the chart said "clear sky all day" over an edge the
 * module figures beside it were deducting for. The eye also sat 1.2 m above
 * the deck, looking over parapets the module plane looks into. Now the chart
 * and the engine read the SAME group from the SAME height, so they cannot
 * disagree about what exists; the only thing left out is the guardrail, and
 * deliberately (see `rail` below).
 */
export function horizonProfile(
  project: Project,
  stepDeg = 3,
  /** 'centre': the array as a whole (matches the engine's average); 'corners': the worst of its four extreme modules */
  eyeMode: 'centre' | 'corners' = 'centre',
  opts: {
    /**
     * Count the array's OTHER modules as skyline. Off for the chart: a row is
     * not the site's horizon, and its shade is already in every module figure
     * (Tier-2). On for a sky-view factor, where the row in front really does
     * hide part of the diffuse sky from the module behind it.
     */
    includeModules?: boolean;
  } = {},
): HorizonProfile {
  const n = Math.round(360 / stepDeg);
  const elev = new Array<number>(n).fill(0);
  const panels = project.panels.filter((p) => p.enabled);
  const roofOf = (id: string) => project.roofs.find((r) => r.id === id);
  const eaveRefs = computeEaveRefs(project.roofs);
  const spec = project.components?.panel ?? null;
  const sources = {
    surround: false,
    obstructions: project.obstructions.filter(castsAnalyticalShadow).length,
    otherRoofs: 0,
    parapets: project.roofs.filter((r) => r.parapet?.enabled && r.polygon.length >= 3).length,
    masts: (project.arresters ?? []).length,
    modules: opts.includeModules ? Math.max(0, panels.length - 1) : 0,
  };

  const eyeOf = (p: PlacedPanel): Eye => ({ ...moduleRayEye(project, p, spec, eaveRefs), roofId: roofOf(p.roofId)?.id ?? null });

  // eyes: the module nearest the array's centre, or its four corners, or the
  // first roof's centroid when nothing is placed yet. A corner module can see
  // a neighbour at 50° that the array's middle sees at 15° — both are true,
  // for different modules, so the chart shows both and says which is which.
  const eyes: Eye[] = [];
  if (panels.length) {
    if (eyeMode === 'centre') {
      const cx = panels.reduce((a, p) => a + p.center.x, 0) / panels.length;
      const cy = panels.reduce((a, p) => a + p.center.y, 0) / panels.length;
      const d2 = (p: PlacedPanel) => (p.center.x - cx) ** 2 + (p.center.y - cy) ** 2;
      eyes.push(eyeOf(panels.reduce((best, p) => (d2(p) < d2(best) ? p : best), panels[0])));
    } else {
      const far = (score: (p: XY) => number) =>
        panels.reduce((best, p) => (score(p.center) > score(best.center) ? p : best), panels[0]);
      for (const corner of [
        far((p) => p.x + p.y),
        far((p) => p.x - p.y),
        far((p) => -p.x + p.y),
        far((p) => -p.x - p.y),
      ]) {
        eyes.push(eyeOf(corner));
      }
    }
  } else {
    const roof = project.roofs[0];
    if (!roof || roof.polygon.length < 3) return { stepDeg, elevDeg: elev, sources };
    const c = {
      x: roof.polygon.reduce((a, p) => a + p.x, 0) / roof.polygon.length,
      y: roof.polygon.reduce((a, p) => a + p.y, 0) / roof.polygon.length,
    };
    eyes.push({
      origin: new THREE.Vector3(c.x, surfaceHeightAt(roof, c, eaveRefs.get(roof.id)) + 1.2, -c.y),
      ownPanelId: null,
      roofId: roof.id,
    });
  }
  sources.otherRoofs = project.roofs.filter((r) => r.id !== eyes[0].roofId && r.polygon.length >= 3).length;

  const surround = project.ignoreSurround ? null : peekSurroundHeights(project.surround);
  sources.surround = !!surround;
  // THE engine's caster group — roofs, parapets, obstructions, masts, the
  // modules, the real neighbourhood — nothing assembled here by hand
  const { group, meshes: all } = buildShadowCasters(project, { includePanels: !!opts.includeModules, surround });
  // A guardrail is two thin bars in the air. The engine's rays clear or hit a
  // bar and the blocked FRACTION comes out right; a skyline, by definition,
  // is solid below its line, so a bar at 74° would draw a wall to 74° and
  // shade every morning for that corner. Leave rails to the engine.
  const meshes = all.filter((m) => m.userData.casterKind !== 'rail');
  const offset = ((project.calibration?.northOffsetDeg ?? 0) * Math.PI) / 180;

  try {
    // the worst case over the eyes, azimuth by azimuth
    for (const eye of eyes) {
      const sky = skylineOf(meshes, eye, stepDeg, offset, CHART_SCAN);
      for (let i = 0; i < n; i++) if (sky[i] > elev[i]) elev[i] = sky[i];
    }
  } finally {
    disposeGroup(group);
  }
  return { stepDeg, elevDeg: elev, sources };
}

function horizonAt(profile: HorizonProfile, azDeg: number): number {
  const i = Math.round((((azDeg % 360) + 360) % 360) / profile.stepDeg) % profile.elevDeg.length;
  return profile.elevDeg[i];
}

/** The solar hours of a day where the sun is above the horizon but behind the site's skyline. */
export function shadeWindows(curve: SunSample[], profile: HorizonProfile): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let open: number | null = null;
  for (const s of curve) {
    const shaded = s.altDeg < horizonAt(profile, s.azDeg);
    if (shaded && open === null) open = s.hour;
    if (!shaded && open !== null) {
      out.push({ from: open, to: s.hour });
      open = null;
    }
  }
  if (open !== null && curve.length) out.push({ from: open, to: curve[curve.length - 1].hour });
  return out;
}
