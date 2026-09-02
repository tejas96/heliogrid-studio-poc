// ─── String operations that the 3D string card needs beyond the planner ─────
import { defineOp } from './types';
import { registerOp } from './registry';

/**
 * Un-wire a HAND-MADE string. Its modules go back to the planner, which
 * re-strings them with the rest (lib/derive/electrical-sync). A planner
 * string cannot be removed on its own — it would simply be re-derived; use
 * strings.resetToAuto or wire the modules by hand instead.
 */
export const stringRemove = defineOp<{ id: string }>({
  id: 'string.remove',
  layer: 'electrical',
  label: () => 'Un-wire string',
  validate: (p, a) => {
    const s = p.strings.find((x) => x.id === a.id);
    if (!s) return { reason: 'String not found' };
    if (!s.manual) return { reason: 'That string is planned automatically — wire it by hand to change it' };
    return null;
  },
  apply: (p, a) => ({ strings: p.strings.filter((x) => x.id !== a.id) }),
});

registerOp(stringRemove);
