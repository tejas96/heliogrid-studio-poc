// ─── Site operations: safety and access objects on the roof ─────────────────
import type { Keepout, LightningArrester, SafetyRail, Walkway, XY } from '../../types';
import { defineOp } from './types';
import { registerOp } from './registry';
import { genId } from '../geo';

export const arresterAdd = defineOp<{ roofId: string; pos: XY; heightMm: number }>({
  id: 'arrester.add',
  layer: 'design',
  label: () => 'Add lightning arrester',
  validate: (p, a) => (p.roofs.some((r) => r.id === a.roofId) ? null : { reason: 'Roof not found' }),
  apply: (p, a) => {
    const la: LightningArrester = { id: genId('la'), roofId: a.roofId, pos: a.pos, heightMm: a.heightMm };
    return { arresters: [...p.arresters, la] };
  },
});

export const arresterRemove = defineOp<{ id: string }>({
  id: 'arrester.remove',
  layer: 'design',
  label: () => 'Remove lightning arrester',
  apply: (p, a) => ({ arresters: p.arresters.filter((x) => x.id !== a.id) }),
});

export const walkwayAdd = defineOp<{ walkway: Walkway }>({
  id: 'walkway.add',
  layer: 'layout',
  label: (a) => `Add walkway (${Math.round(a.walkway.widthMm)} mm)`,
  validate: (p, a) => (p.roofs.some((r) => r.id === a.walkway.roofId) ? null : { reason: 'Roof not found' }),
  apply: (p, a) => ({ walkways: [...p.walkways, a.walkway] }),
});

export const walkwayRemove = defineOp<{ id: string }>({
  id: 'walkway.remove',
  layer: 'layout',
  label: () => 'Remove walkway',
  apply: (p, a) => ({ walkways: p.walkways.filter((w) => w.id !== a.id) }),
});

export const railAdd = defineOp<{ rail: SafetyRail }>({
  id: 'rail.add',
  layer: 'design',
  label: () => 'Add safety rail',
  validate: (p, a) => (p.roofs.some((r) => r.id === a.rail.roofId) ? null : { reason: 'Roof not found' }),
  apply: (p, a) => ({ rails: [...p.rails, a.rail] }),
});

export const railRemove = defineOp<{ id: string }>({
  id: 'rail.remove',
  layer: 'design',
  label: () => 'Remove safety rail',
  apply: (p, a) => ({ rails: p.rails.filter((r) => r.id !== a.id) }),
});

export const keepoutAdd = defineOp<{ keepout: Keepout }>({
  id: 'keepout.add',
  layer: 'layout',
  label: (a) => `Add ${a.keepout.kind.replace('_', ' ')} zone`,
  apply: (p, a) => ({ keepouts: [...p.keepouts, a.keepout] }),
});

export const keepoutRemove = defineOp<{ id: string }>({
  id: 'keepout.remove',
  layer: 'layout',
  label: () => 'Remove zone',
  apply: (p, a) => ({ keepouts: p.keepouts.filter((k) => k.id !== a.id) }),
});

for (const op of [arresterAdd, arresterRemove, walkwayAdd, walkwayRemove, railAdd, railRemove, keepoutAdd, keepoutRemove]) {
  registerOp(op);
}
