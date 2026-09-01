// ─── Battery storage: where the cabinets stand and what cable they need ─────
import type { BatteryPlacement, Project, XY } from '../types';
import { inverterWorldPos } from './routing';
import { resolveRules } from '../data/rules/india';

/** Plan position of a cabinet: the point on its wall edge (same frame as inverters). */
export function batteryWorldPos(project: Project, bp: BatteryPlacement): XY | null {
  const roof = project.roofs.find((r) => r.id === bp.roofId);
  if (!roof) return null;
  const a = roof.polygon[bp.edgeIndex];
  const b = roof.polygon[(bp.edgeIndex + 1) % roof.polygon.length];
  if (!a || !b) return null;
  return { x: a.x + (b.x - a.x) * bp.t, y: a.y + (b.y - a.y) * bp.t };
}

/** Usable energy and power of the whole bank, from the selected spec × count. */
export function batteryBank(project: Project): { kwh: number; kw: number; count: number } | null {
  const spec = project.components.battery;
  if (!spec) return null;
  const count = Math.max(1, project.components.batteryCount ?? 1);
  return { kwh: spec.kwh * count, kw: spec.powerKw * count, count };
}

/**
 * Battery leads to BUY: each cabinet's pair to its nearest inverter (plan
 * distance + the wall drop), with the market slack. 'routed' only when every
 * cabinet AND an inverter stand on the drawing — otherwise the length is an
 * allowance and the BOM must say so.
 */
export function batteryCableFromPlacements(project: Project): {
  meters: number;
  routed: boolean;
  runs: number;
} {
  const spec = project.components.battery;
  if (!spec) return { meters: 0, routed: false, runs: 0 };
  const rules = resolveRules().cable;
  const count = Math.max(1, project.components.batteryCount ?? 1);
  const cabinets = project.batteryPlacements ?? [];
  const inverters = project.inverterPlacements.map((_, i) => inverterWorldPos(project, i)).filter(Boolean) as XY[];
  const ALLOWANCE_M = 3; // a cabinet beside its inverter, when nothing is placed yet
  let pathM = 0;
  let routedRuns = 0;
  for (const bp of cabinets) {
    const pos = batteryWorldPos(project, bp);
    if (!pos || inverters.length === 0) {
      pathM += ALLOWANCE_M;
      continue;
    }
    const nearest = inverters.reduce((m, ip) => Math.min(m, Math.hypot(ip.x - pos.x, ip.y - pos.y)), Infinity);
    // cabinet on the floor, inverter up the wall: the drop is part of the run
    pathM += nearest + rules.defaultVerticalDropM;
    routedRuns++;
  }
  // cabinets not yet placed still need leads — allowance each
  pathM += Math.max(0, count - cabinets.length) * ALLOWANCE_M;
  const meters = Math.round(pathM * 2 * (1 + rules.slackPct)); // + and − per cabinet
  return { meters, routed: cabinets.length >= count && routedRuns === cabinets.length, runs: count };
}
