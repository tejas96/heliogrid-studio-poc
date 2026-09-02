// ─── Shade as a string sees it, and what each caster costs ──────────────────
// A module's solar access is one number. A string is wired in series: at any
// hour its current is set by its weakest module (unless that module's bypass
// diode drops it out). So the same shade costs MORE than the average of the
// modules says — PVsyst calls this "electrical shading according to strings".
// These helpers read the last full analysis (shade-profile-cache) and say
// both numbers, and turn a caster's blocked rays into kWh a year.
import type { Project } from '../types';
import { peekShadeProfile, type ShadeProfile } from './shade-profile-cache';
import { panelEnergyShares, activeWeather } from './solar';

const DIFFUSE_FALLBACK = 0.35;
/** a module this far below the string's best is taken as bypassed (diode conducts) */
const BYPASS_BELOW = 0.5;

export function profileFor(project: Project): ShadeProfile | null {
  return peekShadeProfile(project.derived?.solarAccessFp ?? null);
}

export interface StringShade {
  /** irradiance-weighted mean access of the string's modules (what "linear" shading assumes) */
  linear: number;
  /** the string's access when its current follows the weakest module each hour, bypass diodes allowed */
  electrical: number;
  /** annual access of the weakest module */
  worstModule: number;
  /** 1 − electrical / linear, as a fraction of the string's beam energy */
  mismatchLoss: number;
  moduleCount: number;
}

/**
 * Per sample: a string's beam factor. Modules whose clear fraction is far
 * below the best module are bypassed — they contribute nothing but no longer
 * hold the string's current down; the rest run at the weakest survivor.
 */
function stringFactorAt(vals: number[]): number {
  const live = vals.filter((v) => v >= 0);
  if (live.length === 0) return -1;
  const best = Math.max(...live);
  if (best <= 0) return 0;
  const kept = live.filter((v) => v >= best * BYPASS_BELOW);
  const bypassed = live.length - kept.length;
  const limited = Math.min(...kept);
  // bypassed modules lose their own share; the survivors run at the weakest survivor
  return (limited * (live.length - bypassed)) / live.length;
}

export function stringShade(project: Project, stringId: string): StringShade | null {
  const profile = profileFor(project);
  const s = project.strings.find((x) => x.id === stringId);
  if (!profile || !s) return null;
  const rows = s.panelIds.map((id) => profile.bySample.get(id)).filter((r): r is Float32Array => !!r);
  if (rows.length === 0) return null;
  let wLin = 0;
  let wEle = 0;
  let wTot = 0;
  profile.samples.forEach((smp, i) => {
    const vals = rows.map((r) => r[i]);
    const live = vals.filter((v) => v >= 0);
    if (live.length === 0) return;
    const w = smp.weight;
    wTot += w;
    wLin += (w * live.reduce((a, v) => a + v, 0)) / live.length;
    wEle += w * Math.max(0, stringFactorAt(vals));
  });
  if (wTot <= 0) return null;
  const linear = wLin / wTot;
  const electrical = wEle / wTot;
  const worst = Math.min(...s.panelIds.map((id) => profile.access.get(id) ?? 1));
  return {
    linear,
    electrical,
    worstModule: worst,
    mismatchLoss: linear > 0 ? Math.max(0, 1 - electrical / linear) : 0,
    moduleCount: rows.length,
  };
}

/**
 * Whole-plant electrical shading loss, as a percentage of the strings' beam
 * energy: what wiring in series costs on top of the module-by-module shade
 * the report already carries. Null until the analysis has run.
 */
export function electricalShadingLossPct(project: Project): number | null {
  if (!profileFor(project) || project.strings.length === 0) return null;
  let lin = 0;
  let ele = 0;
  for (const s of project.strings) {
    const st = stringShade(project, s.id);
    if (!st) continue;
    lin += st.linear * st.moduleCount;
    ele += st.electrical * st.moduleCount;
  }
  if (lin <= 0) return null;
  const beamShare = 1 - meanDiffuse(project);
  return Math.round(beamShare * (1 - ele / lin) * 1000) / 10;
}

function meanDiffuse(project: Project): number {
  const w = activeWeather(project.location);
  return w ? w.monthlyDiffuseFrac.reduce((a, v) => a + v, 0) / w.monthlyDiffuseFrac.length : DIFFUSE_FALLBACK;
}

export interface CasterCost {
  /** modules that lose any beam to it */
  modules: number;
  /** kWh a year the caster takes, beam share applied */
  kwhPerYear: number;
  /** of the plant's annual energy */
  pct: number;
}

/** What one caster (an obstruction, a neighbour, a row of modules) costs the plant. */
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
