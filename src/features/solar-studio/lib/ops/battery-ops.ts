// ─── Battery storage operations: cabinets at the foot of a wall ─────────────
import type { BatteryPlacement } from '../../types';
import type { XY } from '../../types';
import { defineOp } from './types';
import { registerOp } from './registry';
import { genId } from '../geo';

export const batteryPlace = defineOp<{
  roofId: string;
  edgeIndex: number;
  t: number;
  heightM: number;
  pos?: XY;
  level?: 'roof' | 'ground';
}>({
  id: 'battery.place',
  layer: 'electrical',
  label: () => 'Place battery',
  validate: (p, a) => {
    if (!p.components.battery) return { reason: 'Pick a battery in Components first' };
    return p.roofs.some((r) => r.id === a.roofId) ? null : { reason: 'Roof not found' };
  },
  apply: (p, a) => {
    const placement: BatteryPlacement = { id: genId('batp'), ...a };
    // one cabinet per battery unit in the design: past the count, the oldest goes
    const count = Math.max(1, p.components.batteryCount ?? 1);
    const next = [...(p.batteryPlacements ?? []), placement];
    return { batteryPlacements: next.length > count ? next.slice(-count) : next };
  },
});

export const batteryMove = defineOp<{
  id: string;
  roofId: string;
  edgeIndex: number;
  t: number;
  heightM?: number;
  pos?: XY;
  level?: 'roof' | 'ground';
}>({
  id: 'battery.move',
  layer: 'electrical',
  label: () => 'Move battery',
  validate: (p, a) =>
    (p.batteryPlacements ?? []).some((b) => b.id === a.id) ? null : { reason: 'Battery not found' },
  apply: (p, a) => ({
    batteryPlacements: (p.batteryPlacements ?? []).map((b) =>
      b.id === a.id
        ? {
            ...b,
            roofId: a.roofId,
            edgeIndex: a.edgeIndex,
            t: a.t,
            heightM: a.heightM ?? b.heightM,
            pos: a.pos,
            level: a.pos ? (a.level ?? b.level ?? 'ground') : undefined,
          }
        : b,
    ),
  }),
});

export const batteryRemove = defineOp<{ id: string }>({
  id: 'battery.remove',
  layer: 'electrical',
  label: () => 'Remove battery',
  validate: (p, a) =>
    (p.batteryPlacements ?? []).some((b) => b.id === a.id) ? null : { reason: 'Battery not found' },
  apply: (p, a) => ({ batteryPlacements: (p.batteryPlacements ?? []).filter((b) => b.id !== a.id) }),
});

for (const op of [batteryPlace, batteryMove, batteryRemove]) registerOp(op);
