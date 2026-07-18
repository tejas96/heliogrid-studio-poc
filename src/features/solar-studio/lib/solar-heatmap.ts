// ─── Roof-surface solar-access heatmap: per-month daily sun-hours ───────────
// Samples a grid across every roof polygon and raycasts each point against the
// project's REAL shadow casters (roofs, parapets, casting obstructions) over a
// representative day per month. The value at each cell is the average daily
// sun-hours it receives that month — so obstruction shadows show up as darker
// (fewer-hours) footprints that sweep across the roof as you scrub the year.
// Same raycasting engine as lib/shading.ts, generalized from panels to a grid.
import * as THREE from 'three';
import type { Project, Roof, XY } from '../types';
import { pointInPolygon, polygonArea, rotate } from './geo';
import { computeEaveRefs, surfaceHeightAt } from './roof-plane';
import { roofGridAngle } from './layout';
import { activeWeather, solarHourDate, sunPosition } from './solar';
import { DIFFUSE_SHARE, poaBeamRatio } from './poa';
import { DAYS_IN_MONTH } from './pvgis';
import { buildShadowCasters, disposeGroup } from './scene-model';

export interface HeatCell {
  /** flat render position on the ground plane: (planX, 0.05, -planY) */
  world: [number, number, number];
  /** roof grid angle so the square cell aligns to roof edges */
  yawRad: number;
  /** solar-access fraction ∈ [floor, 1] per month (drives colour & %) */
  monthly: number[];
  /** absolute irradiation received on this cell, kWh/m²·month — only with weather */
  monthlyKwhReceived?: number[];
}

export interface HeatmapResult {
  cells: HeatCell[];
  stepM: number;
  /** mean solar-access fraction across all cells, per month (0..1, headline %) */
  monthlyRoofAvg: number[];
  /** mean DIRECT sun-hours/day across all cells, per month (secondary readout) */
  monthlyRoofHours: number[];
  /** mean received irradiation across cells, kWh/m²·month — present only with PVGIS weather */
  monthlyRoofKwh?: number[];
}

export interface HeatCancel {
  aborted: boolean;
}

interface GridPoint {
  plan: XY;
  originY: number;
  yawRad: number;
  /** the roof's orientation, for per-cell plane-of-array transposition */
  pitchDeg: number;
  slopeAzimuthDeg: number;
}

const MONTHS = 12;

/** Qualitative band for a normalised access value (0..1), for the legend. */
export function accessLabel(t01: number): string {
  const t = Math.max(0, Math.min(1, t01));
  if (t < 0.5) return 'Poor';
  if (t < 0.75) return 'Moderate';
  if (t < 0.9) return 'Good';
  return 'Excellent';
}

/** Continuous red→amber→green ramp matching the existing solar-access legend. */
export function heatColor(t01: number): THREE.Color {
  const t = Math.max(0, Math.min(1, t01));
  const lo = new THREE.Color('#dc2626');
  const mid = new THREE.Color('#ca8a04');
  const hi = new THREE.Color('#16a34a');
  return t < 0.5
    ? lo.clone().lerp(mid, t / 0.5)
    : mid.clone().lerp(hi, (t - 0.5) / 0.5);
}

/** Grid angle used to align samples to the roof — the canonical frame. */
function roofAngleDeg(roof: Roof): number {
  return roofGridAngle(roof);
}

/** Sample points inside each roof polygon on a roof-aligned plan grid. */
export function generateHeatGrid(
  project: Project,
  opts: { targetStepM?: number; maxPoints?: number } = {},
): { points: GridPoint[]; stepM: number } {
  const targetStepM = opts.targetStepM ?? 0.5;
  const maxPoints = opts.maxPoints ?? 1800;
  const roofs = project.roofs.filter((r) => r.polygon.length >= 3);
  if (roofs.length === 0) return { points: [], stepM: targetStepM };

  const totalArea = roofs.reduce((s, r) => s + polygonArea(r.polygon), 0);
  const eaveRefs = computeEaveRefs(roofs);

  const build = (stepM: number): GridPoint[] => {
    const points: GridPoint[] = [];
    for (const roof of roofs) {
      const angle = roofAngleDeg(roof);
      const local = roof.polygon.map((p) => rotate(p, -angle));
      const minX = Math.min(...local.map((p) => p.x));
      const maxX = Math.max(...local.map((p) => p.x));
      const minY = Math.min(...local.map((p) => p.y));
      const maxY = Math.max(...local.map((p) => p.y));
      const yawRad = (angle * Math.PI) / 180;
      const eave = eaveRefs.get(roof.id);
      for (let y = minY + stepM / 2; y <= maxY; y += stepM) {
        for (let x = minX + stepM / 2; x <= maxX; x += stepM) {
          const plan = rotate({ x, y }, angle);
          if (!pointInPolygon(plan, roof.polygon)) continue;
          points.push({
            plan,
            originY: surfaceHeightAt(roof, plan, eave) + 0.45,
            yawRad,
            pitchDeg: roof.pitchDeg,
            slopeAzimuthDeg: roof.slopeAzimuthDeg,
          });
        }
      }
    }
    return points;
  };

  // start from the finer of the target step and an area-budget step, then one
  // corrective pass if concave shapes still overshoot the point budget
  let stepM = Math.max(targetStepM, Math.sqrt(totalArea / maxPoints));
  let points = build(stepM);
  if (points.length > maxPoints) {
    stepM *= Math.sqrt(points.length / maxPoints);
    points = build(stepM);
  }
  return { points, stepM };
}

interface MonthSample {
  dir: THREE.Vector3;
  dh: number;
  /** beam irradiance proxy on the horizontal: max(0, sin(altitude)) */
  beam: number;
}

/**
 * Sun samples for the 21st of each month, scanned by the site's LOCAL SOLAR
 * time (via longitude) so the result is identical in any viewer timezone.
 * Daytime hours only (altitude > 0), each weighted by beam irradiance.
 */
function buildMonthlySamples(
  lat: number,
  lng: number,
  hourStep: number,
  northOffsetDeg = 0,
): { samples: MonthSample[][]; daylength: number[] } {
  const year = new Date().getFullYear();
  const samples: MonthSample[][] = [];
  const daylength: number[] = [];
  // geometry lives in the IMAGE frame — shift the sun's azimuth by the site
  // calibration's north offset (same convention as lib/shading)
  const offset = (northOffsetDeg * Math.PI) / 180;
  for (let m = 0; m < MONTHS; m++) {
    const list: MonthSample[] = [];
    let hours = 0;
    // full possible daylight window in solar hours; below-horizon culled
    for (let h = 4; h <= 20 + 1e-9; h += hourStep) {
      const s = sunPosition(solarHourDate(year, m, 21, h, lng), lat, lng);
      if (s.altitude <= 0) continue;
      const az = s.azimuth + offset;
      list.push({
        dir: new THREE.Vector3(
          Math.cos(s.altitude) * Math.sin(az),
          Math.sin(s.altitude),
          -Math.cos(s.altitude) * Math.cos(az),
        ),
        dh: hourStep,
        beam: Math.max(0, Math.sin(s.altitude)),
      });
      hours += hourStep;
    }
    samples.push(list);
    daylength.push(hours);
  }
  return { samples, daylength };
}

const defaultYield = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

/**
 * Compute the per-cell, per-month sun-hours heatmap. Chunked across frames so a
 * large grid never freezes the UI; abort via `signal.aborted`.
 */
export async function computeHeatmap(
  project: Project,
  opts: {
    targetStepM?: number;
    maxPoints?: number;
    hourStep?: number;
    batch?: number;
    onProgress?: (done: number, total: number) => void;
    signal?: HeatCancel;
    yieldFn?: () => Promise<void>;
  } = {},
): Promise<HeatmapResult> {
  const hourStep = opts.hourStep ?? 0.5;
  const batch = opts.batch ?? 150;
  const doYield = opts.yieldFn ?? defaultYield;
  const empty: HeatmapResult = {
    cells: [],
    stepM: opts.targetStepM ?? 0.5,
    monthlyRoofAvg: new Array(MONTHS).fill(0),
    monthlyRoofHours: new Array(MONTHS).fill(0),
  };

  const loc = project.location;
  if (!loc || project.roofs.length === 0) return empty;

  const { points, stepM } = generateHeatGrid(project, opts);
  if (points.length === 0) return { ...empty, stepM };

  const lat = loc.latLng.lat;
  const lng = loc.latLng.lng;
  const { samples } = buildMonthlySamples(
    lat,
    lng,
    hourStep,
    project.calibration?.northOffsetDeg ?? 0,
  );
  // total beam energy available per month (denominator for access fraction)
  const beamTotal = samples.map((list) => list.reduce((s, x) => s + x.beam * x.dh, 0));

  // Measured climate (only when fetched for this pin): real monthly diffuse
  // fraction becomes the access floor, and enables the absolute kWh layer.
  const weather = activeWeather(loc);
  const diffuse = weather?.monthlyDiffuseFrac;
  const monthlyGhi = weather?.monthlyGhi;

  const { group, meshes } = buildShadowCasters(project);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 250;
  const origin = new THREE.Vector3();

  const cells: HeatCell[] = points.map((p) => ({
    world: [p.plan.x, 0.05, -p.plan.y],
    yawRad: p.yawRad,
    monthly: new Array(MONTHS).fill(0),
    ...(monthlyGhi ? { monthlyKwhReceived: new Array(MONTHS).fill(0) } : {}),
  }));
  // per-cell direct sun-hours (secondary readout), parallel to cells
  const cellHours: number[][] = points.map(() => new Array(MONTHS).fill(0));
  // beam orientation gain is constant per roof orientation — memoize so we don't
  // recompute (or rebuild poa's cache key) for every one of ~1800 grid cells
  const beamRatioByRoof = new Map<string, number>();
  const beamRatioFor = (pitch: number, az: number): number => {
    const k = `${pitch}|${az}`;
    let v = beamRatioByRoof.get(k);
    if (v === undefined) {
      v = poaBeamRatio(lat, lng, pitch, az);
      beamRatioByRoof.set(k, v);
    }
    return v;
  };

  try {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      origin.set(p.plan.x, p.originY, -p.plan.y);
      const monthly = cells[i].monthly;
      const kwhRow = cells[i].monthlyKwhReceived; // present only with weather
      const hoursRow = cellHours[i];
      // beam orientation gain for this cell's roof (weather path only)
      const beamRatio = monthlyGhi ? beamRatioFor(p.pitchDeg, p.slopeAzimuthDeg) : 0;
      for (let m = 0; m < MONTHS; m++) {
        let beamClear = 0;
        let hrs = 0;
        for (const s of samples[m]) {
          raycaster.set(origin, s.dir);
          if (raycaster.intersectObjects(meshes, false).length === 0) {
            beamClear += s.beam * s.dh;
            hrs += s.dh;
          }
        }
        const beamFrac = beamTotal[m] > 0 ? beamClear / beamTotal[m] : 1;
        // COLOUR/% metric = geometric solar ACCESS (how much direct sun the
        // geometry lets through). It stays on the FIXED diffuse floor so shadow
        // contrast is stable and visible regardless of month/climate — using the
        // real (high-in-monsoon) diffuse fraction here would wash the shadows out.
        monthly[m] = DIFFUSE_SHARE + (1 - DIFFUSE_SHARE) * beamFrac;
        hoursRow[m] = hrs;
        // ENERGY layer uses the REAL monthly diffuse fraction — kWh actually
        // received, single decomposition (no double-blend): diffuse received in
        // full + beam received × orientation gain × unshadowed fraction.
        if (kwhRow && monthlyGhi && diffuse) {
          const kd = Math.min(0.9, Math.max(0, diffuse[m]));
          const hMonth = monthlyGhi[m] * DAYS_IN_MONTH[m]; // kWh/m²·month horizontal
          kwhRow[m] = hMonth * (kd + (1 - kd) * beamRatio * beamFrac);
        }
      }
      if ((i + 1) % batch === 0) {
        opts.onProgress?.(i + 1, points.length);
        if (opts.signal?.aborted) break;
        await doYield();
        if (opts.signal?.aborted) break;
      }
    }
  } finally {
    disposeGroup(group);
  }

  opts.onProgress?.(points.length, points.length);

  const monthlyRoofAvg = new Array(MONTHS).fill(0);
  const monthlyRoofHours = new Array(MONTHS).fill(0);
  const monthlyRoofKwh = monthlyGhi ? new Array(MONTHS).fill(0) : undefined;
  if (cells.length > 0) {
    for (let m = 0; m < MONTHS; m++) {
      let sum = 0;
      let hSum = 0;
      let kSum = 0;
      for (let i = 0; i < cells.length; i++) {
        sum += cells[i].monthly[m];
        hSum += cellHours[i][m];
        if (monthlyRoofKwh) kSum += cells[i].monthlyKwhReceived![m];
      }
      monthlyRoofAvg[m] = sum / cells.length;
      monthlyRoofHours[m] = hSum / cells.length;
      if (monthlyRoofKwh) monthlyRoofKwh[m] = kSum / cells.length;
    }
  }

  return { cells, stepM, monthlyRoofAvg, monthlyRoofHours, monthlyRoofKwh };
}
