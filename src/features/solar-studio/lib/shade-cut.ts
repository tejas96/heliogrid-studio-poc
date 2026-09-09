// ─── "What if I drop everything under NN %?" — the question, answered ───────
//
// The DRC flags modules below one fixed 70 % cutoff and stops there. An EPC
// working a shaded roof asks the question with a number of their own — 85 %
// on a premium quote, 60 % on a tight one — and wants to see what goes before
// it goes: how many modules, how much capacity, on which roof. This is the
// pure half of that sheet; the screen adds the energy split and the button.
import type { Project } from '../types';

export interface ShadeCut {
  /** enabled modules whose direct-beam access is below the cutoff */
  ids: string[];
  /** how many of them stand on each roof, in roof order */
  byRoof: { roofId: string; name: string; count: number }[];
  /** their capacity, kWp */
  kwp: number;
  /** enabled modules in the design, for "K of N" */
  total: number;
}

/**
 * The modules a cutoff would remove. `cutoffPct` is direct-sun access, 0–100:
 * a module below it is out. Disabled modules are neither counted nor cut —
 * they are already switched off.
 */
export function shadedBelow(project: Project, cutoffPct: number): ShadeCut {
  const enabled = project.panels.filter((p) => p.enabled);
  const cut = enabled.filter((p) => (p.solarAccess ?? 1) * 100 < cutoffPct);
  const counts = new Map<string, number>();
  for (const p of cut) counts.set(p.roofId, (counts.get(p.roofId) ?? 0) + 1);
  const byRoof = project.roofs
    .filter((r) => counts.has(r.id))
    .map((r) => ({ roofId: r.id, name: r.name, count: counts.get(r.id)! }));
  const wp = project.components.panel?.watt ?? 0;
  return {
    ids: cut.map((p) => p.id),
    byRoof,
    kwp: Math.round((cut.length * wp) / 10) / 100,
    total: enabled.length,
  };
}
