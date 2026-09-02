// ─── Cable loss from the design's REAL runs ─────────────────────────────────
// The cable schedule already knows every run: the two home-run conductors of
// each string (their plan length, roof-edge drops and slack), the size the
// string fuse demands, and each inverter's AC run with the size the drop
// limit demands. The engine reads the same runs, so the wiring loss on the
// report is the loss of the cables that will be bought — not a typed 1.5%.
// Where the runs are not there yet, the assumed figures stand and say so.
import type { Project } from '../../types';
import { dcCableSizeMm2, sizeAcCable } from '../electrical-sizing';
import { polylineLengthM } from '../routing';

/** Copper at ~45 °C conductor temperature, Ω·mm²/m (0.0172 at 20 °C, +0.393%/K). */
const RHO_CU_45C = 0.0172 * (1 + 0.00393 * 25);
export const DC_ASSUMED_FRAC = 0.015;
export const AC_ASSUMED_FRAC = 0.005;

export interface DcCableLoss {
  /** loss at STC current as a fraction of the array's STC power (scales with the load) */
  fraction: number;
  source: 'routes' | 'assumed';
  /** how much of the array is covered by routed strings, by STC power */
  strings: number;
  stringsRouted: number;
  /** total conductor length of the routed strings, metres (both legs, slack included) */
  conductorM: number;
  mm2: number | null;
}

/**
 * I²R over every routed string's two conductors at the module's Imp, against
 * the string's STC power. Strings without both home-run legs fall back to the
 * assumed figure for their share; the result is the power-weighted mix.
 */
export function dcCableLossAtStc(project: Project): DcCableLoss {
  const spec = project.components.panel;
  const routes = project.cableRoutes ?? [];
  const strings = project.strings;
  if (!spec || strings.length === 0) {
    return { fraction: DC_ASSUMED_FRAC, source: 'assumed', strings: strings.length, stringsRouted: 0, conductorM: 0, mm2: null };
  }
  const mm2 = dcCableSizeMm2(spec);
  let lossW = 0;
  let powerW = 0;
  let routed = 0;
  let conductorM = 0;
  for (const s of strings) {
    const legs = routes.filter((r) => r.kind === 'string_homerun' && r.fromRef === s.id);
    const pString = s.panelIds.length * spec.watt;
    powerW += pString;
    if (legs.length < 2 || pString <= 0) {
      lossW += pString * DC_ASSUMED_FRAC;
      continue;
    }
    const lengthM = legs.reduce((sum, r) => sum + (polylineLengthM(r.waypoints) + r.verticalDropM) * (1 + r.slackPct), 0);
    const rLoop = (RHO_CU_45C * lengthM) / mm2;
    lossW += spec.impA * spec.impA * rLoop;
    routed++;
    conductorM += lengthM;
  }
  if (powerW <= 0 || routed === 0) {
    return { fraction: DC_ASSUMED_FRAC, source: 'assumed', strings: strings.length, stringsRouted: 0, conductorM: 0, mm2 };
  }
  return {
    fraction: Math.min(0.1, lossW / powerW),
    source: 'routes',
    strings: strings.length,
    stringsRouted: routed,
    conductorM: Math.round(conductorM),
    mm2,
  };
}

export interface AcCableLoss {
  /** loss at full inverter output as a fraction (scales with the load) */
  fraction: number;
  source: 'routes' | 'assumed';
  runs: number;
}

/**
 * Each inverter's AC run at its full output, plus the ACDB → meter main at the
 * total: a resistive drop at unity power factor loses the same fraction of
 * power as of voltage, so the sizing's own drop figure is the loss.
 */
export function acCableLossAtFullLoad(project: Project): AcCableLoss {
  const inv = project.components.inverter;
  const routes = (project.cableRoutes ?? []).filter((r) => r.kind === 'inverter_ac');
  if (!inv || routes.length === 0) return { fraction: AC_ASSUMED_FRAC, source: 'assumed', runs: 0 };
  const count = Math.max(1, project.components.inverterCount || 1);
  const totalKw = inv.acKw * count;
  let weighted = 0;
  let main = 0;
  let perInverter = 0;
  for (const r of routes) {
    const runM = polylineLengthM(r.waypoints) + r.verticalDropM;
    if (r.fromRef === 'acdb') {
      main += sizeAcCable(totalKw, inv.phases, runM).voltDropPct / 100;
    } else {
      weighted += sizeAcCable(inv.acKw, inv.phases, runM).voltDropPct / 100;
      perInverter++;
    }
  }
  const inverterLeg = perInverter > 0 ? weighted / perInverter : 0;
  return { fraction: Math.min(0.1, inverterLeg + main), source: 'routes', runs: routes.length };
}
