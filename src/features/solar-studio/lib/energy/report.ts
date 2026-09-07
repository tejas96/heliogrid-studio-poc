// ─── The project's energy report, and the numbers split out of it ───────────
//
// This is the TOP of the energy stack. It drives the hourly engine when the
// site's typical year is in memory, falls back to the monthly estimate when it
// is not, and then splits that one annual figure per panel and per shadow
// caster. Everything here answers a question about the WHOLE project.
//
// It used to live in lib/solar.ts. That put the top of the stack inside a module
// that is otherwise low-level sun and loss math — a module `spacing`, `sim-time`
// and `poa` all sit underneath — so solar.ts and string-shade.ts imported each
// other and the whole energy engine hung below the geometry layer. Splitting it
// out is what made lib/ acyclic.
//
// ONE MODEL, NOT THREE: panelEnergyShares and casterCost are SPLITS of
// computeEnergyReport's annual figure, never second opinions about it. Their
// totals are fixed to the report by construction, so the on-panel card, the
// caster tooltip, the proposal and the quote can never quote figures that
// disagree.
import type { EnergyReport, LossItem, Project, SiteWeather } from '../../types';
import { DIFFUSE_SHARE, poaFactor, poaBeamRatio } from '../poa';
import { DAYS_IN_MONTH } from '../pvgis';
import { roofsUnionAreaM2 } from '../roof-topology';
import {
  MONSOON_MONTHS,
  activeWeather,
  composeLosses,
  equipmentLosses,
} from '../solar';
import { electricalShadingLossPct, meanDiffuse, profileFor } from '../string-shade';
import { peekTmy } from './tmy';
import { hourlyEnergyForProject } from './hourly';

/** Monthly shape for Indian sites; monsoon dip Jun–Sep. */
const MONTH_FACTORS = [
  0.95, 1.0, 1.12, 1.13, 1.15, 0.88, 0.78, 0.8, 0.86, 1.02, 0.98, 0.93,
];

/**
 * The model's own uncertainty on a year-1 figure, one standard deviation, %:
 * irradiance data ±3, transposition and losses ±3, shading ±2 — combined in
 * quadrature ≈ 4.7. ASSUMED until the PVsyst comparison (Batch C) pins it.
 */
const MODEL_SIGMA_PCT = 5;
/** the year-to-year spread assumed where the climate record is missing, % */
const INTERANNUAL_ASSUMED_PCT = 5;

/**
 * P50/P75/P90/P99 for a year-1 figure: the site's year-to-year irradiation
 * spread (measured from the PVGIS record) combined with the model's own
 * uncertainty, the bankable convention. Energy scales with irradiation to
 * first order, so the irradiation spread IS the energy spread.
 */
function uncertaintyFor(
  annualKwh: number,
  weather: SiteWeather | undefined,
): EnergyReport['uncertainty'] {
  const yrs = weather?.annualGhiByYear;
  let interannual = INTERANNUAL_ASSUMED_PCT;
  let years = 0;
  if (yrs && yrs.length >= 3) {
    const mean = yrs.reduce((s, v) => s + v, 0) / yrs.length;
    const sd = Math.sqrt(yrs.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (yrs.length - 1));
    interannual = mean > 0 ? (sd / mean) * 100 : INTERANNUAL_ASSUMED_PCT;
    years = yrs.length;
  }
  const sigma = Math.hypot(interannual, MODEL_SIGMA_PCT);
  const at = (k: number) => Math.round(annualKwh * (1 - (k * sigma) / 100));
  return {
    p50Kwh: Math.round(annualKwh),
    p75Kwh: at(0.6745),
    p90Kwh: at(1.2816),
    p99Kwh: at(2.326),
    sigmaPct: Math.round(sigma * 10) / 10,
    interannualPct: Math.round(interannual * 10) / 10,
    modelPct: MODEL_SIGMA_PCT,
    yearsOfRecord: years,
  };
}

/** 25-year energy with a fixed yearly degradation, from a first-year figure. */
function lifetimeFrom(annualKwh: number, degradation: number) {
  let lifetime = 0;
  let yearOut = annualKwh;
  for (let y = 0; y < 25; y++) {
    lifetime += yearOut;
    yearOut *= 1 - degradation;
  }
  return { lifetime, year25: annualKwh * Math.pow(1 - degradation, 24) };
}

export function computeEnergyReport(project: Project): EnergyReport {
  const panels = project.panels.filter((p) => p.enabled);
  const wp = project.components.panel?.watt ?? 0;
  const capacityKwp = (panels.length * wp) / 1000;
  // union, not sum — a mumty/stacked roof must not double-count its footprint
  const roofAreaM2 = roofsUnionAreaM2(project.roofs);

  // ── The hourly engine, whenever the site's typical year is in memory ──────
  // 8760 hours, module by module: sun, Perez sky, near shade by the hour,
  // incidence angle, soiling, module temperature, inverter curve, clipping.
  // The monthly estimate below is what stands in until the year has loaded.
  const tmyYear = peekTmy(project.location?.tmy);
  const hourly = tmyYear ? hourlyEnergyForProject(project, tmyYear) : null;
  if (hourly && project.location?.tmy) {
    const meta = project.location.tmy;
    const beamAccess =
      panels.length > 0 ? panels.reduce((s, p) => s + (p.solarAccess ?? 1), 0) / panels.length : 1;
    const electricalPct = electricalShadingLossPct(project);
    const degradation = 0.0075;
    const { lifetime, year25 } = lifetimeFrom(hourly.annualKwh, degradation);
    return {
      capacityKwp: Math.round(capacityKwp * 100) / 100,
      panelCount: panels.length,
      roofAreaM2: Math.round(roofAreaM2),
      poaFactor: hourly.ghiKwhM2 > 0 ? Math.round((hourly.poaKwhM2 / hourly.ghiKwhM2) * 1000) / 1000 : 1,
      annualMwh: Math.round(hourly.annualKwh / 100) / 10,
      annualKwh: hourly.annualKwh,
      specificYield: capacityKwp > 0 ? Math.round(hourly.annualKwh / capacityKwp) : 0,
      performanceRatio: hourly.prPct,
      monthlyKwh: hourly.monthlyKwh,
      monsoonMonths: MONSOON_MONTHS,
      losses: [
        ...hourly.losses.map((l) =>
          l.key === 'shading' && project.surround && project.ignoreSurround
            ? { ...l, label: `${l.label} — neighbour shade OFF by your choice` }
            : l,
        ),
        ...(electricalPct !== null && electricalPct > 0
          ? [{ key: 'shading_electrical', label: 'Shading — electrical (strings)', pct: electricalPct }]
          : []),
      ],
      totalLossPct: Math.round((100 - hourly.prPct) * 10) / 10,
      avgSolarAccessPct: Math.round((DIFFUSE_SHARE + (1 - DIFFUSE_SHARE) * beamAccess) * 100),
      lifetimeMwh25: Math.round(lifetime / 100) / 10,
      year25Mwh: Math.round(year25 / 100) / 10,
      degradationPctPerYear: degradation * 100,
      irradianceSource: 'PVGIS',
      engine: 'hourly',
      uncertainty: uncertaintyFor(hourly.annualKwh, activeWeather(project.location)),
      hourly: {
        radiationDb: meta.radiationDb,
        yearMin: meta.yearMin,
        yearMax: meta.yearMax,
        ghiKwhM2: hourly.ghiKwhM2,
        poaKwhM2: hourly.poaKwhM2,
        rearKwhM2: hourly.rearKwhM2,
        rearGainPct: hourly.rearGainPct,
        dcKwh: hourly.dcKwh,
        clippedKwh: hourly.clippedKwh,
        clippingHours: hourly.clippingHours,
        assumed: hourly.assumed,
      },
    };
  }
  const psh = project.location?.peakSunHours ?? 5.3;
  const avgAccess =
    panels.length > 0
      ? panels.reduce((s, p) => s + (p.solarAccess ?? 1), 0) / panels.length
      : 1;
  // tilt/azimuth actually change yield (audit R4/R5): mean plane-of-array factor
  const lat = project.location?.latLng.lat ?? 20;
  const lng = project.location?.latLng.lng ?? 77;
  const meanPoa =
    panels.length > 0
      ? panels.reduce(
          (s, p) => s + poaFactor(lat, lng, p.tiltDeg, p.azimuthDeg),
          0,
        ) / panels.length
      : 1;
  // ── Loss & shading composition (multiplicative; PVWatts convention) ──────
  // Equipment losses multiply into prEquip. Shading applies ONLY to the beam
  // component inside the plane-of-array term: a fully beam-shaded panel still
  // collects the diffuse share — the same definition the heatmap uses, so the
  // report and heatmap can never disagree about "access" again. The stored
  // per-panel solarAccess stays the raw BEAM-clear fraction from the raycast
  // engine; the diffuse floor is applied here with the measured monthly Kd
  // (or the DIFFUSE_SHARE fallback).
  const losses = equipmentLosses(project.components.inverter?.efficiencyPct ?? undefined);
  const prEquip = composeLosses(losses);
  const beamAccess = avgAccess; // raw beam-clear fraction, 0..1

  const weather = activeWeather(project.location);
  let annualKwh: number;
  let monthlyKwh: number[];
  let reportPoa = meanPoa;
  let irradianceSource: 'PVGIS' | 'estimate';
  // annual beam-shading factor on the delivered energy (1 = unshaded); the
  // effective "solar access" (diffuse-floored, GHI-weighted) for the report
  let shadeFactor: number;
  let effectiveAccess: number;
  // Inter-row self-shading is NOT a separate term (Phase 8): the modules are
  // shadow casters in the raycast engine, so row-on-row loss already lives
  // inside each panel's measured solarAccess — and therefore inside
  // `beamAccess` below. The Tier-1 analytical derate that used to multiply
  // here priced the same physics twice; tighter rows now show up as lower
  // access, which the "Shading (beam)" line reports.
  if (weather) {
    const meanBeamRatio =
      panels.length > 0
        ? panels.reduce((s, p) => s + poaBeamRatio(lat, lng, p.tiltDeg, p.azimuthDeg), 0) /
          panels.length
        : 1;
    let shadedSum = 0; // what's actually delivered (beamAccess)
    let unshadedSum = 0;
    const monthly = weather.monthlyGhi.map((ghiDay, m) => {
      const kd = weather.monthlyDiffuseFrac[m];
      const ghiMonth = ghiDay * DAYS_IN_MONTH[m];
      const poaShaded = kd + (1 - kd) * meanBeamRatio * beamAccess;
      const poaUnshaded = kd + (1 - kd) * meanBeamRatio;
      shadedSum += ghiMonth * poaShaded;
      unshadedSum += ghiMonth * poaUnshaded;
      return capacityKwp * ghiMonth * prEquip * poaShaded;
    });
    annualKwh = monthly.reduce((s, v) => s + v, 0);
    monthlyKwh = monthly.map((v) => Math.round(v));
    shadeFactor = unshadedSum > 0 ? shadedSum / unshadedSum : 1;
    // the ACCESS METRIC uses the fixed comparability floor — IDENTICAL to the
    // heatmap's colour metric (its kWh layer, like our energy, uses real Kd)
    effectiveAccess = DIFFUSE_SHARE + (1 - DIFFUSE_SHARE) * beamAccess;
    // effective annual POA/GHI factor (for the report's poaFactor readout)
    const baseline = capacityKwp * weather.annualGhi * 365 * prEquip;
    reportPoa = baseline > 0 ? annualKwh / baseline : meanPoa;
    irradianceSource = 'PVGIS';
  } else {
    const meanBeamRatioEst =
      panels.length > 0
        ? panels.reduce((s, p) => s + poaBeamRatio(lat, lng, p.tiltDeg, p.azimuthDeg), 0) /
          panels.length
        : 1;
    const poaShaded = DIFFUSE_SHARE + (1 - DIFFUSE_SHARE) * meanBeamRatioEst * beamAccess;
    const poaUnshaded = DIFFUSE_SHARE + (1 - DIFFUSE_SHARE) * meanBeamRatioEst;
    annualKwh = capacityKwp * psh * 365 * prEquip * poaShaded;
    reportPoa = poaShaded;
    shadeFactor = poaUnshaded > 0 ? poaShaded / poaUnshaded : 1;
    effectiveAccess = DIFFUSE_SHARE + (1 - DIFFUSE_SHARE) * beamAccess;
    const monthTotal = MONTH_FACTORS.reduce((s, f) => s + f, 0);
    monthlyKwh = MONTH_FACTORS.map((f) => Math.round((annualKwh * f) / monthTotal));
    irradianceSource = 'estimate';
  }
  // PR (display) includes equipment losses AND the beam-shading effect, but
  // excludes orientation (POA is the reference plane) — always within (0,1]
  const pr = Math.min(1, Math.max(0.005, prEquip * shadeFactor));
  const shadingLossPct = Math.max(0, (1 - shadeFactor) * 100);
  // series wiring: a shaded module pulls its whole string down — known only
  // once the full analysis has run this session and strings exist
  const electricalPct = electricalShadingLossPct(project);
  const reportLosses: LossItem[] = [
    ...losses,
    // includes obstruction AND row-on-row shading — one measured beam term
    {
      key: 'shading',
      label:
        project.surround && project.ignoreSurround
          ? 'Shading (beam) — neighbour shade OFF by your choice'
          : 'Shading (beam)',
      pct: Math.round(shadingLossPct * 10) / 10,
    },
    ...(electricalPct !== null && electricalPct > 0
      ? [{ key: 'shading_electrical', label: 'Shading — electrical (strings)', pct: electricalPct }]
      : []),
  ];
  const totalLossPct = Math.round((1 - pr) * 1000) / 10;
  const degradation = 0.0075;
  const { lifetime, year25 } = lifetimeFrom(annualKwh, degradation);
  return {
    capacityKwp: Math.round(capacityKwp * 100) / 100,
    panelCount: panels.length,
    roofAreaM2: Math.round(roofAreaM2),
    poaFactor: Math.round(reportPoa * 1000) / 1000,
    annualMwh: Math.round(annualKwh / 100) / 10,
    annualKwh,
    specificYield: capacityKwp > 0 ? Math.round(annualKwh / capacityKwp) : 0,
    performanceRatio: Math.round(pr * 1000) / 10,
    monthlyKwh,
    monsoonMonths: MONSOON_MONTHS,
    losses: reportLosses,
    totalLossPct,
    // the UNIFIED metric (diffuse-floored, = heatmap's definition)
    avgSolarAccessPct: Math.round(effectiveAccess * 100),
    lifetimeMwh25: Math.round(lifetime / 100) / 10,
    year25Mwh: Math.round(year25 / 100) / 10,
    degradationPctPerYear: degradation * 100,
    irradianceSource,
    engine: 'monthly',
    uncertainty: uncertaintyFor(annualKwh, weather),
  };
}

/**
 * Each enabled panel's share of the project's annual energy, in kWh.
 *
 * Deliberately a SPLIT of the ONE report number rather than a second energy
 * model (§A0): Σ shares === report.annualKwh by construction, so the on-panel
 * inspector can never quote a figure the report and proposal disagree with.
 * The report itself is a mean-field model (mean access × mean POA); this
 * inverts that mean by weighting each panel with its OWN beam access and
 * orientation — the two are consistent exactly because the total is fixed.
 *
 * Values are ESTIMATES of a share, not metered per-module output.
 */
export function panelEnergyShares(project: Project): Map<string, number> {
  const out = new Map<string, number>();
  const enabled = project.panels.filter((p) => p.enabled);
  if (enabled.length === 0) return out;
  const report = computeEnergyReport(project);
  const annualKwh = report.annualKwh;
  const lat = project.location?.latLng.lat ?? 20;
  const lng = project.location?.latLng.lng ?? 77;
  const weather = activeWeather(project.location);
  // annual mean diffuse fraction — the floor a fully beam-shaded module keeps
  const kd = weather
    ? weather.monthlyDiffuseFrac.reduce((s, v) => s + v, 0) / weather.monthlyDiffuseFrac.length
    : DIFFUSE_SHARE;
  const weights = enabled.map(
    (p) =>
      kd + (1 - kd) * poaBeamRatio(lat, lng, p.tiltDeg, p.azimuthDeg) * (p.solarAccess ?? 1),
  );
  const totalW = weights.reduce((s, v) => s + v, 0);
  if (totalW <= 0) return out;
  enabled.forEach((p, i) => out.set(p.id, (annualKwh * weights[i]) / totalW));
  return out;
}

export interface CasterCost {
  /** modules that lose any beam to it */
  modules: number;
  /** kWh a year the caster takes, beam share applied */
  kwhPerYear: number;
  /** of the plant's annual energy */
  pct: number;
}

/**
 * What one caster (an obstruction, a neighbour, a row of modules) costs the
 * plant. Reads the last full analysis, so it is null until that has run.
 *
 * Lives here rather than in string-shade.ts, where the rest of the shade
 * reading lives: it needs panelEnergyShares, which needs the report, which
 * needs string-shade — so keeping it down there tied the last knot in lib/.
 */
export function casterCost(project: Project, casterKey: string): CasterCost | null {
  const profile = profileFor(project);
  if (!profile) return null;
  const shares = panelEnergyShares(project);
  const beamShare = 1 - meanDiffuse(project);
  let modules = 0;
  let kwh = 0;
  let total = 0;
  for (const p of project.panels) {
    if (!p.enabled) continue;
    const e = shares.get(p.id) ?? 0;
    total += e;
    const frac = profile.byCaster.get(p.id)?.get(casterKey) ?? 0;
    if (frac <= 0) continue;
    modules++;
    // the module's energy already has the shade in it; what it WOULD make
    // without this caster is e / (1 − beamShare·frac) — the difference is the cost
    const denom = 1 - beamShare * frac;
    kwh += denom > 0 ? e / denom - e : 0;
  }
  return { modules, kwhPerYear: Math.round(kwh), pct: total > 0 ? Math.round((kwh / total) * 1000) / 10 : 0 };
}
