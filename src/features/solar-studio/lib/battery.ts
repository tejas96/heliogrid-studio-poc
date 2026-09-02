// ─── Battery storage: where the cabinets stand and what cable they need ─────
import type { BatteryPlacement, Project, XY } from '../types';
import { inverterWorldPos, routeLengthM } from './routing';
import { unitPlanPos } from './unit-pos';
import { resolveRules } from '../data/rules/india';

/**
 * Unit vector pointing OUT of the building from roof edge `edgeIndex` (plan
 * frame). Wall-mounted units hang on the OUTSIDE face, so the 3D box is pushed
 * half its depth along this vector instead of straddling the wall line.
 */
export function wallOutward(roof: { polygon: XY[] }, edgeIndex: number): XY {
  const n = roof.polygon.length;
  const a = roof.polygon[edgeIndex];
  const b = roof.polygon[(edgeIndex + 1) % n];
  if (!a || !b) return { x: 0, y: 0 };
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len = Math.hypot(ex, ey) || 1;
  let nx = ey / len;
  let ny = -ex / len;
  const c = roof.polygon.reduce((s, p) => ({ x: s.x + p.x / n, y: s.y + p.y / n }), { x: 0, y: 0 });
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if ((mx - c.x) * nx + (my - c.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

/** Plan position of a cabinet: the point on its wall edge (same frame as inverters). */
export function batteryWorldPos(project: Project, bp: BatteryPlacement): XY | null {
  return unitPlanPos(project, bp);
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
  // routed leads win: the 3D model draws these same runs, so the sheet, the
  // model and the BOM cannot disagree
  const leads = (project.cableRoutes ?? []).filter((r) => r.kind === 'battery_dc');
  if (leads.length > 0 && cabinets.length >= count && leads.length >= cabinets.length) {
    const pathM = leads.reduce((s, r) => s + routeLengthM(r), 0);
    return { meters: Math.round(pathM * 2), routed: true, runs: count }; // + and − per cabinet
  }
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
