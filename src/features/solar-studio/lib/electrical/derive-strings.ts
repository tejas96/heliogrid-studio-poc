// ─── Derived strings that respect the user's hand-built ones ────────────────
// The planner (autostring.ts) is pure and complete for the AUTO case. This is
// the layer above it: keep every manual string that is still buildable, prune
// the ones that lost modules, drop the ones with nothing left — and say so —
// then plan the remaining modules around them on the MPPT inputs left over.
import type { Project, StringDef, ValidationIssue } from '../../types';
import { autoStringPlan } from './autostring';
import { inverterLoadsKwp } from './balance';
import { resolveDesignTemps } from './temps';

export interface ManualStringChange {
  id: string;
  name: string;
  change: 'pruned' | 'dropped';
  removedPanelIds: string[];
}

export interface DerivedStringPlan {
  strings: StringDef[];
  issues: ValidationIssue[];
  unstrungPanelIds: string[];
  /** never silent: every manual string the derivation had to touch */
  manualChanges: ManualStringChange[];
}

export function deriveStringPlan(project: Project): DerivedStringPlan {
  const panel = project.components.panel;
  const inverter = project.components.inverter;
  if (!panel || !inverter) return { strings: [], issues: [], unstrungPanelIds: [], manualChanges: [] };

  const enabled = new Set(project.panels.filter((p) => p.enabled).map((p) => p.id));
  const manualChanges: ManualStringChange[] = [];
  const kept: StringDef[] = [];
  const covered = new Set<string>();
  for (const s of project.strings) {
    if (!s.manual) continue;
    // a module may sit in ONE series circuit: the first manual string wins
    const alive = s.panelIds.filter((id) => enabled.has(id) && !covered.has(id));
    const removed = s.panelIds.filter((id) => !alive.includes(id));
    if (alive.length === 0) {
      manualChanges.push({ id: s.id, name: s.name, change: 'dropped', removedPanelIds: removed });
      continue;
    }
    if (removed.length > 0) {
      manualChanges.push({ id: s.id, name: s.name, change: 'pruned', removedPanelIds: removed });
    }
    for (const id of alive) covered.add(id);
    kept.push(removed.length > 0 ? { ...s, panelIds: alive } : s);
  }

  // the planner sees only the modules nobody owns; manual slots are reserved
  const view: Project = {
    ...project,
    panels: project.panels.map((p) => (covered.has(p.id) ? { ...p, enabled: false } : p)),
  };
  const auto = autoStringPlan(view, panel, inverter, project.components.inverterCount, resolveDesignTemps(project), {
    reservedSlots: kept.map((s) => ({ inverterIndex: s.inverterIndex, mpptIndex: s.mpptIndex })),
    // the balancer must see what the hand-made strings already load
    reservedKwp: inverterLoadsKwp(kept, panel, project.components.inverterCount),
    nameOffset: kept.length,
  });
  return {
    strings: [...kept, ...auto.strings],
    issues: auto.issues,
    unstrungPanelIds: auto.unstrungPanelIds,
    manualChanges,
  };
}
