// ─── Re-derive strings and routes when their inputs move ────────────────────
// Pure. The hook (store/useElectricalSync) and the ops kernel (lib/ops/run)
// both call this, so the browser and the tests agree on what "fresh" means.
import type { Project } from '../../types';
import { deriveStringPlan, type DerivedStringPlan } from '../electrical/derive-strings';
import { autoRouteAc, autoRouteBattery, autoRouteStrings } from '../routing';
import { routesInputFp, stringsInputFp } from './freshness';

export interface ElectricalSyncReport {
  restrung: boolean;
  rerouted: boolean;
  plan: DerivedStringPlan | null;
}

export interface ElectricalSyncResult {
  patch: Partial<Project>;
  next: Project;
  report: ElectricalSyncReport;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Returns the patch that makes strings and routes current — or null when they
 * already are. The stamps are taken from the OUTPUT (`next`), so a derivation
 * that prunes a manual string converges in one pass instead of two.
 */
export function syncElectrical(p: Project): ElectricalSyncResult | null {
  if (!p.components.panel || !p.components.inverter) return null;
  let next = p;
  const patch: Partial<Project> = {};
  let restrung = false;
  let rerouted = false;
  let plan: DerivedStringPlan | null = null;

  if (p.derived.stringsFp !== stringsInputFp(p)) {
    plan = deriveStringPlan(p);
    if (!same(plan.strings, p.strings)) {
      restrung = true;
      patch.strings = plan.strings;
    }
    next = { ...next, strings: plan.strings };
    next = { ...next, derived: { ...next.derived, stringsFp: stringsInputFp(next) } };
  }

  if (next.derived.routesFp !== routesInputFp(next)) {
    const routes = [...autoRouteStrings(next), ...autoRouteAc(next), ...autoRouteBattery(next)];
    const had = next.cableRoutes ?? [];
    if (!same(routes, had)) {
      rerouted = true;
      patch.cableRoutes = routes;
      next = { ...next, cableRoutes: routes };
    }
    next = { ...next, derived: { ...next.derived, routesFp: routesInputFp(next) } };
  }

  if (next === p) return null;
  patch.derived = next.derived;
  return { patch, next, report: { restrung, rerouted, plan } };
}

/** "Auto string" as a user action: hand-built strings go, everything re-derives. */
export function resetStringsToAuto(p: Project): ElectricalSyncResult {
  const cleared: Project = {
    ...p,
    strings: p.strings.filter((s) => !s.manual),
    derived: { ...p.derived, stringsFp: null, routesFp: null },
  };
  const r = syncElectrical(cleared);
  if (r) return { ...r, patch: { ...r.patch, strings: r.next.strings, cableRoutes: r.next.cableRoutes } };
  return { patch: { strings: cleared.strings, derived: cleared.derived }, next: cleared, report: { restrung: false, rerouted: false, plan: null } };
}
