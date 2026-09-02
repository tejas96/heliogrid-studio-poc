// ─── Cable route operations beyond moving a corner ──────────────────────────
import { defineOp } from './types';
import { registerOp } from './registry';
import { autoRouteAc, autoRouteBattery, autoRouteStrings } from '../routing';

/**
 * Give a hand-edited run back to the router. The route loses its `manual`
 * flag and the router re-draws it around the current obstacles; every OTHER
 * hand-edited run is kept exactly as it is.
 */
export const routeResetToAuto = defineOp<{ id: string }>({
  id: 'route.resetToAuto',
  layer: 'electrical',
  label: () => 'Re-route automatically',
  validate: (p, a) => {
    const r = (p.cableRoutes ?? []).find((x) => x.id === a.id);
    if (!r) return { reason: 'Route not found' };
    if (!r.manual) return { reason: 'That run is already routed automatically' };
    return null;
  },
  apply: (p, a) => {
    const released = { ...p, cableRoutes: (p.cableRoutes ?? []).map((r) => (r.id === a.id ? { ...r, manual: false } : r)) };
    return { cableRoutes: [...autoRouteStrings(released), ...autoRouteAc(released), ...autoRouteBattery(released)] };
  },
});

registerOp(routeResetToAuto);
