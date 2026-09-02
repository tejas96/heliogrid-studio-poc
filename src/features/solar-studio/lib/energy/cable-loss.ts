// ─── Cable loss from the design's REAL runs ─────────────────────────────────
// The cable schedule already knows every run: the two home-run conductors of
// each string (their plan length and roof-edge drops), the section each string
// was SIZED to (fuse rating, then the drop over its loop), and each inverter's
// AC run with the size the drop limit demands. The engine reads the same runs
// and the same sizes, so the wiring loss on the report is the loss of the
// cables that will be bought — not a typed 1.5%. Where the runs are not there
// yet, the assumed figures stand and say so.
import type { Project } from '../../types';
import { dcLoopResistanceOhm, sizeAcCable } from '../electrical-sizing';
import { dcSizeLabel, dcStringCables } from '../electrical/dc-cable';
import { polylineLengthM } from '../routing';

export const DC_ASSUMED_FRAC = 0.015;
export const AC_ASSUMED_FRAC = 0.005;

export interface DcCableLoss {
  /** loss at STC current as a fraction of the array's STC power (scales with the load) */
  fraction: number;
  source: 'routes' | 'assumed';
  /** how much of the array is covered by routed strings, by STC power */
  strings: number;
  stringsRouted: number;
  /** electrical conductor length of the routed strings, metres (both legs) */
  conductorM: number;
  /** the sizes in use across the routed strings, e.g. "4" or "4 + 6" */
  sizes: string;
}

/**
 * I²R over every routed string's loop at the module's Imp, at the section the
 * string was sized to, against the string's STC power. Strings with no home
 * run yet fall back to the assumed figure for their share; the result is the
 * power-weighted mix.
 */
export function dcCableLossAtStc(project: Project): DcCableLoss {
  const spec = project.components.panel;
  const cables = dcStringCables(project);
  const assumed = (strings: number): DcCableLoss => ({
    fraction: DC_ASSUMED_FRAC,
    source: 'assumed',
    strings,
    stringsRouted: 0,
    conductorM: 0,
    sizes: '',
  });
  if (!spec || cables.length === 0) return assumed(project.strings.length);
  let lossW = 0;
  let powerW = 0;
  let routed = 0;
  let conductorM = 0;
  const sizes = new Set<number>();
  for (const c of cables) {
    const pString = c.string.panelIds.length * spec.watt;
    powerW += pString;
    if (c.loopM === null || pString <= 0) {
      lossW += pString * DC_ASSUMED_FRAC;
      continue;
    }
    lossW += spec.impA * spec.impA * dcLoopResistanceOhm(c.loopM, c.mm2);
    routed++;
    conductorM += c.loopM;
    sizes.add(c.mm2);
  }
  if (powerW <= 0 || routed === 0) return assumed(cables.length);
  return {
    fraction: Math.min(0.1, lossW / powerW),
    source: 'routes',
    strings: cables.length,
    stringsRouted: routed,
    conductorM: Math.round(conductorM),
    sizes: dcSizeLabel([...sizes].sort((a, b) => a - b)),
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
