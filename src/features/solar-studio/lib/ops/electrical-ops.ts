// ─── Electrical operations: strings, routes, inverter and meter placement ───
import type { InverterPlacement, Project, StringDef, XY } from '../../types';
import { defineOp } from './types';
import { registerOp } from './registry';
import { resetStringsToAuto } from '../derive/electrical-sync';
import { STRING_COLORS } from '../electrical/window';
import { genId } from '../geo';
import { stringIdFor } from '../hash';

export const stringsResetToAuto = defineOp<Record<string, never>>({
  id: 'strings.resetToAuto',
  layer: 'electrical',
  label: () => 'Auto string',
  validate: (p) => (p.components.panel && p.components.inverter ? null : { reason: 'Select a panel and an inverter first' }),
  apply: (p) => resetStringsToAuto(p).patch,
});

export const stringsAddManual = defineOp<{ panelIds: string[] }>({
  id: 'strings.addManual',
  layer: 'electrical',
  label: (a) => `Wire ${a.panelIds.length} modules by hand`,
  validate: (p, a) => {
    if (!p.components.inverter) return { reason: 'Select an inverter first' };
    if (a.panelIds.length === 0) return { reason: 'Pick at least one module' };
    const byId = new Map(p.panels.map((m) => [m.id, m]));
    for (const id of a.panelIds) {
      const m = byId.get(id);
      if (!m) return { reason: 'Module not found' };
      if (!m.enabled) return { reason: 'A disabled module cannot be wired — enable it first' };
      const owner = p.strings.find((s) => s.manual && s.panelIds.includes(id));
      if (owner) return { reason: `That module is already wired into ${owner.name}` };
    }
    return null;
  },
  apply: (p, a) => {
    const inverter = p.components.inverter!;
    const idx = p.strings.length;
    const s: StringDef = {
      id: stringIdFor(a.panelIds),
      name: `String ${idx + 1}`,
      inverterIndex: Math.floor(idx / inverter.mppt.count) % Math.max(1, p.components.inverterCount),
      mpptIndex: idx % inverter.mppt.count,
      panelIds: a.panelIds,
      color: STRING_COLORS[idx % STRING_COLORS.length],
      manual: true,
    };
    // the auto strings re-derive around it (lib/derive/electrical-sync)
    return { strings: [...p.strings.filter((x) => x.manual), s] };
  },
});

export const routesMoveWaypoint = defineOp<{ routeId: string; index: number; pos: XY; insert: boolean }>({
  id: 'routes.moveWaypoint',
  layer: 'electrical',
  label: (a) => (a.insert ? 'Add a cable corner' : 'Move a cable corner'),
  validate: (p, a) => ((p.cableRoutes ?? []).some((r) => r.id === a.routeId) ? null : { reason: 'Route not found' }),
  apply: (p, a) => ({
    cableRoutes: (p.cableRoutes ?? []).map((r) =>
      r.id === a.routeId
        ? {
            ...r,
            waypoints: a.insert
              ? [...r.waypoints.slice(0, a.index), a.pos, ...r.waypoints.slice(a.index)]
              : r.waypoints.map((w, i) => (i === a.index ? a.pos : w)),
            // hand-edited: auto-routing must never stomp it
            manual: true,
          }
        : r,
    ),
  }),
});

export const inverterPlace = defineOp<{ roofId: string; edgeIndex: number; t: number; heightM: number }>({
  id: 'inverter.place',
  layer: 'electrical',
  label: () => 'Place inverter',
  validate: (p, a) => (p.roofs.some((r) => r.id === a.roofId) ? null : { reason: 'Roof not found' }),
  apply: (p, a) => {
    const placement: InverterPlacement = { id: genId('invp'), ...a };
    // one placement per inverter in the design: past the count, the oldest goes
    const count = Math.max(1, p.components.inverterCount);
    const next = [...p.inverterPlacements, placement];
    return { inverterPlacements: next.length > count ? next.slice(-count) : next };
  },
});

export const inverterMove = defineOp<{ id: string; roofId: string; edgeIndex: number; t: number; heightM?: number }>({
  id: 'inverter.move',
  layer: 'electrical',
  label: () => 'Move inverter',
  validate: (p, a) => (p.inverterPlacements.some((i) => i.id === a.id) ? null : { reason: 'Inverter not found' }),
  apply: (p, a) => ({
    inverterPlacements: p.inverterPlacements.map((i) =>
      i.id === a.id ? { ...i, roofId: a.roofId, edgeIndex: a.edgeIndex, t: a.t, heightM: a.heightM ?? i.heightM } : i,
    ),
  }),
});

export const inverterRemove = defineOp<{ id: string }>({
  id: 'inverter.remove',
  layer: 'electrical',
  label: () => 'Remove inverter',
  apply: (p, a) => ({ inverterPlacements: p.inverterPlacements.filter((i) => i.id !== a.id) }),
});

export const meterPlace = defineOp<{ pos: XY }>({
  id: 'meter.place',
  layer: 'electrical',
  label: () => 'Place meter',
  apply: (_p, a) => ({ gridConnection: { pos: a.pos } }),
});

export const meterRemove = defineOp<Record<string, never>>({
  id: 'meter.remove',
  layer: 'electrical',
  label: () => 'Remove meter',
  apply: () => ({ gridConnection: null }),
});

for (const op of [
  stringsResetToAuto,
  stringsAddManual,
  routesMoveWaypoint,
  inverterPlace,
  inverterMove,
  inverterRemove,
  meterPlace,
  meterRemove,
]) {
  registerOp(op);
}
