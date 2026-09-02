// ─── DCDB / ACDB enclosures on walls ────────────────────────────────────────
import type { ElectricalBox, XY } from '../../types';
import { defineOp } from './types';
import { registerOp } from './registry';
import { genId } from '../geo';

const NAME: Record<ElectricalBox['kind'], string> = { dcdb: 'DCDB', acdb: 'ACDB' };

export const boxPlace = defineOp<{
  kind: ElectricalBox['kind'];
  roofId: string;
  edgeIndex: number;
  t: number;
  heightM: number;
  pos?: XY;
  level?: 'roof' | 'ground';
}>({
  id: 'box.place',
  layer: 'electrical',
  label: (a) => `Place ${NAME[a.kind]}`,
  validate: (p, a) => (p.roofs.some((r) => r.id === a.roofId) ? null : { reason: 'Roof not found' }),
  apply: (p, a) => ({
    electricalBoxes: [...(p.electricalBoxes ?? []), { id: genId('box'), ...a }],
  }),
});

export const boxMove = defineOp<{
  id: string;
  roofId: string;
  edgeIndex: number;
  t: number;
  heightM?: number;
  pos?: XY;
  level?: 'roof' | 'ground';
}>({
  id: 'box.move',
  layer: 'electrical',
  label: () => 'Move box',
  validate: (p, a) => ((p.electricalBoxes ?? []).some((b) => b.id === a.id) ? null : { reason: 'Box not found' }),
  apply: (p, a) => ({
    electricalBoxes: (p.electricalBoxes ?? []).map((b) =>
      b.id === a.id
        ? {
            ...b,
            roofId: a.roofId,
            edgeIndex: a.edgeIndex,
            t: a.t,
            heightM: a.heightM ?? b.heightM,
            pos: a.pos,
            level: a.pos ? (a.level ?? b.level ?? 'roof') : undefined,
          }
        : b,
    ),
  }),
});

export const boxRemove = defineOp<{ id: string }>({
  id: 'box.remove',
  layer: 'electrical',
  label: () => 'Remove box',
  validate: (p, a) => ((p.electricalBoxes ?? []).some((b) => b.id === a.id) ? null : { reason: 'Box not found' }),
  apply: (p, a) => ({ electricalBoxes: (p.electricalBoxes ?? []).filter((b) => b.id !== a.id) }),
});

for (const op of [boxPlace, boxMove, boxRemove]) registerOp(op);
