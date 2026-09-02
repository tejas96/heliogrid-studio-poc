// ─── The hourly engine: one typical year, hour by hour, panel by panel ──────
// What PVsyst does and the monthly estimate could not: for each of the 8760
// hours of the site's typical year (PVGIS TMY) and each module —
//   sun position → beam on the plane, Perez sky diffuse (isotropic +
//   circumsolar + horizon band), ground reflection → near shading on the beam
//   and the circumsolar part (the 3D engine's clear fraction for that month
//   and hour) and on the isotropic sky (the skyline's view factor) → incidence-
//   angle loss → soiling → module temperature (Faiman) → power → module
//   quality, mismatch → DC cable → inverter curve → clipping → AC cable.
// Every stage is accumulated so the report can show a PVsyst-style loss
// waterfall in which each line is measured, not assumed. Pure maths; the
// project adapter at the bottom feeds it.
import type { Project } from '../../types';
import { sunPosition } from '../sun';
import { DAYS_IN_MONTH } from '../pvgis';
import { peekShadeProfile } from '../shade-profile-cache';
import { horizonProfile } from '../sun-chart';
import { resolveRacking } from '../structure';
import { acCableLossAtFullLoad, dcCableLossAtStc } from './cable-loss';
import type { TmyYear } from './tmy';

export interface EnginePanel {
  tiltDeg: number;
  /** 0 = north, 90 = east, 180 = south (project-wide convention) */
  azimuthDeg: number;
  pstcW: number;
  /** Faiman heat-loss coefficients: W/m²K and W·s/m³K */
  u0: number;
  u1: number;
  /** beam-clear fraction (0..1) for a calendar month (0..11) and mean solar hour */
  beamAccess: (month: number, solarHour: number) => number;
}

export interface EngineInverter {
  /** nominal AC power of ONE unit, W */
  acW: number;
  count: number;
  /** peak efficiency, 0..1 */
  etaMax: number;
}

export interface EngineInput {
  lat: number;
  lng: number;
  panels: EnginePanel[];
  /** null = no inverter chosen yet: a flat 97% stands in and is listed as assumed */
  inverter: EngineInverter | null;
  /** Pmax temperature coefficient, %/°C (negative) */
  gammaPmaxPct: number;
  /** soiling loss per calendar month, 0..1 */
  soilingByMonth: number[];
  lidFrac: number;
  mismatchFrac: number;
  /** DC cable loss at STC current, 0..1 (scales with the load) */
  dcOhmicStcFrac: number;
  acOhmicFrac: number;
  albedo: number;
  /** isotropic sky-view factor of the array (1 = open sky) */
  skyView: number;
}

export interface HourlyLoss {
  key: string;
  label: string;
  pct: number;
}

export interface HourlyResult {
  annualKwh: number;
  monthlyKwh: number[];
  /** kWh/m²/yr on the horizontal, and in the modules' planes unshaded (capacity-weighted) */
  ghiKwhM2: number;
  poaKwhM2: number;
  transpositionGainPct: number;
  dcKwh: number;
  clippedKwh: number;
  clippingHours: number;
  /** PVsyst definition: E_ac / (P_nom × H_poa) */
  prPct: number;
  losses: HourlyLoss[];
}

// ── Perez (1990) all-sites composite coefficients, by sky-clearness bin ──
const PEREZ_EPS = [1.065, 1.23, 1.5, 1.95, 2.8, 4.5, 6.2, Infinity];
const F11 = [-0.008, 0.13, 0.33, 0.568, 0.873, 1.132, 1.06, 0.678];
const F12 = [0.588, 0.683, 0.487, 0.187, -0.392, -1.237, -1.6, -0.327];
const F13 = [-0.062, -0.151, -0.221, -0.295, -0.362, -0.412, -0.359, -0.25];
const F21 = [-0.06, -0.019, 0.055, 0.109, 0.226, 0.288, 0.264, 0.156];
const F22 = [0.072, 0.066, -0.064, -0.152, -0.462, -0.823, -1.127, -1.377];
const F23 = [-0.022, -0.029, -0.026, -0.014, 0.001, 0.056, 0.131, 0.251];
const KAPPA = 1.041;
const SOLAR_CONSTANT = 1367;
const COS_85 = Math.cos((85 * Math.PI) / 180);
/** ASHRAE incidence-angle modifier constant (glass, no AR coating) */
const IAM_B0 = 0.05;
const IAM_DIFFUSE = 0.95;
const IAM_GROUND = 0.9;
/** the typical year's calendar has 365 days; any non-leap year serves */
const CALENDAR_YEAR = 2019;
/**
 * Crystalline silicon converts less efficiently in weak light (Huld et al.
 * 2011, the model PVGIS runs): relative efficiency = 1 + k1·ln G' + k2·ln² G'
 * with G' the irradiance as a fraction of 1000 W/m². At 200 W/m² that is
 * −13%, at 500 W/m² −3%, at 1000 W/m² nothing — worth 2–4% over a year.
 */
const LOW_LIGHT_K1 = -0.017162;
const LOW_LIGHT_K2 = -0.040289;

export function lowLightEfficiency(irradianceWm2: number): number {
  if (irradianceWm2 <= 1) return 0;
  const g = Math.min(1.2, irradianceWm2 / 1000);
  const ln = Math.log(g);
  return Math.max(0, 1 + LOW_LIGHT_K1 * ln + LOW_LIGHT_K2 * ln * ln);
}

/** Relative air mass (Kasten & Young 1989); zenith in radians. */
export function airMass(zenithRad: number): number {
  const zDeg = (zenithRad * 180) / Math.PI;
  if (zDeg >= 90) return 40;
  return 1 / (Math.cos(zenithRad) + 0.50572 * Math.pow(96.07995 - zDeg, -1.6364));
}

/** Generic inverter efficiency curve as a factor on the peak, by load ratio. */
export function inverterCurve(loadRatio: number): number {
  const pts: [number, number][] = [
    [0, 0],
    [0.05, 0.8],
    [0.1, 0.94],
    [0.2, 0.98],
    [0.3, 0.99],
    [0.5, 1],
    [0.75, 1],
    [1, 0.995],
    [1.5, 0.99],
  ];
  if (loadRatio <= 0) return 0;
  if (loadRatio >= 1.5) return 0.99;
  for (let i = 1; i < pts.length; i++) {
    if (loadRatio <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (loadRatio - x0)) / (x1 - x0);
    }
  }
  return 0.99;
}

function monthOfDay(doy: number): number {
  let d = doy;
  for (let m = 0; m < 12; m++) {
    if (d < DAYS_IN_MONTH[m]) return m;
    d -= DAYS_IN_MONTH[m];
  }
  return 11;
}

/** One typical year through the whole chain. */
export function hourlyEnergyCore(input: EngineInput, tmy: TmyYear): HourlyResult {
  const { lat, lng, panels } = input;
  const pstcTotal = panels.reduce((s, p) => s + p.pstcW, 0);
  const monthlyWh = new Array<number>(12).fill(0);
  // stage accumulators, W·h over the year, summed over modules
  let eGhi = 0; // horizontal reference
  let ePoa = 0; // in-plane, unshaded
  let eShaded = 0;
  let eIam = 0;
  let eSoiled = 0;
  let eLowLight = 0;
  let eTemp = 0;
  let eLid = 0;
  let eMismatch = 0;
  let eDcOhm = 0;
  let eInv = 0;
  let eClip = 0;
  let eAc = 0;
  let clippedWh = 0;
  let clippingHours = 0;

  // plane normals (scene frame: x east, y up, z = −north), per module
  const normals = panels.map((p) => {
    const t = (p.tiltDeg * Math.PI) / 180;
    const a = (p.azimuthDeg * Math.PI) / 180;
    return {
      nx: Math.sin(t) * Math.sin(a),
      ny: Math.cos(t),
      nz: -Math.sin(t) * Math.cos(a),
      cosTilt: Math.cos(t),
      sinTilt: Math.sin(t),
    };
  });
  const yearStartMs = Date.UTC(CALENDAR_YEAR, 0, 1);
  const inv = input.inverter;
  const dcOhmStc = input.dcOhmicStcFrac;

  for (let h = 0; h < tmy.ghi.length; h++) {
    const ghi = tmy.ghi[h];
    const dni = tmy.dni[h];
    const dhi = tmy.dhi[h];
    if (ghi <= 0 && dni <= 0 && dhi <= 0) continue;
    const doy = Math.floor(h / 24);
    const hod = h % 24;
    const month = monthOfDay(doy);
    const sun = sunPosition(new Date(yearStartMs + (doy * 24 + hod + tmy.timeOffsetH) * 3_600_000), lat, lng);
    if (sun.altitude <= 0) continue;
    const alt = sun.altitude;
    const z = Math.PI / 2 - alt;
    const cosZ = Math.sin(alt);
    const sx = Math.cos(alt) * Math.sin(sun.azimuth);
    const sy = Math.sin(alt);
    const sz = -Math.cos(alt) * Math.cos(sun.azimuth);
    // Perez sky-clearness and brightness for this hour
    let F1 = 0;
    let F2 = 0;
    if (dhi > 0) {
      const z3 = KAPPA * z * z * z;
      const eps = ((dhi + dni) / dhi + z3) / (1 + z3);
      const i0n = SOLAR_CONSTANT * (1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365));
      const delta = (dhi * airMass(z)) / i0n;
      let bin = 0;
      while (bin < 7 && eps > PEREZ_EPS[bin]) bin++;
      F1 = Math.max(0, F11[bin] + F12[bin] * delta + F13[bin] * z);
      F2 = F21[bin] + F22[bin] * delta + F23[bin] * z;
    }
    const b = Math.max(COS_85, cosZ);
    let solarHour = hod + tmy.timeOffsetH + lng / 15;
    solarHour = ((solarHour % 24) + 24) % 24;
    const tair = tmy.tair[h];
    const wind = tmy.wind[h];
    const soil = 1 - (input.soilingByMonth[month] ?? 0);

    let dcWh = 0;
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      const n = normals[i];
      const cosTheta = Math.max(0, n.nx * sx + n.ny * sy + n.nz * sz);
      const beam = dni * cosTheta;
      const iso = dhi * (1 - F1) * ((1 + n.cosTilt) / 2);
      const circ = dhi * F1 * (cosTheta / b);
      const hor = dhi * F2 * n.sinTilt;
      const ground = input.albedo * ghi * ((1 - n.cosTilt) / 2);
      const poaUnshaded = beam + iso + circ + hor + ground;
      const access = p.beamAccess(month, solarHour);
      const poaShaded = beam * access + iso * input.skyView + circ * access + hor + ground;
      const iamB = cosTheta > 0 ? Math.max(0, 1 - IAM_B0 * (1 / cosTheta - 1)) : 0;
      const poaEff =
        beam * access * iamB + (iso * input.skyView + circ * access + hor) * IAM_DIFFUSE + ground * IAM_GROUND;
      const poaSoiled = poaEff * soil;
      const pLow = ((p.pstcW * poaSoiled) / 1000) * lowLightEfficiency(poaSoiled);
      const tModule = tair + poaShaded / (p.u0 + p.u1 * wind);
      const tempFactor = 1 + (input.gammaPmaxPct / 100) * (tModule - 25);
      const pTemp = pLow * tempFactor;
      const pLid = pTemp * (1 - input.lidFrac);
      const pMis = pLid * (1 - input.mismatchFrac);
      eGhi += (p.pstcW * ghi) / 1000;
      ePoa += (p.pstcW * poaUnshaded) / 1000;
      eShaded += (p.pstcW * poaShaded) / 1000;
      eIam += (p.pstcW * poaEff) / 1000;
      eSoiled += (p.pstcW * poaSoiled) / 1000;
      eLowLight += pLow;
      eTemp += pTemp;
      eLid += pLid;
      eMismatch += pMis;
      dcWh += pMis;
    }
    if (dcWh <= 0) continue;
    // DC cable: I²R scales with the square of the current — as a fraction, with the load
    const dcAfterOhm = dcWh * (1 - dcOhmStc * Math.min(1.5, pstcTotal > 0 ? dcWh / pstcTotal : 0));
    eDcOhm += dcAfterOhm;
    let acWh: number;
    if (inv) {
      const perInv = dcAfterOhm / inv.count;
      const eta = inverterCurve(perInv / inv.acW) * inv.etaMax;
      const acRaw = perInv * eta;
      const acCap = Math.min(acRaw, inv.acW);
      eInv += acRaw * inv.count;
      if (acRaw > inv.acW) {
        clippedWh += (acRaw - inv.acW) * inv.count;
        clippingHours++;
      }
      acWh = acCap * inv.count;
    } else {
      acWh = dcAfterOhm * 0.97;
      eInv += acWh;
    }
    eClip += acWh;
    // AC cable: I²R again — the full-load fraction scales with the load
    const acLoad = inv ? Math.min(1.5, acWh / (inv.acW * inv.count)) : 1;
    const acFinal = acWh * (1 - input.acOhmicFrac * acLoad);
    eAc += acFinal;
    monthlyWh[month] += acFinal;
  }

  const pct = (before: number, after: number) => (before > 0 ? Math.round((1 - after / before) * 1000) / 10 : 0);
  const losses: HourlyLoss[] = [
    { key: 'shading', label: 'Shading (near: beam + sky view)', pct: pct(ePoa, eShaded) },
    { key: 'iam', label: 'Incidence angle (IAM)', pct: pct(eShaded, eIam) },
    { key: 'soiling', label: 'Soiling', pct: pct(eIam, eSoiled) },
    { key: 'low_light', label: 'Low-light efficiency', pct: pct(eSoiled, eLowLight) },
    { key: 'temperature', label: 'Temperature', pct: pct(eLowLight, eTemp) },
    { key: 'lid', label: 'Module quality / LID', pct: pct(eTemp, eLid) },
    { key: 'mismatch', label: 'Mismatch', pct: pct(eLid, eMismatch) },
    { key: 'dc_wiring', label: 'DC wiring', pct: pct(eMismatch, eDcOhm) },
    { key: 'inverter', label: 'Inverter', pct: pct(eDcOhm, eInv) },
    { key: 'clipping', label: 'Inverter clipping', pct: pct(eInv, eClip) },
    { key: 'ac_wiring', label: 'AC wiring', pct: pct(eClip, eAc) },
  ];
  const kWp = pstcTotal / 1000;
  const poaKwhM2 = kWp > 0 ? ePoa / 1000 / kWp : 0;
  const ghiKwhM2 = kWp > 0 ? eGhi / 1000 / kWp : 0;
  return {
    annualKwh: eAc / 1000,
    monthlyKwh: monthlyWh.map((v) => Math.round(v / 1000)),
    ghiKwhM2: Math.round(ghiKwhM2),
    poaKwhM2: Math.round(poaKwhM2),
    transpositionGainPct: eGhi > 0 ? Math.round((ePoa / eGhi - 1) * 1000) / 10 : 0,
    dcKwh: Math.round(eMismatch / 1000),
    clippedKwh: Math.round(clippedWh / 1000),
    clippingHours,
    prPct: poaKwhM2 > 0 && kWp > 0 ? Math.round((eAc / 1000 / (kWp * poaKwhM2)) * 1000) / 10 : 0,
    losses,
  };
}

// ── Project adapter ──────────────────────────────────────────────────────────

/** Faiman coefficients by mounting: a flush module runs hotter than an elevated one. */
const U_ELEVATED = { u0: 25, u1: 6.84 };
const U_FLUSH = { u0: 20, u1: 4 };
const GAMMA_DEFAULT_PCT = -0.35;
/** June–September: the rain keeps the glass clean */
const SOILING_MONSOON = 0.01;
const SOILING_DRY = 0.03;
const MONSOON = new Set([5, 6, 7, 8]);

export interface HourlyProjectResult extends HourlyResult {
  assumed: string[];
}

/** The isotropic sky the array sees, from its own skyline (neighbours, obstructions). */
function skyViewFactor(project: Project): number {
  if (project.roofs.length === 0) return 1;
  const prof = horizonProfile(project, 5, 'centre');
  const n = prof.elevDeg.length;
  if (n === 0) return 1;
  let blocked = 0;
  for (const e of prof.elevDeg) blocked += Math.sin((Math.max(0, e) * Math.PI) / 180);
  return Math.max(0.3, 1 - blocked / n);
}

/** The 3D engine's per-module beam access for each sampled (month, solar hour), or the annual mean. */
function beamAccessFor(project: Project): (panelId: string, fallback: number) => (m: number, h: number) => number {
  const profile = peekShadeProfile(project.derived.solarAccessFp);
  if (!profile) return (_id, fallback) => () => fallback;
  // per month: the sampled solar hours in order, with their sample indices
  const byMonth: { hours: number[]; idx: number[] }[] = Array.from({ length: 12 }, () => ({ hours: [], idx: [] }));
  profile.samples.forEach((s, i) => {
    byMonth[s.month].hours.push(s.hour);
    byMonth[s.month].idx.push(i);
  });
  return (panelId, fallback) => {
    const row = profile.bySample.get(panelId);
    if (!row) return () => fallback;
    return (m, h) => {
      const bm = byMonth[m];
      if (bm.hours.length === 0) return fallback;
      // nearest sampled hour in that month (the samples step every half hour)
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < bm.hours.length; k++) {
        const d = Math.abs(bm.hours[k] - h);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      return bestD <= 1.01 ? row[bm.idx[best]] : fallback;
    };
  };
}

export function hourlyEnergyForProject(project: Project, tmy: TmyYear): HourlyProjectResult | null {
  const spec = project.components.panel;
  const loc = project.location;
  if (!spec || !loc) return null;
  const enabled = project.panels.filter((p) => p.enabled);
  if (enabled.length === 0) return null;
  const assumed: string[] = [];
  const gamma = spec.tempCoeffPmaxPct ?? GAMMA_DEFAULT_PCT;
  if (spec.tempCoeffPmaxPct === undefined) assumed.push(`Pmax temperature coefficient ${GAMMA_DEFAULT_PCT}%/°C (datasheet value missing)`);
  const access = beamAccessFor(project);
  if (!peekShadeProfile(project.derived.solarAccessFp)) assumed.push('shade by hour not yet run — each module uses its annual mean beam access');

  const panels: EnginePanel[] = enabled.map((p) => {
    const seg = p.segmentId ? project.segments.find((s) => s.id === p.segmentId) : undefined;
    const roof = project.roofs.find((r) => r.id === p.roofId);
    // a flush (coplanar) mount runs hotter than an elevated table
    const kind = (seg?.racking as { kind: string } | undefined)?.kind;
    const flush = kind === 'flush' || (!!seg && !!roof && resolveRacking(project, roof, seg, spec) === null && kind !== undefined && kind !== 'fixed_tilt' && kind !== 'dual_tilt');
    const u = flush ? U_FLUSH : U_ELEVATED;
    return {
      tiltDeg: p.tiltDeg,
      azimuthDeg: p.azimuthDeg,
      pstcW: spec.watt,
      u0: u.u0,
      u1: u.u1,
      beamAccess: access(p.id, p.solarAccess ?? 1),
    };
  });
  const invSpec = project.components.inverter;
  const inverter: EngineInverter | null = invSpec
    ? { acW: invSpec.acKw * 1000, count: Math.max(1, project.components.inverterCount || 1), etaMax: invSpec.efficiencyPct / 100 }
    : null;
  if (!inverter) assumed.push('no inverter chosen — a flat 97% conversion stands in');
  // the wiring: the design's own runs where they exist, the assumed figure where not
  const dc = dcCableLossAtStc(project);
  const ac = acCableLossAtFullLoad(project);
  assumed.push('soiling 3% dry months, 1% in the monsoon', 'module quality / LID 1.5%', 'mismatch 2%');
  if (dc.source === 'assumed') assumed.push('DC wiring 1.5% at full load (no cable runs yet)');
  else if (dc.stringsRouted < dc.strings) assumed.push(`DC wiring 1.5% for the ${dc.strings - dc.stringsRouted} string(s) not routed yet`);
  if (ac.source === 'assumed') assumed.push('AC wiring 0.5% at full load (no AC run yet)');
  assumed.push('ground albedo 0.2');

  const result = hourlyEnergyCore(
    {
      lat: loc.latLng.lat,
      lng: loc.latLng.lng,
      panels,
      inverter,
      gammaPmaxPct: gamma,
      soilingByMonth: Array.from({ length: 12 }, (_, m) => (MONSOON.has(m) ? SOILING_MONSOON : SOILING_DRY)),
      lidFrac: 0.015,
      mismatchFrac: 0.02,
      dcOhmicStcFrac: dc.fraction,
      acOhmicFrac: ac.fraction,
      albedo: 0.2,
      skyView: skyViewFactor(project),
    },
    tmy,
  );
  // the wiring lines say where their figure came from
  const losses = result.losses.map((l) => {
    if (l.key === 'dc_wiring') {
      return {
        ...l,
        label:
          dc.source === 'routes'
            ? `DC wiring — your cable runs (${dc.stringsRouted} string${dc.stringsRouted === 1 ? '' : 's'}, ${dc.conductorM} m of ${dc.mm2} mm² Cu, ${(dc.fraction * 100).toFixed(2)}% at full load)`
            : 'DC wiring — assumed 1.5% at full load',
      };
    }
    if (l.key === 'ac_wiring') {
      return {
        ...l,
        label:
          ac.source === 'routes'
            ? `AC wiring — your ${ac.runs} run${ac.runs === 1 ? '' : 's'} (${(ac.fraction * 100).toFixed(2)}% at full load)`
            : 'AC wiring — assumed 0.5% at full load',
      };
    }
    return l;
  });
  return { ...result, losses, assumed };
}
