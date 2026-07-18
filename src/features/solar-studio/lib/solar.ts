// ─── Solar math: sun position (NOAA-style), sunrise/sunset, energy model ───
import type { EnergyReport, LatLng, LossItem, PlacedPanel, Project, SiteLocation, SiteWeather } from '../types';
import { DIFFUSE_SHARE, poaFactor, poaBeamRatio } from './poa';
import { DAYS_IN_MONTH } from './pvgis';
import { roofsUnionAreaM2 } from './roof-topology';

// Astronomical core lives in lib/sun.ts (kept acyclic for physics modules);
// re-exported here so every existing `from './solar'` import keeps working.
export { sunPosition, solarHourDate, sunriseSunset, type SunPos } from './sun';

export function fmtHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

/** Mock irradiance model for India by latitude (kWh/m²/day annual mean). */
export function mockIrradiance(lat: number): number {
  // 4.8–5.8 band across India, peaking around 23–27°N (Rajasthan/Gujarat)
  const base = 5.6 - Math.abs(lat - 24) * 0.045;
  return Math.round(Math.max(4.6, Math.min(5.9, base)) * 100) / 100;
}

/** Monthly shape for Indian sites; monsoon dip Jun–Sep. */
const MONTH_FACTORS = [
  0.95, 1.0, 1.12, 1.13, 1.15, 0.88, 0.78, 0.8, 0.86, 1.02, 0.98, 0.93,
];
export const MONSOON_MONTHS = [5, 6, 7, 8]; // Jun..Sep (0-indexed)

/**
 * Equipment loss items (percent each). Losses COMPOSE MULTIPLICATIVELY —
 * PVWatts/PVsyst convention: PR = Π(1−lᵢ) — never by addition (the old
 * additive sum could push PR negative under heavy shading). The inverter
 * line is derived from the selected inverter's datasheet efficiency; 3.0%
 * is the fallback before one is chosen.
 * Shading is NOT in this list: it applies to the BEAM component only,
 * inside the plane-of-array composition (see computeEnergyReport) — a fully
 * beam-shaded panel still collects diffuse light.
 */
export function equipmentLosses(inverterEfficiencyPct?: number): LossItem[] {
  const invLoss =
    inverterEfficiencyPct && inverterEfficiencyPct > 50 && inverterEfficiencyPct < 100
      ? Math.round((100 - inverterEfficiencyPct) * 10) / 10
      : 3.0;
  return [
    { key: 'temperature', label: 'Temperature', pct: 8.1 },
    { key: 'soiling', label: 'Soiling', pct: 3.0 },
    { key: 'inverter', label: 'Inverter', pct: invLoss },
    { key: 'mismatch', label: 'Mismatch', pct: 2.0 },
    { key: 'dc_wiring', label: 'DC Wiring', pct: 2.0 },
  ];
}

/** Multiplicative composition, clamped to (0,1]: PR = Π(1−lᵢ). */
export function composeLosses(losses: LossItem[]): number {
  const pr = losses.reduce((acc, l) => acc * (1 - Math.min(100, Math.max(0, l.pct)) / 100), 1);
  return Math.min(1, Math.max(0.005, pr));
}

/**
 * The site's measured weather, but ONLY if it was fetched for the current pin.
 * A rehydrated project whose pin moved (or any path that changed latLng without
 * refetching) falls back to the estimate rather than lying with old-pin numbers.
 */
/** True when two lat/lng points agree within `tolDeg` on both axes. */
export function latLngNear(a: LatLng, b: LatLng, tolDeg: number): boolean {
  return Math.abs(a.lat - b.lat) <= tolDeg && Math.abs(a.lng - b.lng) <= tolDeg;
}

export function activeWeather(location: SiteLocation | null): SiteWeather | undefined {
  const w = location?.weather;
  if (!w || !location) return undefined;
  // ~11 m — a rehydrated project whose pin drifted this far keeps its weather;
  // a real relocation is far larger and correctly invalidates it
  return latLngNear(w.forLatLng, location.latLng, 1e-4) ? w : undefined;
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

export function computeEnergyReport(project: Project): EnergyReport {
  const panels = project.panels.filter((p) => p.enabled);
  const wp = project.components.panel?.watt ?? 0;
  const capacityKwp = (panels.length * wp) / 1000;
  // union, not sum — a mumty/stacked roof must not double-count its footprint
  const roofAreaM2 = roofsUnionAreaM2(project.roofs);
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
  const reportLosses: LossItem[] = [
    ...losses,
    // includes obstruction AND row-on-row shading — one measured beam term
    { key: 'shading', label: 'Shading (beam)', pct: Math.round(shadingLossPct * 10) / 10 },
  ];
  const totalLossPct = Math.round((1 - pr) * 1000) / 10;
  const degradation = 0.0075;
  let lifetime = 0;
  let yearOut = annualKwh;
  for (let y = 0; y < 25; y++) {
    lifetime += yearOut;
    yearOut *= 1 - degradation;
  }
  const year25 = annualKwh * Math.pow(1 - degradation, 24);
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
  };
}

/** Suggested kWp from a monthly bill (improvement: consumption-based sizing). */
export function suggestKwpFromBill(
  monthlyBillInr: number,
  tariff: number,
  psh: number,
): number {
  const monthlyKwh = monthlyBillInr / Math.max(1, tariff);
  const kwp = monthlyKwh / (psh * 30 * 0.8);
  return Math.round(kwp * 10) / 10;
}

/** Per-panel solar access – cheap analytic version used before 3D raycast runs. */
export function estimateSolarAccess(_panel: PlacedPanel): number {
  return 1;
}
